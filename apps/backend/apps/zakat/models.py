import uuid
from decimal import Decimal
from django.db import models
from apps.shops.models import Shop


class ZakatCalculation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='zakat_calculations')
    reference_date = models.DateField()
    stock_value_estimated = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    stock_value_adjusted = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    cash_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    receivables_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    short_term_debts = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    zakat_base = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    zakat_rate = models.DecimalField(max_digits=5, decimal_places=4, default=Decimal('0.0250'))
    zakat_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    currency = models.CharField(max_length=3)
    pdf_object_key = models.CharField(max_length=500, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'zakat_calculations'
        ordering = ['-reference_date']

    def __str__(self) -> str:
        return f'Zakat {self.shop} — {self.reference_date}'
