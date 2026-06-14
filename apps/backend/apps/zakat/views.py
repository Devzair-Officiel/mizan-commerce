from django.http import HttpResponse
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsShopAdmin, get_shop
from apps.products.models import ProductVariant
from apps.subscriptions.permissions import HasPlanForFeature

HasZakatPlan = HasPlanForFeature.for_feature('zakat')
from . import services
from .models import ZakatCalculation
from .pdf import build_zakat_pdf
from .serializers import ZakatCalculationSerializer


class ZakatStockEstimateView(APIView):
    """GET — valeur estimée du stock zakatable (lecture seule, pas persistée)."""
    permission_classes = (IsAuthenticated, HasZakatPlan, IsShopAdmin)

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


class ZakatCalculationListCreateView(generics.ListCreateAPIView):
    """Liste des calculs (drafts + finalisés) et création d'un nouveau brouillon."""
    permission_classes = (IsAuthenticated, HasZakatPlan, IsShopAdmin)
    serializer_class = ZakatCalculationSerializer

    def get_queryset(self):
        qs = ZakatCalculation.objects.filter(shop=get_shop(self.request.user))
        status_filter = self.request.query_params.get('status')
        if status_filter in (ZakatCalculation.STATUS_DRAFT, ZakatCalculation.STATUS_FINALIZED):
            qs = qs.filter(status=status_filter)
        return qs

    def perform_create(self, serializer):
        shop = get_shop(self.request.user)
        calc = serializer.save(
            shop=shop,
            currency=shop.currency,
            status=ZakatCalculation.STATUS_DRAFT,
        )
        services.recompute_draft_totals(calc)
        calc.save()


class ZakatCalculationDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Récupération, mise à jour (uniquement brouillons) et suppression."""
    permission_classes = (IsAuthenticated, HasZakatPlan, IsShopAdmin)
    serializer_class = ZakatCalculationSerializer
    http_method_names = ['get', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        return ZakatCalculation.objects.filter(shop=get_shop(self.request.user))

    def perform_update(self, serializer):
        instance = serializer.instance
        if instance.status == ZakatCalculation.STATUS_FINALIZED:
            raise ValidationError({'detail': 'Un calcul finalisé n\'est plus modifiable.'})
        calc = serializer.save()
        services.recompute_draft_totals(calc)
        calc.save()


class ZakatDraftCurrentView(APIView):
    """GET — renvoie le brouillon en cours de la boutique (le plus récent), ou 204 si aucun."""
    permission_classes = (IsAuthenticated, HasZakatPlan, IsShopAdmin)

    def get(self, request):
        shop = get_shop(request.user)
        draft = (
            ZakatCalculation.objects
            .filter(shop=shop, status=ZakatCalculation.STATUS_DRAFT)
            .order_by('-updated_at')
            .first()
        )
        if draft is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(ZakatCalculationSerializer(draft).data)


class ZakatCalculationFinalizeView(APIView):
    """POST — fige le brouillon : recalcule la base + le montant, passe en `finalized`."""
    permission_classes = (IsAuthenticated, HasZakatPlan, IsShopAdmin)

    def post(self, request, pk):
        shop = get_shop(request.user)
        try:
            calc = ZakatCalculation.objects.get(pk=pk, shop=shop)
        except ZakatCalculation.DoesNotExist:
            return Response({'detail': 'Calcul introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        if calc.status == ZakatCalculation.STATUS_FINALIZED:
            return Response({'detail': 'Calcul déjà finalisé.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            services.finalize_calculation(calc)
        except services.YearAlreadyFinalizedError as exc:
            return Response(
                {
                    'detail': (
                        f'Un calcul finalisé existe déjà pour {exc.year}. '
                        'La zakat ne se finalise qu\'une fois par cycle annuel.'
                    ),
                    'existing_id': str(exc.existing_id),
                    'year': exc.year,
                },
                status=status.HTTP_409_CONFLICT,
            )
        return Response(ZakatCalculationSerializer(calc).data)


class ZakatCalculationReopenView(APIView):
    """POST — rouvre un calcul finalisé en brouillon pour correction.

    Refuse si un autre brouillon est déjà actif (un seul brouillon vivant par boutique
    — le commerçant doit le finaliser ou le supprimer avant de rouvrir un autre).
    """
    permission_classes = (IsAuthenticated, HasZakatPlan, IsShopAdmin)

    def post(self, request, pk):
        shop = get_shop(request.user)
        try:
            calc = ZakatCalculation.objects.get(pk=pk, shop=shop)
        except ZakatCalculation.DoesNotExist:
            return Response({'detail': 'Calcul introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        if calc.status != ZakatCalculation.STATUS_FINALIZED:
            return Response(
                {'detail': 'Seul un calcul finalisé peut être rouvert.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        other_draft = ZakatCalculation.objects.filter(
            shop=shop, status=ZakatCalculation.STATUS_DRAFT,
        ).exclude(pk=calc.pk).exists()
        if other_draft:
            return Response(
                {'detail': 'Un autre brouillon est déjà en cours. Finalisez-le ou supprimez-le d\'abord.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        calc.status = ZakatCalculation.STATUS_DRAFT
        calc.finalized_at = None
        calc.save(update_fields=['status', 'finalized_at', 'updated_at'])
        return Response(ZakatCalculationSerializer(calc).data)


class ZakatCalculationPdfView(APIView):
    """GET — génère et renvoie le justificatif PDF d'un calcul finalisé.

    Pas de cache disque pour l'instant : la génération est rapide (<100ms) et le volume
    est faible (un calcul par boutique et par an). Si besoin plus tard, on stockera
    dans le bucket via `pdf_object_key` et on renverra une URL signée.
    """
    permission_classes = (IsAuthenticated, HasZakatPlan, IsShopAdmin)

    def get(self, request, pk):
        shop = get_shop(request.user)
        try:
            calc = ZakatCalculation.objects.select_related('shop').get(pk=pk, shop=shop)
        except ZakatCalculation.DoesNotExist:
            return Response({'detail': 'Calcul introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        if calc.status != ZakatCalculation.STATUS_FINALIZED:
            return Response(
                {'detail': 'Le PDF n\'est disponible qu\'après finalisation.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pdf_bytes = build_zakat_pdf(calc)
        filename = f'zakat-{calc.reference_date.isoformat()}.pdf'
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response
