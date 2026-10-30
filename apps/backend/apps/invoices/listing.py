"""Liste des factures : filtres, facettes et indicateurs (URS-097 / URS-099)."""

from collections.abc import Mapping
from decimal import Decimal

from django.db.models import Case, Count, F, Q, QuerySet, Sum, When

from apps.orders.services import current_month_bounds
from apps.shops.models import Shop

from .models import Invoice

DUE = Q(status='issued', total_ttc__gt=F('amount_paid'))
PAYMENTS = {
    'due': DUE,
    'unpaid': Q(status='issued', amount_paid=0),
    'partial': DUE & Q(amount_paid__gt=0),
    'paid': Q(status='paid'),
}
# Chiffre d'affaires (D9) : factures émises ou payées, avoirs soustraits.
REVENUE_STATUSES = (Invoice.STATUS_ISSUED, Invoice.STATUS_PAID)
SIGNED_TTC = Case(
    When(kind=Invoice.KIND_CREDIT_NOTE, then=-F('total_ttc')), default=F('total_ttc')
)


def filter_invoices(
    qs: QuerySet, shop: Shop, params: Mapping[str, str], *, skip: str = ''
) -> QuerySet:
    if skip != 'status' and params.get('status'):
        qs = qs.filter(status=params['status'])
    if skip != 'payment' and params.get('payment') in PAYMENTS:
        qs = qs.filter(PAYMENTS[params['payment']])
    period = params.get('period')
    if period in ('issued_month', 'paid_month'):
        start, end = current_month_bounds(shop)
        if period == 'paid_month':
            qs = qs.filter(
                kind=Invoice.KIND_INVOICE,
                status='paid',
                paid_at__gte=start,
                paid_at__lt=end,
            )
        else:
            qs = qs.filter(
                status__in=REVENUE_STATUSES, issued_at__gte=start, issued_at__lt=end
            )
    return qs


def invoice_facets(shop: Shop, qs: QuerySet, params: Mapping[str, str]) -> dict:
    """Chaque menu compte la recherche et tous les filtres sauf le sien."""
    statuses = filter_invoices(qs, shop, params, skip='status').aggregate(
        all=Count('id'),
        **{s: Count('id', filter=Q(status=s)) for s, _ in Invoice.STATUS_CHOICES},
    )
    payments = filter_invoices(qs, shop, params, skip='payment').aggregate(
        all=Count('id'),
        **{name: Count('id', filter=condition) for name, condition in PAYMENTS.items()},
    )
    return {'status': statuses, 'payment': payments}


def invoice_summary(shop: Shop) -> dict:
    """Mêmes ensembles que les filtres des trois indicateurs cliquables."""
    qs = Invoice.objects.filter(shop=shop)
    due = qs.filter(DUE).aggregate(
        count=Count('id'), amount=Sum(F('total_ttc') - F('amount_paid'))
    )
    result = {
        'due': {'count': due['count'], 'amount': str(due['amount'] or Decimal('0'))}
    }
    for period in ('issued_month', 'paid_month'):
        values = filter_invoices(qs, shop, {'period': period}).aggregate(
            count=Count('id'), amount=Sum(SIGNED_TTC)
        )
        result[period] = {
            'count': values['count'],
            'amount': str(values['amount'] or Decimal('0')),
        }
    return result
