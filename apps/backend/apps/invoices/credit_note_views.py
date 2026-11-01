"""Avoirs d'une facture (URS-112) : liste et émission."""

from uuid import UUID

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from . import credit_notes
from .draft_views import PERMISSIONS, compliance_response, shop_invoice
from .drafts import ComplianceError
from .models import Invoice
from .serializers import CreditNoteIssueSerializer, InvoiceSerializer

CREDIT_NOTE_ERRORS = {
    'invoice_draft': "Un brouillon n'a pas d'avoir : émettez d'abord la facture.",
    'invoice_cancelled': 'Une facture annulée ne peut pas faire l’objet d’un avoir.',
    'credit_note_of_credit_note': 'Un avoir ne se crédite pas.',
    'over_credit': (
        'Cet avoir dépasse ce qui reste à créditer sur la facture : rechargez-la.'
    ),
    'nothing_to_credit': 'Cet avoir ne crédite aucun montant.',
    'idempotency_key_reused': (
        'Cette clé a déjà servi à un avoir d’une autre facture : rechargez la page.'
    ),
}
INVALID_KEY = {
    'detail': 'En-tête Idempotency-Key invalide : UUID attendu.',
    'code': 'invalid_idempotency_key',
}


def idempotency_key(request: Request) -> UUID | None:
    """En-tête `Idempotency-Key` (UUID), facultatif ; `ValueError` s'il est invalide."""
    value = request.headers.get('Idempotency-Key', '').strip()
    return UUID(value) if value else None


class InvoiceCreditNotesView(APIView):
    """GET — avoirs de la facture. POST — émet un avoir, total ou partiel.

    Ni le stock ni la commande liée ne changent (`credit_notes`). En-tête
    `Idempotency-Key` (UUID) : un second POST avec la même clé renvoie l'avoir
    déjà créé, même réponse (201), sans nouveau numéro ni nouvel audit.
    """

    permission_classes = PERMISSIONS

    def get(self, request: Request, pk: object) -> Response:
        invoice = shop_invoice(request, pk)
        notes = Invoice.objects.filter(
            shop_id=invoice.shop_id,
            kind=Invoice.KIND_CREDIT_NOTE,
            credited_invoice=invoice,
        ).prefetch_related('lines')
        return Response(InvoiceSerializer(notes, many=True).data)

    def post(self, request: Request, pk: object) -> Response:
        invoice = shop_invoice(request, pk)
        try:
            key = idempotency_key(request)
        except ValueError:
            return Response(INVALID_KEY, status=status.HTTP_400_BAD_REQUEST)
        payload = CreditNoteIssueSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        partial = data['mode'] == CreditNoteIssueSerializer.MODE_PARTIAL
        try:
            note = credit_notes.issue_credit_note(
                invoice.shop,
                invoice,
                data.get('lines', []) if partial else None,
                data['reason'],
                request.user,
                acknowledged_warnings=data.get('acknowledged_warnings', []),
                include_shipping=data['include_shipping'],
                idempotency_key=key,
            )
        except credit_notes.CreditNoteError as exc:
            return Response(
                {'detail': CREDIT_NOTE_ERRORS[exc.code], 'code': exc.code},
                status=status.HTTP_409_CONFLICT,
            )
        except ComplianceError as exc:
            return compliance_response(exc, 'Vérifiez la facture avant de la créditer.')
        return Response(InvoiceSerializer(note).data, status=status.HTTP_201_CREATED)
