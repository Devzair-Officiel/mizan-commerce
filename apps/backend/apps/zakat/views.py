from decimal import Decimal, InvalidOperation
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.shops.models import ShopMember
from apps.products.models import Product
from . import services
from .models import ZakatCalculation
from .serializers import ZakatCalculationSerializer


def get_shop(user):
    membership = ShopMember.objects.filter(user=user).select_related('shop').first()
    if not membership:
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied('Aucune boutique associée.')
    return membership.shop


class ZakatStockEstimateView(APIView):
    """GET — valeur estimée du stock zakatable (lecture seule, pas persistée)."""
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        shop = get_shop(request.user)
        estimated = services.compute_stock_value(shop)
        count = Product.objects.filter(shop=shop, is_active=True, stock_quantity__gt=0).count()
        return Response({
            'stock_value_estimated': estimated,
            'currency': shop.currency,
            'disclaimer': 'Estimation indicative — à vérifier avec un conseiller.',
            'product_count': count,
        })


class ZakatCalculationListCreateView(generics.ListCreateAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = ZakatCalculationSerializer

    def get_queryset(self):
        return ZakatCalculation.objects.filter(shop=get_shop(self.request.user))

    def create(self, request, *args, **kwargs):
        shop = get_shop(request.user)
        data = request.data

        def to_decimal(key: str, default: str = '0') -> Decimal:
            try:
                return Decimal(str(data.get(key, default)))
            except InvalidOperation:
                return Decimal(default)

        adjusted_raw = data.get('stock_value_adjusted')
        adjusted = Decimal(str(adjusted_raw)) if adjusted_raw not in (None, '') else None

        calc = services.calculate_zakat(
            shop=shop,
            reference_date=data.get('reference_date'),
            cash_amount=to_decimal('cash_amount'),
            receivables_amount=to_decimal('receivables_amount'),
            short_term_debts=to_decimal('short_term_debts'),
            stock_value_adjusted=adjusted,
            notes=data.get('notes', ''),
            zakat_rate=to_decimal('zakat_rate', '0.0250'),
        )
        serializer = self.get_serializer(calc)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ZakatCalculationDetailView(generics.RetrieveDestroyAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = ZakatCalculationSerializer

    def get_queryset(self):
        return ZakatCalculation.objects.filter(shop=get_shop(self.request.user))
