from typing import Any

from django.http import HttpResponse
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsShopAdmin, get_shop
from apps.products.models import ProductVariant
from apps.subscriptions.permissions import HasPlanForFeature

HasZakatPlan = HasPlanForFeature.for_feature('zakat')
from . import services  # noqa: E402
from .models import ZakatCalculation  # noqa: E402
from .pdf import build_zakat_pdf  # noqa: E402
from .serializers import (  # noqa: E402
    ZakatCalculationListSerializer,
    ZakatCalculationSerializer,
    ZakatProfileSerializer,
    ZakatSourcesSerializer,
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


class ZakatStockEstimateView(ZakatViewMixin, APIView):
    """GET — valeur estimée du stock zakatable (écran actuel, remplacé par /sources/ en Z2)."""  # noqa: E501

    def get(self, request):
        shop = get_shop(request.user)
        estimated = services.compute_stock_value(shop)
        count = ProductVariant.objects.filter(
            shop=shop, is_active=True, product__is_active=True, stock_quantity__gt=0,
        ).count()
        return Response({
            'stock_value_estimated': estimated,
            'currency': shop.currency,
            'disclaimer': 'Estimation indicative — à vérifier avec un conseiller.',
            'product_count': count,
        })


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
        serializer = ZakatCalculationSerializer(data=request.data, context={'shop': shop})  # noqa: E501
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
    """GET — justificatif PDF d'un calcul finalisé (contenu refondu en Z2).

    Pas de cache : génération rapide (<100 ms), volume faible.
    """

    def get(self, request, pk):
        calc = services.get_calculation(get_shop(request.user), request.user, pk)
        if calc.status != ZakatCalculation.STATUS_FINALIZED:
            return Response(
                {'detail': 'Le PDF n\'est disponible qu\'après finalisation.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pdf_bytes = build_zakat_pdf(calc)
        services.record_pdf_download(calc, request.user)
        filename = f'zakat-{calc.reference_date.isoformat()}.pdf'
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response
