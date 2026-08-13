from __future__ import annotations

import logging

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import HasModulePermission, get_shop
from apps.core.storage import is_storage_configured

from .models import OcrResult
from .serializers import (
    OcrResultDetailSerializer,
    SupplierInvoiceUploadRequestSerializer,
    SupplierInvoiceUploadResponseSerializer,
    ValidateInvoiceReviewRequestSerializer,
)
from .services import (
    OcrResultNotReviewableError,
    ReviewConflictError,
    ReviewPayloadValidationError,
    create_supplier_invoice_upload,
    validate_invoice_review,
)
from .tasks import process_invoice_ocr

logger = logging.getLogger(__name__)

HasStockModule = HasModulePermission.for_module('stock')


class SupplierInvoiceUploadView(APIView):
    """Upload d'une photo de facture fournisseur (URS-042).

    Ingère le fichier, crée `UploadedDocument` + `OcrResult(status='pending')`,
    puis déclenche l'OCR de manière asynchrone via Celery. La réponse est
    immédiate : la boutique récupère `ocr_result_id` et peut interroger
    l'endpoint GET pour suivre l'avancement.
    """

    permission_classes = (IsAuthenticated, HasStockModule)
    parser_classes = (MultiPartParser,)

    def post(self, request: Request) -> Response:
        if not is_storage_configured():
            return Response(
                {'detail': "L'upload vers Object Storage n'est pas configuré sur cet environnement."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        serializer = SupplierInvoiceUploadRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        shop = get_shop(request.user)
        result = create_supplier_invoice_upload(
            shop=shop,
            user=request.user,
            file=serializer.validated_data['document'],
        )

        # Déclenche l'OCR asynchrone. Si le broker Redis est indisponible on
        # NE veut PAS détruire l'upload déjà commit : le document existe en
        # base et dans le bucket, un opérateur pourra relancer plus tard.
        # On répond 503 pour signaler que l'ingestion a réussi mais que la
        # reconnaissance ne pourra pas démarrer maintenant.
        try:
            process_invoice_ocr.delay(str(result.ocr_result.pk))
        except Exception:
            logger.exception(
                'Broker Celery indisponible — OCR non déclenché pour %s.',
                result.ocr_result.pk,
            )
            return Response(
                {
                    'detail': (
                        "Le document est bien enregistré, mais la reconnaissance "
                        "de texte est indisponible pour le moment."
                    ),
                    'document_id': str(result.document.pk),
                    'ocr_result_id': str(result.ocr_result.pk),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            SupplierInvoiceUploadResponseSerializer.from_models(
                result.document, result.ocr_result,
            ),
            status=status.HTTP_201_CREATED,
        )


class OcrResultDetailView(APIView):
    """Consultation d'un `OcrResult` par le commerçant.

    Filtrage strict par la boutique du membre courant : toute lecture croisée
    (boutique A qui devine l'UUID d'une boutique B) retourne 404, jamais 403 —
    ce dernier confirmerait indirectement l'existence de la ressource.

    N'expose ni `object_key` ni URL S3 ni détails de `structured_data` non
    prévus par le contrat. Le PDF / l'image source restent internes au bucket.
    """

    permission_classes = (IsAuthenticated, HasStockModule)

    def get(self, request: Request, ocr_result_id: str) -> Response:
        shop = get_shop(request.user)
        queryset = OcrResult.objects.select_related('uploaded_document').filter(
            shop=shop,
        )
        try:
            result = get_object_or_404(queryset, pk=ocr_result_id)
        except (ValueError, TypeError):
            # UUID mal formé — même réponse qu'une ressource inexistante.
            raise NotFound('OCR result introuvable.')

        return Response(OcrResultDetailSerializer.from_model(result))


class OcrResultValidateView(APIView):
    """Validation humaine d'une facture OCR (URS-044/045 — Step 9A).

    Fige la revue ligne par ligne dans `structured_data['review']` et
    bascule l'OcrResult vers `validated`. **N'écrit aucun StockMovement**
    et ne modifie **aucune** quantité — c'est le rôle de Step 10.

    Idempotence : un retry réseau avec le même payload canonique renvoie
    200 avec l'état existant. Un retry avec un payload différent renvoie
    409 pour signaler qu'une décision divergente a déjà été enregistrée.

    Sécurité : `shop` provient exclusivement de `get_shop(request.user)`.
    Tout `ocr_result_id` d'une autre boutique renvoie 404 (jamais 403).
    Tout `variant_id` d'une autre boutique déclenche une erreur générique
    (jamais d'exposition d'information cross-tenant).
    """

    permission_classes = (IsAuthenticated, HasStockModule)

    def post(self, request: Request, ocr_result_id: str) -> Response:
        shop = get_shop(request.user)

        serializer = ValidateInvoiceReviewRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            result, _created = validate_invoice_review(
                ocr_result_id=ocr_result_id,
                shop=shop,
                user=request.user,
                lines=serializer.validated_data['lines'],
            )
        except OcrResult.DoesNotExist:
            raise NotFound('OCR result introuvable.')
        except (ReviewConflictError, OcrResultNotReviewableError) as exc:
            return Response(
                {'detail': str(exc)}, status=status.HTTP_409_CONFLICT,
            )
        except ReviewPayloadValidationError as exc:
            return Response(
                {'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST,
            )

        # Réponse identique en création et en retry idempotent : la représentation
        # à jour suffit au client, pas besoin de distinguer l'état interne.
        return Response(
            OcrResultDetailSerializer.from_model(result),
            status=status.HTTP_200_OK,
        )
