from typing import Any

from django.http import HttpResponse
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsShopAdmin, get_shop
from apps.subscriptions.permissions import HasPlanForFeature

HasZakatPlan = HasPlanForFeature.for_feature('zakat')
from . import followups, services  # noqa: E402
from .models import ZakatCalculation  # noqa: E402
from .pdf import build_zakat_pdf  # noqa: E402
from .serializers import (  # noqa: E402
    ZakatCalculationListSerializer,
    ZakatCalculationSerializer,
    ZakatFollowUpActionSerializer,
    ZakatFollowUpSerializer,
    ZakatPaymentSerializer,
    ZakatProfileSerializer,
    ZakatSourcesSerializer,
    ZakatVersionSerializer,
)


class ZakatViewMixin:
    """Module réservé aux admins ; erreurs métier du service → 404 ou 409.

    Chaque fiche est personnelle : les vues filtrent par boutique ET par personne,
    une fiche d'un autre admin répond 404.
    """
    permission_classes = (IsAuthenticated, HasZakatPlan, IsShopAdmin)

    def handle_exception(self, exc: Exception) -> Response:
        if isinstance(exc, ZakatCalculation.DoesNotExist):
            return Response({'detail': 'Calcul introuvable.'}, status=status.HTTP_404_NOT_FOUND)  # noqa: E501
        if isinstance(exc, services.VersionConflictError):
            return Response(
                {'detail': str(exc), 'current_version': exc.current_version},
                status=status.HTTP_409_CONFLICT,
            )
        if isinstance(exc, followups.FollowUpNotFound):
            return Response({'detail': 'Créance introuvable.'}, status=status.HTTP_404_NOT_FOUND)  # noqa: E501
        if isinstance(exc, followups.FollowUpActionError):
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if isinstance(exc, followups.FollowUpConflictError):
            return Response(
                {'detail': str(exc), 'item': ZakatFollowUpSerializer(exc.item).data},
                status=status.HTTP_409_CONFLICT,
            )
        if isinstance(exc, services.DuplicateHawlYearError):
            return Response(
                {
                    'detail': f'{exc} Ouvrez-le depuis la liste des calculs.',
                    'existing_id': str(exc.existing_id),
                    'hawl_calendar': exc.hawl_calendar,
                    'hawl_year': exc.hawl_year,
                },
                status=status.HTTP_409_CONFLICT,
            )
        return super().handle_exception(exc)


def _split_controls(validated: dict[str, Any]) -> tuple[dict[str, Any], int | None, bool]:  # noqa: E501
    """Sépare les champs enregistrés des contrôles d'écriture (`version`, `refresh_stock`)."""  # noqa: E501
    data = dict(validated)
    version = data.pop('version', None)
    refresh_stock = data.pop('refresh_stock', False)
    return data, version, refresh_stock


class ZakatProfileView(ZakatViewMixin, APIView):
    """GET / PATCH — réglages zakat de la personne connectée (créés vides à la première lecture)."""  # noqa: E501

    def get(self, request):
        profile = services.get_or_create_profile(get_shop(request.user), request.user)
        return Response(ZakatProfileSerializer(profile).data)

    def patch(self, request):
        profile = services.get_or_create_profile(get_shop(request.user), request.user)
        serializer = ZakatProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        profile = services.update_profile(profile, dict(serializer.validated_data))
        return Response(ZakatProfileSerializer(profile).data)


class ZakatSourcesView(ZakatViewMixin, APIView):
    """GET — ce que Mizan pré-remplit : stock (vente / achat) et commandes non réglées."""  # noqa: E501

    def get(self, request):
        sources = services.build_sources(get_shop(request.user))
        return Response(ZakatSourcesSerializer(sources).data)


class ZakatCalculationListCreateView(ZakatViewMixin, generics.ListAPIView):
    """Fiches de la personne (bloc `totals` de chacune) et création (une par année de hawl)."""  # noqa: E501
    serializer_class = ZakatCalculationListSerializer

    def get_queryset(self):
        return ZakatCalculation.objects.filter(
            shop=get_shop(self.request.user), user=self.request.user,
        ).select_related('shop')

    def post(self, request):
        shop = get_shop(request.user)
        serializer = ZakatCalculationSerializer(
            data=request.data, context={'shop': shop, 'user': request.user},
        )
        serializer.is_valid(raise_exception=True)
        data, _, _ = _split_controls(serializer.validated_data)
        calc = services.create_calculation(shop, request.user, data)
        return Response(ZakatCalculationSerializer(calc).data, status=status.HTTP_201_CREATED)  # noqa: E501


class ZakatCalculationDetailView(ZakatViewMixin, APIView):
    """GET, PATCH (écriture conditionnelle, `version` obligatoire), DELETE."""

    def get(self, request, pk):
        calc = services.get_calculation(get_shop(request.user), request.user, pk)
        return Response(ZakatCalculationSerializer(calc).data)

    def patch(self, request, pk):
        shop = get_shop(request.user)
        calc = services.get_calculation(shop, request.user, pk)
        serializer = ZakatCalculationSerializer(
            calc, data=request.data, partial=True, context={'shop': shop},
        )
        serializer.is_valid(raise_exception=True)
        data, version, refresh_stock = _split_controls(serializer.validated_data)
        calc = services.update_calculation(
            calc, data, expected_version=version, refresh_stock=refresh_stock,
        )
        return Response(ZakatCalculationSerializer(calc).data)

    def delete(self, request, pk):
        calc = services.get_calculation(get_shop(request.user), request.user, pk)
        services.delete_calculation(calc, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ZakatCalculationPdfView(ZakatViewMixin, APIView):
    """GET — justificatif PDF d'une fiche, à tout moment, réservé à son auteur (404).

    Pas de cache : génération rapide (<100 ms), volume faible.
    """

    def get(self, request, pk):
        calc = services.get_calculation(get_shop(request.user), request.user, pk)
        pdf_bytes = build_zakat_pdf(calc)
        services.record_pdf_download(calc, request.user)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        filename = f'zakat-{calc.hawl_year}.pdf'
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class ZakatPaymentView(ZakatViewMixin, APIView):
    """PUT — « Marquer comme versée » ou modifier date et montant ; DELETE — retrait.

    Écriture conditionnelle sur `version` (409 si périmée) ; renvoie la fiche."""

    def put(self, request, pk):
        shop = get_shop(request.user)
        calc = services.get_calculation(shop, request.user, pk)
        serializer = ZakatPaymentSerializer(data=request.data, context={'shop': shop})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        calc = services.set_payment(
            calc, request.user, paid_on=data['paid_on'], paid_amount=data['paid_amount'],  # noqa: E501
            expected_version=data['version'],
        )
        return Response(ZakatCalculationSerializer(calc).data)

    def delete(self, request, pk):
        calc = services.get_calculation(get_shop(request.user), request.user, pk)
        serializer = ZakatVersionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        calc = services.clear_payment(
            calc, request.user, expected_version=serializer.validated_data['version'],
        )
        return Response(ZakatCalculationSerializer(calc).data)


class ZakatFollowUpListView(ZakatViewMixin, APIView):
    """GET — créances qui appellent une action (carte « À verser à l'encaissement »)."""

    def get(self, request):
        items = followups.actionable_items(get_shop(request.user), request.user)
        return Response(ZakatFollowUpSerializer(items, many=True).data)


class ZakatCalculationFollowUpsView(ZakatViewMixin, APIView):
    """GET — créances suivies d'une fiche (écran Résultat), 404 si elle n'est pas à soi."""  # noqa: E501

    def get(self, request, pk):
        calc = services.get_calculation(get_shop(request.user), request.user, pk)
        items = followups.calculation_items(calc)
        return Response(ZakatFollowUpSerializer(items, many=True).data)


class ZakatFollowUpActionView(ZakatViewMixin, APIView):
    """POST — action sur une créance : choix D4, « Encaissée », « Marquer comme
    versée », « Ignorer », « Revenir ». Renvoie la créance relue ; 409 si elle a
    changé entre-temps (avec son état actuel)."""

    def post(self, request, pk, line_id):
        serializer = ZakatFollowUpActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = followups.apply_action(
            get_shop(request.user), request.user, pk, line_id,
            serializer.validated_data,
        )
        return Response(ZakatFollowUpSerializer(item).data)
