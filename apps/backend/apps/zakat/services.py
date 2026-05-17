from decimal import Decimal
from django.db.models import Sum, F, ExpressionWrapper, DecimalField

from apps.shops.models import Shop
from apps.products.models import Product
from .models import ZakatCalculation


def compute_stock_value(shop: Shop) -> Decimal:
    """Sum of (purchase_price * stock_quantity) for active products with positive stock."""
    result = (
        Product.objects.filter(shop=shop, is_active=True, stock_quantity__gt=0)
        .annotate(
            line_value=ExpressionWrapper(
                F('purchase_price') * F('stock_quantity'),
                output_field=DecimalField(max_digits=14, decimal_places=2),
            )
        )
        .aggregate(total=Sum('line_value'))['total']
    )
    return result or Decimal('0')


def calculate_zakat(
    shop: Shop,
    reference_date,
    cash_amount: Decimal = Decimal('0'),
    receivables_amount: Decimal = Decimal('0'),
    short_term_debts: Decimal = Decimal('0'),
    stock_value_adjusted: Decimal | None = None,
    notes: str = '',
    zakat_rate: Decimal = Decimal('0.0250'),
) -> ZakatCalculation:
    stock_estimated = compute_stock_value(shop)
    stock_for_base = stock_value_adjusted if stock_value_adjusted is not None else stock_estimated

    zakat_base = stock_for_base + cash_amount + receivables_amount - short_term_debts
    if zakat_base < Decimal('0'):
        zakat_base = Decimal('0')

    zakat_amount = (zakat_base * zakat_rate).quantize(Decimal('0.01'))

    return ZakatCalculation.objects.create(
        shop=shop,
        reference_date=reference_date,
        stock_value_estimated=stock_estimated,
        stock_value_adjusted=stock_value_adjusted,
        cash_amount=cash_amount,
        receivables_amount=receivables_amount,
        short_term_debts=short_term_debts,
        zakat_base=zakat_base,
        zakat_rate=zakat_rate,
        zakat_amount=zakat_amount,
        currency=shop.currency,
        notes=notes,
    )
