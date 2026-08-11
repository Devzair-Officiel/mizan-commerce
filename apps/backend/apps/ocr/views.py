from __future__ import annotations

from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import HasModulePermission, get_shop
from apps.core.storage import is_storage_configured

from .serializers import (
    SupplierInvoiceUploadRequestSerializer,
    SupplierInvoiceUploadResponseSerializer,
)
from .services import create_supplier_invoice_upload

HasStockModule = HasModulePermission.for_module('stock')


class SupplierInvoiceUploadView(APIView):
    """Upload d'une photo de facture fournisseur (URS-042).

    Ne déclenche pas encore d'OCR : crée seulement `UploadedDocument`
    + `OcrResult(status='pending')` et stocke le fichier dans le bucket privé.
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

        return Response(
            SupplierInvoiceUploadResponseSerializer.from_models(
                result.document, result.ocr_result,
            ),
            status=status.HTTP_201_CREATED,
        )
