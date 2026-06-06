from datetime import timedelta
from decimal import Decimal

from django.db.models import F, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.customers.models import Customer
from apps.orders.models import Order
from apps.products.models import Product, ProductVariant
from apps.notes.models import Reminder

from .permissions import HasModulePermission, get_shop

HasDashboardModule = HasModulePermission.for_module('dashboard')


class DashboardTodayView(APIView):
    permission_classes = (IsAuthenticated, HasDashboardModule)

    def get(self, request):
        shop = get_shop(request.user)
        now = timezone.now()
        today = now.date()

        yesterday = today - timedelta(days=1)
        today_orders_qs = Order.objects.filter(
            shop=shop,
            created_at__date=today,
        ).exclude(status__in=('draft', 'cancelled'))
        today_revenue = today_orders_qs.aggregate(total=Sum('total_amount'))['total'] or Decimal('0')
        today_orders_count = today_orders_qs.count()

        yesterday_revenue = Order.objects.filter(
            shop=shop,
            created_at__date=yesterday,
        ).exclude(status__in=('draft', 'cancelled')).aggregate(
            total=Sum('total_amount')
        )['total'] or Decimal('0')

        # CA jour par jour sur les 7 derniers jours (today inclus)
        window_start = today - timedelta(days=6)
        last7_rows = (
            Order.objects.filter(
                shop=shop,
                created_at__date__gte=window_start,
                created_at__date__lte=today,
            )
            .exclude(status__in=('draft', 'cancelled'))
            .annotate(day=TruncDate('created_at'))
            .values('day')
            .annotate(total=Sum('total_amount'))
        )
        revenue_by_day = {row['day']: row['total'] or Decimal('0') for row in last7_rows}
        last_7_days = [
            {
                'date': (window_start + timedelta(days=i)).isoformat(),
                'revenue': str(revenue_by_day.get(window_start + timedelta(days=i), Decimal('0'))),
            }
            for i in range(7)
        ]

        orders_to_prepare = list(
            Order.objects.filter(shop=shop, status='to_prepare')
            .select_related('customer')
            .values('id', 'order_number', 'total_amount', 'payment_status', 'created_at', 'customer__name')
            .order_by('created_at')[:10]
        )
        for o in orders_to_prepare:
            o['customer_name'] = o.pop('customer__name', None)

        unpaid_orders = list(
            Order.objects.filter(
                shop=shop,
                payment_status__in=('unpaid', 'partial'),
                status__in=('to_prepare', 'prepared', 'shipped'),
            )
            .select_related('customer')
            .values('id', 'order_number', 'total_amount', 'payment_status', 'created_at', 'customer__name')
            .order_by('created_at')[:10]
        )
        for o in unpaid_orders:
            o['customer_name'] = o.pop('customer__name', None)

        # On agrège au niveau variante : une ligne = une variante en rupture ou sous seuil.
        low_stock_qs = (
            ProductVariant.objects.filter(
                shop=shop, is_active=True, product__is_active=True, product__type='product',
            )
            .filter(
                Q(stock_quantity__lte=0) |
                Q(low_stock_threshold__isnull=False, stock_quantity__lte=F('low_stock_threshold'))
            )
            .select_related('product')
            .values(
                'id', 'packaging_name', 'unit', 'base_quantity', 'stock_quantity',
                'low_stock_threshold', 'product_id', 'product__name',
            )
            .order_by('stock_quantity')
        )
        low_stock_list = [
            {
                'id': row['product_id'],          # rétro-compat front : id du produit pour le lien
                'variant_id': row['id'],
                'name': row['product__name'],
                'variant_name': row['packaging_name'],
                'unit': row['unit'],
                'base_quantity': row['base_quantity'],
                'stock_quantity': row['stock_quantity'],
                'low_stock_threshold': row['low_stock_threshold'],
            }
            for row in low_stock_qs
        ]

        today_reminders = list(
            Reminder.objects.filter(
                shop=shop,
                status='pending',
                due_at__date=now.date(),
            )
            .values('id', 'title', 'category', 'due_at', 'customer_id', 'order_id')
            .order_by('due_at')
        )

        return Response({
            'today': {
                'revenue': str(today_revenue),
                'revenue_yesterday': str(yesterday_revenue),
                'orders_count': today_orders_count,
            },
            'revenue_last_7_days': last_7_days,
            'orders_to_prepare': {
                'count': len(orders_to_prepare),
                'items': orders_to_prepare,
            },
            'unpaid_orders': {
                'count': len(unpaid_orders),
                'items': unpaid_orders,
            },
            'low_stock_products': {
                'count': len(low_stock_list),
                'items': low_stock_list,
            },
            'today_reminders': {
                'count': len(today_reminders),
                'items': today_reminders,
            },
        })


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
                'is_out_of_stock': all(v.is_out_of_stock for v in variants) if variants else True,
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
            .values('id', 'order_number', 'status', 'total_amount', 'customer__name')[:LIMIT]
        )
        for o in orders:
            o['customer_name'] = o.pop('customer__name', None)

        return Response({
            'products': products,
            'customers': customers,
            'orders': orders,
        })
