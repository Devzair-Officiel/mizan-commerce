import uuid
from django.db import models
from apps.shops.models import Shop


class Product(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='products')
    name = models.CharField(max_length=200)
    reference = models.CharField(max_length=50, blank=True)
    description = models.TextField(blank=True)
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2)
    stock_quantity = models.IntegerField(default=0)
    low_stock_threshold = models.IntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'products'
        indexes = [
            models.Index(fields=['shop', 'is_active']),
            models.Index(fields=['shop', 'name']),
            models.Index(fields=['shop', 'reference']),
        ]

    def __str__(self):
        return f'{self.name} ({self.shop})'

    @property
    def is_low_stock(self):
        return (
            self.low_stock_threshold is not None
            and self.stock_quantity <= self.low_stock_threshold
            and self.stock_quantity > 0
        )

    @property
    def is_out_of_stock(self):
        return self.stock_quantity <= 0


class ProductImage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='product_images')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
    object_key = models.CharField(max_length=500)
    is_primary = models.BooleanField(default=False)
    position = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'product_images'
        ordering = ['position']

    def __str__(self):
        return f'Image de {self.product.name} (pos {self.position})'
