from django.db.models import Q
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.shops.models import ShopMember
from apps.orders.models import Order
from apps.products.models import Product
from apps.notes.models import Reminder


def get_shop(user):
    membership = ShopMember.objects.filter(user=user).select_related('shop').first()
    if not membership:
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied('Aucune boutique associée.')
    return membership.shop


class DashboardTodayView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        shop = get_shop(request.user)
        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = now.replace(hour=23, minute=59, second=59, microsecond=999999)

        orders_to_prepare = list(
            Order.objects.filter(shop=shop, status='to_prepare')
            .values('id', 'order_number', 'total_amount', 'payment_status', 'created_at')
            .order_by('created_at')
        )

        unpaid_orders = list(
            Order.objects.filter(
                shop=shop,
                payment_status__in=('unpaid', 'partial'),
                status__in=('to_prepare', 'prepared', 'shipped'),
            )
            .values('id', 'order_number', 'total_amount', 'payment_status', 'created_at')
            .order_by('created_at')
        )

        from django.db.models import F
        low_stock_qs = Product.objects.filter(
            shop=shop, is_active=True
        ).filter(
            Q(stock_quantity=0) |
            Q(low_stock_threshold__isnull=False, stock_quantity__lte=F('low_stock_threshold'))
        ).values('id', 'name', 'stock_quantity', 'low_stock_threshold')
        low_stock_list = list(low_stock_qs.order_by('stock_quantity'))

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
