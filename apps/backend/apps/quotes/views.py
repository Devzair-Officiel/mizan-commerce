"""Endpoints des devis envoyés (URS-111) : liste, détail, réponse du client,
conversion en facture. Pas de PDF avant la sous-étape 5."""

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
from .serializers import QuoteSerializer, QuoteStatusSerializer

STATE_CHANGED = {
    'detail': 'Le statut de ce devis ne permet pas cette action : rechargez-le.',
    'code': 'invalid_status',
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
