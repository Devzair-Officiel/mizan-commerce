"""Endpoints de la facture libre (URS-110) : brouillons, vérification, émission."""

from dataclasses import asdict

from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import get_shop

from . import drafts
from .compliance import ComplianceIssue, check_invoice
from .models import Invoice
from .serializers import (
    DraftInvoiceSerializer,
    DraftInvoiceUpdateSerializer,
    InvoiceIssueDraftSerializer,
    InvoiceSerializer,
)
from .views import HasInvoicesModule, HasInvoicesPlan

PERMISSIONS = (IsAuthenticated, HasInvoicesPlan, HasInvoicesModule)
NOT_DRAFT = {
    'detail': 'Cette facture est émise : elle ne se modifie ni ne se supprime.',
    'code': 'not_draft',
}
STALE_DRAFT = {
    'detail': 'Ce brouillon a été modifié ailleurs : rechargez-le.',
    'code': 'draft_conflict',
}


def _shop_invoice(request, pk) -> Invoice:
    invoice = (
        Invoice.objects.filter(pk=pk, shop=get_shop(request.user))
        .select_related('shop', 'customer')
        .first()
    )
    if invoice is None:
        raise NotFound('Facture introuvable.')
    return invoice


def _issues(issues: list[ComplianceIssue]) -> list[dict[str, str]]:
    return [asdict(issue) for issue in issues]


class DraftInvoiceCreateView(APIView):
    """POST — crée un brouillon, sans numéro ni date d'émission."""

    permission_classes = PERMISSIONS

    def post(self, request) -> Response:
        payload = DraftInvoiceSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        invoice = drafts.create_draft_invoice(
            get_shop(request.user), payload.validated_data
        )
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)


class DraftInvoiceView(APIView):
    """PATCH — enregistre un brouillon (concurrence optimiste). DELETE — le supprime."""

    permission_classes = PERMISSIONS

    def patch(self, request, pk) -> Response:
        invoice = _shop_invoice(request, pk)
        # Champs tous facultatifs (PATCH partiel), sauf `updated_at`.
        payload = DraftInvoiceUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = dict(payload.validated_data)
        expected = data.pop('updated_at')
        try:
            invoice = drafts.update_draft_invoice(invoice, data, expected)
        except drafts.DraftConflictError:
            return Response(STALE_DRAFT, status=status.HTTP_409_CONFLICT)
        except drafts.NotDraftError:
            return Response(NOT_DRAFT, status=status.HTTP_409_CONFLICT)
        return Response(InvoiceSerializer(invoice).data)

    def delete(self, request, pk) -> Response:
        invoice = _shop_invoice(request, pk)
        try:
            drafts.delete_draft_invoice(invoice, request.user)
        except drafts.NotDraftError:
            return Response(NOT_DRAFT, status=status.HTTP_409_CONFLICT)
        return Response(status=status.HTTP_204_NO_CONTENT)


class InvoiceComplianceView(APIView):
    """GET — points bloquants et recommandés, sans rien écrire."""

    permission_classes = PERMISSIONS

    def get(self, request, pk) -> Response:
        invoice = _shop_invoice(request, pk)
        if invoice.status != Invoice.STATUS_DRAFT:
            return Response(NOT_DRAFT, status=status.HTTP_409_CONFLICT)
        return Response({'issues': _issues(check_invoice(invoice))})


class InvoiceIssueDraftView(APIView):
    """POST — émet un brouillon : numéro, date et instantanés figés."""

    permission_classes = PERMISSIONS

    def post(self, request, pk) -> Response:
        invoice = _shop_invoice(request, pk)
        payload = InvoiceIssueDraftSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        try:
            invoice = drafts.issue_invoice(
                invoice,
                request.user,
                acknowledged_warnings=payload.validated_data.get(
                    'acknowledged_warnings', []
                ),
                language=request.user.language,
            )
        except drafts.NotDraftError:
            return Response(NOT_DRAFT, status=status.HTTP_409_CONFLICT)
        except drafts.ComplianceError as exc:
            return Response(
                {
                    'detail': 'Vérifiez la facture avant de l’émettre.',
                    'code': (
                        'compliance_blocking' if exc.blocking else 'compliance_warnings'
                    ),
                    'issues': _issues(exc.issues),
                },
                status=(
                    status.HTTP_400_BAD_REQUEST
                    if exc.blocking
                    else status.HTTP_409_CONFLICT
                ),
            )
        return Response(InvoiceSerializer(invoice).data)


class LineSuggestionsView(APIView):
    """GET ?q= — catalogue puis lignes déjà facturées de la boutique."""

    permission_classes = PERMISSIONS

    def get(self, request) -> Response:
        query = request.query_params.get('q', '')[:100]
        return Response(drafts.line_suggestions(get_shop(request.user), query))
