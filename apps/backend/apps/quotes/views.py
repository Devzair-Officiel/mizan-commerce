"""Endpoints des devis envoyés (URS-111) : liste, détail, réponse du client,
conversion en facture, PDF."""

from django.http import HttpResponse
from rest_framework import generics, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import ShopScopedQuerysetMixin
from apps.invoices.draft_views import PERMISSIONS
from apps.invoices.serializers import InvoiceSerializer

from . import services
from .draft_views import shop_quote
from .models import Quote
from .pdf import build_quote_pdf
from .serializers import QuoteSerializer, QuoteStatusSerializer

STATE_CHANGED = {
    'detail': 'Le statut de ce devis ne permet pas cette action : rechargez-le.',
    'code': 'invalid_status',
}
NOT_SENT = {
    'detail': "Un brouillon de devis n'a pas de PDF : envoyez d'abord le devis.",
    'code': 'not_sent',
}


class QuoteListView(ShopScopedQuerysetMixin, generics.ListAPIView):
    """GET — devis de la boutique, envoyés les plus récents d'abord."""

    permission_classes = PERMISSIONS
    serializer_class = QuoteSerializer
    queryset = Quote.objects.prefetch_related('lines')


class QuoteDetailView(ShopScopedQuerysetMixin, generics.RetrieveAPIView):
    """GET — détail d'un devis (lecture seule)."""

    permission_classes = PERMISSIONS
    serializer_class = QuoteSerializer
    queryset = Quote.objects.prefetch_related('lines')


class QuoteStatusView(APIView):
    """POST — accord ou refus reçu hors de l'app, depuis un devis envoyé."""

    permission_classes = PERMISSIONS

    def post(self, request: Request, pk: object) -> Response:
        quote = shop_quote(request, pk)
        payload = QuoteStatusSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        try:
            if payload.validated_data['status'] == Quote.STATUS_ACCEPTED:
                quote = services.mark_accepted_manually(
                    quote,
                    request.user,
                    payload.validated_data.get('accepted_name', ''),
                )
            else:
                quote = services.mark_declined(quote, request.user)
        except services.QuoteStateError:
            return Response(STATE_CHANGED, status=status.HTTP_409_CONFLICT)
        return Response(QuoteSerializer(quote).data)


class QuoteConvertView(APIView):
    """POST — crée la facture en brouillon d'un devis accepté (une seule fois)."""

    permission_classes = PERMISSIONS

    def post(self, request: Request, pk: object) -> Response:
        quote = shop_quote(request, pk)
        try:
            invoice = services.convert_quote_to_invoice(quote, request.user)
        except services.QuoteStateError:
            return Response(STATE_CHANGED, status=status.HTTP_409_CONFLICT)
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)


class QuotePdfView(APIView):
    """GET — PDF d'un devis envoyé, quel que soit son état depuis l'envoi."""

    permission_classes = PERMISSIONS

    def get(self, request: Request, pk: object) -> HttpResponse | Response:
        quote = shop_quote(request, pk)
        if quote.status == Quote.STATUS_DRAFT:
            return Response(NOT_SENT, status=status.HTTP_409_CONFLICT)
        response = HttpResponse(build_quote_pdf(quote), content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{quote.number}.pdf"'
        return response
