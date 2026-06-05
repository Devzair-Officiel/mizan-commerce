from decimal import Decimal
from django.db.models import Count, Sum, F, Q, ExpressionWrapper, DecimalField
from rest_framework import filters, generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.pagination import FlexiblePageNumberPagination
from apps.core.permissions import get_shop
from .models import Customer
from .serializers import CustomerSerializer, CustomerListSerializer
from .services import ALL_TYPES, get_customer_timeline


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


class CustomerListCreateView(generics.ListCreateAPIView):
    permission_classes = (IsAuthenticated,)
    filter_backends = (filters.SearchFilter, filters.OrderingFilter)
    search_fields = ('name', 'phone', 'email', 'city')
    ordering_fields = ('name', 'created_at')
    ordering = ('name',)

    def get_serializer_class(self):
        return CustomerListSerializer if self.request.method == 'GET' else CustomerSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['shop'] = get_shop(self.request.user)
        return ctx

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

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['shop'] = get_shop(self.request.user)
        return ctx

    def get_queryset(self):
        return _customer_qs_with_stats(get_shop(self.request.user))

    def perform_destroy(self, instance):
        # Soft delete
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])


class CustomerActivityView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request: Request, pk) -> Response:
        shop = get_shop(request.user)
        try:
            customer = Customer.objects.get(pk=pk, shop=shop)
        except Customer.DoesNotExist:
            return Response({'detail': 'Client introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        raw_types = request.query_params.get('types')
        if raw_types:
            requested = {t.strip() for t in raw_types.split(',') if t.strip()}
            unknown = requested - ALL_TYPES
            if unknown:
                return Response(
                    {'detail': f'Types inconnus: {", ".join(sorted(unknown))}.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            types: list[str] | None = list(requested)
        else:
            types = None
        pending_only = request.query_params.get('pending') == 'true'
        items: list[dict] = list(
            get_customer_timeline(customer, types=types, pending_only=pending_only),
        )

        paginator = FlexiblePageNumberPagination()
        page = paginator.paginate_queryset(items, request, view=self)
        if page is not None:
            for it in page:
                it['occurred_at'] = it['occurred_at'].isoformat()
            return paginator.get_paginated_response(page)
        for it in items:
            it['occurred_at'] = it['occurred_at'].isoformat()
        return Response(items)
