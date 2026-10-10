from rest_framework import filters, generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.pagination import FlexiblePageNumberPagination
from apps.core.permissions import HasModulePermission, get_shop

HasCustomersModule = HasModulePermission.for_module('customers')
from . import services  # noqa: E402
from .filters import CustomerOrderingFilter  # noqa: E402
from .models import Customer  # noqa: E402
from .serializers import CustomerSerializer, CustomerListSerializer  # noqa: E402
from .services import (  # noqa: E402
    ALL_TYPES, CUSTOMER_SEARCH_FIELDS, customers_with_stats, get_customer_timeline,
)


class CustomerListCreateView(generics.ListCreateAPIView):
    permission_classes = (IsAuthenticated, HasCustomersModule)
    filter_backends = (filters.SearchFilter, CustomerOrderingFilter)
    search_fields = CUSTOMER_SEARCH_FIELDS
    ordering_fields = (
        'name', 'pending_amount', 'paid_amount', 'order_count', 'last_order_at',
        'created_at',
    )
    ordering = ('name',)

    def get_serializer_class(self):
        return CustomerListSerializer if self.request.method == 'GET' else CustomerSerializer  # noqa: E501

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['shop'] = get_shop(self.request.user)
        return ctx

    def get_queryset(self):
        shop = get_shop(self.request.user)
        return services.filter_customers(
            customers_with_stats(shop), shop, self.request.query_params,
        )

    def perform_create(self, serializer):
        serializer.save(shop=get_shop(self.request.user))


class CustomerSummaryView(APIView):
    """Indicateurs de la page Clients (actifs, à encaisser, nouveaux ce mois-ci)."""
    permission_classes = (IsAuthenticated, HasCustomersModule)

    def get(self, request: Request) -> Response:
        return Response(services.build_customers_summary(get_shop(request.user)))


class CustomerFacetsView(APIView):
    """Nombre de clients par situation, pour le filtre de la liste.

    Reçoit les mêmes paramètres que la liste (recherche comprise).
    """
    permission_classes = (IsAuthenticated, HasCustomersModule)
    search_fields = CUSTOMER_SEARCH_FIELDS

    def get(self, request: Request) -> Response:
        shop = get_shop(request.user)
        qs = filters.SearchFilter().filter_queryset(request, customers_with_stats(shop), self)  # noqa: E501
        return Response(services.build_customer_facets(shop, qs, request.query_params))


class CustomerDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = (IsAuthenticated, HasCustomersModule)
    serializer_class = CustomerSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['shop'] = get_shop(self.request.user)
        return ctx

    def get_queryset(self):
        return customers_with_stats(get_shop(self.request.user))

    def perform_destroy(self, instance):
        # Soft delete
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])


class CustomerActivityView(APIView):
    permission_classes = (IsAuthenticated, HasCustomersModule)

    def get(self, request: Request, pk) -> Response:
        shop = get_shop(request.user)
        try:
            customer = Customer.objects.get(pk=pk, shop=shop)
        except Customer.DoesNotExist:
            return Response({'detail': 'Client introuvable.'}, status=status.HTTP_404_NOT_FOUND)  # noqa: E501

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
