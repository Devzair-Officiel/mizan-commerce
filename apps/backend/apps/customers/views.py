from decimal import Decimal
from django.db.models import Count, Sum, F, Q, ExpressionWrapper, DecimalField
from rest_framework import generics, filters
from rest_framework.permissions import IsAuthenticated

from apps.shops.models import ShopMember
from .models import Customer
from .serializers import CustomerSerializer, CustomerListSerializer


def _customer_qs_with_stats(shop):
    return Customer.objects.filter(shop=shop).annotate(
        order_count=Count('orders', filter=~Q(orders__status='cancelled'), distinct=True),
        pending_amount=ExpressionWrapper(
            Sum(
                F('orders__total_amount') - F('orders__amount_paid'),
                filter=Q(orders__payment_status__in=['unpaid', 'partial']) & ~Q(orders__status='cancelled'),
            ),
            output_field=DecimalField(max_digits=12, decimal_places=2),
        ),
        paid_amount=ExpressionWrapper(
            Sum(
                'orders__amount_paid',
                filter=~Q(orders__status='cancelled'),
            ),
            output_field=DecimalField(max_digits=12, decimal_places=2),
        ),
    )


def get_shop(user):
    membership = ShopMember.objects.filter(user=user).select_related('shop').first()
    if not membership:
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied('Aucune boutique associée.')
    return membership.shop


class CustomerListCreateView(generics.ListCreateAPIView):
    permission_classes = (IsAuthenticated,)
    filter_backends = (filters.SearchFilter, filters.OrderingFilter)
    search_fields = ('name', 'phone', 'email', 'city')
    ordering_fields = ('name', 'created_at')
    ordering = ('name',)

    def get_serializer_class(self):
        return CustomerListSerializer if self.request.method == 'GET' else CustomerSerializer

    def get_queryset(self):
        shop = get_shop(self.request.user)
        qs = _customer_qs_with_stats(shop)
        if self.request.query_params.get('all') != '1':
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        serializer.save(shop=get_shop(self.request.user))


class CustomerDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = CustomerSerializer

    def get_queryset(self):
        return _customer_qs_with_stats(get_shop(self.request.user))

    def perform_destroy(self, instance):
        # Soft delete
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
