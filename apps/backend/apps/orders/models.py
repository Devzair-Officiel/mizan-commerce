import uuid
from django.conf import settings
from django.db import models
from apps.shops.models import Shop
from apps.customers.models import Customer
from apps.products.models import ProductVariant


class Order(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Brouillon'),
        ('to_prepare', 'À préparer'),
        ('prepared', 'Préparé'),
        ('shipped', 'Expédié'),
        ('cancelled', 'Annulé'),
    ]
    PAYMENT_STATUS_CHOICES = [
        ('unpaid', 'Non payé'),
        ('partial', 'Partiel'),
        ('paid', 'Payé'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='orders')
    customer = models.ForeignKey(
        Customer, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='orders'
    )
    order_number = models.CharField(max_length=20)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='unpaid')
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    shipping_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='created_orders'
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='updated_orders'
    )
    stock_reserved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'orders'
        unique_together = ('shop', 'order_number')
        indexes = [
            models.Index(fields=['shop', 'status']),
            models.Index(fields=['shop', 'payment_status']),
            models.Index(fields=['shop', '-created_at']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.order_number} — {self.shop}'


class OrderItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='order_items')
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    variant = models.ForeignKey(
        ProductVariant, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='order_items'
    )
    # Dénormalisé pour l'historique : si le produit ou la variante est supprimé,
    # on garde une trace lisible de ce qui a été commandé.
    product_name = models.CharField(max_length=200)
    variant_name = models.CharField(max_length=120, blank=True)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    quantity = models.IntegerField()
    line_total = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'order_items'
        indexes = [models.Index(fields=['order'])]

    def __str__(self):
        suffix = f' ({self.variant_name})' if self.variant_name else ''
        return f'{self.quantity} × {self.product_name}{suffix}'

    def save(self, *args, **kwargs):
        from decimal import Decimal
        self.line_total = Decimal(str(self.unit_price)) * self.quantity
        super().save(*args, **kwargs)
