from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.customers.models import Customer
from apps.orders.models import Order
from apps.products.models import Product

from .permissions import HasModulePermission, get_shop
from .services import build_dashboard_today

HasDashboardModule = HasModulePermission.for_module('dashboard')


class DashboardTodayView(APIView):
    permission_classes = (IsAuthenticated, HasDashboardModule)

    def get(self, request):
        shop = get_shop(request.user)
        return Response(build_dashboard_today(shop))


class GlobalSearchView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        q = request.query_params.get('q', '').strip()
        if len(q) < 2:
            return Response({'products': [], 'customers': [], 'orders': []})

        shop = get_shop(request.user)
        LIMIT = 5

        # Recherche produits : nom OU SKU (sur la variante).
        product_rows = list(
            Product.objects.filter(
                shop=shop, is_active=True,
            ).filter(
                Q(name__icontains=q) | Q(variants__sku__icontains=q)
            ).distinct()
            .prefetch_related('variants')[:LIMIT]
        )
        products = []
        for p in product_rows:
            variants = [v for v in p.variants.all() if v.is_active]
            first_sku = next((v.sku for v in variants if v.sku), '')
            products.append({
                'id': p.id,
                'name': p.name,
                'reference': first_sku,
                'type': p.type,
                'variant_count': len(variants),
                'is_out_of_stock': all(v.is_out_of_stock for v in variants) if variants else True,  # noqa: E501
            })

        customers = list(
            Customer.objects.filter(
                shop=shop, is_active=True,
            ).filter(
                Q(name__icontains=q) | Q(phone__icontains=q)
            ).values('id', 'name', 'phone', 'city')[:LIMIT]
        )

        orders = list(
            Order.objects.filter(
                shop=shop,
            ).filter(
                Q(order_number__icontains=q) | Q(customer__name__icontains=q)
            ).select_related('customer')
            .values('id', 'order_number', 'status', 'total_amount', 'customer__name')[:LIMIT]  # noqa: E501
        )
        for o in orders:
            o['customer_name'] = o.pop('customer__name', None)

        return Response({
            'products': products,
            'customers': customers,
            'orders': orders,
        })
