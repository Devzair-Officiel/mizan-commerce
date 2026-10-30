"""Endpoints des brouillons de devis (URS-111) : création, enregistrement,
suppression, vérification et envoi. Suggestions de lignes : celles des factures
(`/api/invoices/line-suggestions/`)."""

from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import get_shop
from apps.invoices.draft_views import (
    PERMISSIONS,
    STALE_DRAFT,
    compliance_issues,
    compliance_response,
)
from apps.invoices.drafts import ComplianceError, DraftConflictError

from . import services
from .compliance import check_quote
from .models import Quote
from .serializers import (
    DraftQuoteSerializer,
    DraftQuoteUpdateSerializer,
    QuoteSendSerializer,
    QuoteSerializer,
)

NOT_DRAFT = {
    'detail': 'Ce devis est envoyé : il ne se modifie ni ne se supprime.',
    'code': 'not_draft',
}


def shop_quote(request: Request, pk: object) -> Quote:
    """Devis de la boutique du membre courant ; 404 pour toute autre boutique."""
    quote = (
        Quote.objects.filter(pk=pk, shop=get_shop(request.user))
        .select_related('shop', 'customer')
        .first()
    )
    if quote is None:
        raise NotFound('Devis introuvable.')
    return quote


class DraftQuoteCreateView(APIView):
    """POST — crée un brouillon, sans numéro ni date d'envoi."""

    permission_classes = PERMISSIONS

    def post(self, request: Request) -> Response:
        payload = DraftQuoteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        quote = services.create_draft_quote(
            get_shop(request.user), payload.validated_data
        )
        return Response(QuoteSerializer(quote).data, status=status.HTTP_201_CREATED)


class DraftQuoteView(APIView):
    """PATCH — enregistre un brouillon (concurrence optimiste). DELETE — le supprime."""

    permission_classes = PERMISSIONS

    def patch(self, request: Request, pk: object) -> Response:
        quote = shop_quote(request, pk)
        # Champs tous facultatifs (PATCH partiel), sauf `updated_at`.
        payload = DraftQuoteUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = dict(payload.validated_data)
        expected = data.pop('updated_at')
        try:
            quote = services.update_draft_quote(quote, data, expected)
        except DraftConflictError:
            return Response(STALE_DRAFT, status=status.HTTP_409_CONFLICT)
        except services.QuoteStateError:
            return Response(NOT_DRAFT, status=status.HTTP_409_CONFLICT)
        return Response(QuoteSerializer(quote).data)

    def delete(self, request: Request, pk: object) -> Response:
        quote = shop_quote(request, pk)
        try:
            services.delete_draft_quote(quote)
        except services.QuoteStateError:
            return Response(NOT_DRAFT, status=status.HTTP_409_CONFLICT)
        return Response(status=status.HTTP_204_NO_CONTENT)


class QuoteComplianceView(APIView):
    """GET — points bloquants et recommandés, sans rien écrire."""

    permission_classes = PERMISSIONS

    def get(self, request: Request, pk: object) -> Response:
        quote = shop_quote(request, pk)
        if quote.status != Quote.STATUS_DRAFT:
            return Response(NOT_DRAFT, status=status.HTTP_409_CONFLICT)
        return Response({'issues': compliance_issues(check_quote(quote))})


class QuoteSendView(APIView):
    """POST — envoie un brouillon : numéro, validité et instantanés figés."""

    permission_classes = PERMISSIONS

    def post(self, request: Request, pk: object) -> Response:
        quote = shop_quote(request, pk)
        payload = QuoteSendSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        try:
            quote = services.send_quote(
                quote,
                request.user,
                acknowledged_warnings=payload.validated_data.get(
                    'acknowledged_warnings', []
                ),
                language=request.user.language,
            )
        except services.QuoteStateError:
            return Response(NOT_DRAFT, status=status.HTTP_409_CONFLICT)
        except ComplianceError as exc:
            return compliance_response(exc, 'Vérifiez le devis avant de l’envoyer.')
        return Response(QuoteSerializer(quote).data)
