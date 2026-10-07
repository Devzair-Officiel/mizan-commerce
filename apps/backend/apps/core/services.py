from datetime import datetime, date, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.db.models import F, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.customers.models import Customer
from apps.notes.models import Reminder
from apps.orders.models import Order
from apps.orders.services import build_items_preview_batch
from apps.products.models import Product, ProductVariant
from apps.shops.models import Shop


def _day_bounds(now: datetime, tz: ZoneInfo) -> tuple[datetime, datetime, date]:
    local = now.astimezone(tz)
    today_local = local.date()
    day_start = datetime(today_local.year, today_local.month, today_local.day, tzinfo=tz)  # noqa: E501
    day_end = day_start + timedelta(days=1)
    return day_start, day_end, today_local


def _build_today_revenue(shop: Shop, day_start: datetime, day_end: datetime) -> dict:
    qs = Order.objects.filter(
        shop=shop,
        created_at__gte=day_start,
        created_at__lt=day_end,
    ).exclude(status__in=('draft', 'cancelled'))
    revenue = qs.aggregate(total=Sum('total_amount'))['total'] or Decimal('0')
    return {'revenue': str(revenue), 'orders_count': qs.count()}


def _build_yesterday_revenue(shop: Shop, today_local: date, tz: ZoneInfo) -> str:
    yesterday = today_local - timedelta(days=1)
    y_start = datetime(yesterday.year, yesterday.month, yesterday.day, tzinfo=tz)
    y_end = y_start + timedelta(days=1)
    revenue = Order.objects.filter(
        shop=shop,
        created_at__gte=y_start,
        created_at__lt=y_end,
    ).exclude(status__in=('draft', 'cancelled')).aggregate(
        total=Sum('total_amount'),
    )['total'] or Decimal('0')
    return str(revenue)


def _build_last_7_days(shop: Shop, today_local: date, tz: ZoneInfo) -> list:
    window_start = today_local - timedelta(days=6)
    w_start_dt = datetime(window_start.year, window_start.month, window_start.day, tzinfo=tz)  # noqa: E501
    w_end_dt = datetime(today_local.year, today_local.month, today_local.day, tzinfo=tz) + timedelta(days=1)  # noqa: E501
    rows = (
        Order.objects.filter(
            shop=shop,
            created_at__gte=w_start_dt,
            created_at__lt=w_end_dt,
        )
        .exclude(status__in=('draft', 'cancelled'))
        .annotate(day=TruncDate('created_at', tzinfo=tz))
        .values('day')
        .annotate(total=Sum('total_amount'))
    )
    revenue_by_day = {row['day']: row['total'] or Decimal('0') for row in rows}
    return [
        {
            'date': (window_start + timedelta(days=i)).isoformat(),
            'revenue': str(revenue_by_day.get(window_start + timedelta(days=i), Decimal('0'))),  # noqa: E501
        }
        for i in range(7)
    ]


def _build_orders_to_prepare(shop: Shop) -> dict:
    qs = (
        Order.objects.filter(shop=shop, status='to_prepare')
        .select_related('customer')
        .order_by('created_at')
    )
    total = qs.count()
    rows = list(
        qs.values('id', 'order_number', 'total_amount', 'payment_status', 'created_at', 'customer__name')[:5]  # noqa: E501
    )
    for o in rows:
        o['customer_name'] = o.pop('customer__name', None)

    oldest_created_at = rows[0]['created_at'].isoformat() if rows else None

    items_by_order = build_items_preview_batch([o['id'] for o in rows])
    for o in rows:
        oid = str(o['id'])
        all_items = items_by_order.get(oid, [])
        o['items_count'] = len(all_items)
        o['items_preview'] = all_items[:3]
        o['total_amount'] = str(o['total_amount'])
        o['created_at'] = o['created_at'].isoformat()

    return {'count': total, 'oldest_created_at': oldest_created_at, 'items': rows}


def _build_unpaid_orders(shop: Shop) -> dict:
    qs = Order.objects.filter(
        shop=shop,
        payment_status__in=('unpaid', 'partial'),
        status__in=('to_prepare', 'prepared', 'shipped'),
    ).order_by('created_at')
    total = qs.count()
    agg = qs.aggregate(total_amount_sum=Sum('total_amount'), paid_sum=Sum('amount_paid'))  # noqa: E501
    total_due = (agg['total_amount_sum'] or Decimal('0')) - (agg['paid_sum'] or Decimal('0'))  # noqa: E501

    rows = list(
        qs.values(
            'id', 'order_number', 'total_amount', 'payment_status', 'created_at',
            'customer__name', 'customer__phone', 'customer_id', 'amount_paid',
        )[:5]
    )
    for o in rows:
        o['customer_name'] = o.pop('customer__name', None)
        o['customer_phone'] = o.pop('customer__phone', None) or ''
        cid = o.pop('customer_id', None)
        o['customer_id'] = str(cid) if cid else None
        amount_due = (o['total_amount'] or Decimal('0')) - (o['amount_paid'] or Decimal('0'))  # noqa: E501
        o['amount_due'] = str(amount_due)
        o['total_amount'] = str(o['total_amount'])
        o['amount_paid'] = str(o['amount_paid'])
        o['created_at'] = o['created_at'].isoformat()

    return {'count': total, 'total_due': str(total_due), 'items': rows}


def _build_low_stock(shop: Shop) -> dict:
    qs = (
        ProductVariant.objects.filter(
            shop=shop, is_active=True, product__is_active=True, product__type='product',
        )
        .filter(
            Q(stock_quantity__lte=0) |
            Q(low_stock_threshold__isnull=False, stock_quantity__lte=F('low_stock_threshold'))  # noqa: E501
        )
        .select_related('product')
        .order_by('stock_quantity')
    )
    total = qs.count()
    out_of_stock_count = qs.filter(stock_quantity__lte=0).count()
    rows = list(qs.values(
        'id', 'packaging_name', 'unit', 'base_quantity', 'stock_quantity',
        'low_stock_threshold', 'product_id', 'product__name',
    )[:5])
    items = [
        {
            'id': row['product_id'],
            'variant_id': row['id'],
            'name': row['product__name'],
            'variant_name': row['packaging_name'],
            'unit': row['unit'],
            'base_quantity': row['base_quantity'],
            'stock_quantity': row['stock_quantity'],
            'low_stock_threshold': row['low_stock_threshold'],
        }
        for row in rows
    ]
    return {'count': total, 'out_of_stock_count': out_of_stock_count, 'items': items}


def _build_today_reminders(shop: Shop, day_start: datetime, day_end: datetime) -> dict:
    # Pending reminders due before end of today (includes overdue)
    qs = Reminder.objects.filter(
        shop=shop,
        status='pending',
        due_at__lt=day_end,
    ).values('id', 'title', 'category', 'due_at', 'customer_id', 'order_id')

    all_items = list(qs)
    total = len(all_items)

    all_items.sort(key=lambda r: (r['due_at'] >= day_start, r['due_at']))

    items = [
        {
            'id': str(r['id']),
            'title': r['title'],
            'category': r['category'],
            'due_at': r['due_at'].isoformat(),
            'customer_id': str(r['customer_id']) if r['customer_id'] else None,
            'order_id': str(r['order_id']) if r['order_id'] else None,
            'is_overdue': r['due_at'] < day_start,
        }
        for r in all_items[:5]
    ]
    return {'count': total, 'items': items}


def _build_setup(shop: Shop) -> dict:
    return {
        'has_orders': Order.objects.filter(shop=shop).exists(),
        'products_count': Product.objects.filter(shop=shop, is_active=True).count(),
        'customers_count': Customer.objects.filter(shop=shop, is_active=True).count(),
    }


def build_dashboard_today(shop: Shop, now: datetime | None = None) -> dict:
    if now is None:
        now = timezone.now()
    tz = ZoneInfo(shop.timezone)
    day_start, day_end, today_local = _day_bounds(now, tz)

    today_data = _build_today_revenue(shop, day_start, day_end)
    yesterday_revenue = _build_yesterday_revenue(shop, today_local, tz)
    last_7_days = _build_last_7_days(shop, today_local, tz)

    return {
        'today': {
            'revenue': today_data['revenue'],
            'revenue_yesterday': yesterday_revenue,
            'orders_count': today_data['orders_count'],
        },
        'revenue_last_7_days': last_7_days,
        'orders_to_prepare': _build_orders_to_prepare(shop),
        'unpaid_orders': _build_unpaid_orders(shop),
        'low_stock_products': _build_low_stock(shop),
        'today_reminders': _build_today_reminders(shop, day_start, day_end),
        'setup': _build_setup(shop),
    }
