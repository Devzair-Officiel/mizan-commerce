import uuid
from django.db import models
from django.db.models.functions import Lower
from apps.shops.models import Shop


class Product(models.Model):
    TYPE_CHOICES = (
        ('product', 'Produit'),
        ('service', 'Service'),
    )

    # Unités de vente : portées par chaque ProductVariant (pas par le Product).
    UNIT_CHOICES = (
        ('piece', 'Pièce'),
        ('g',    'Gramme'),
        ('kg',   'Kilogramme'),
        ('mL',   'Millilitre'),
        ('L',    'Litre'),
        ('m',    'Mètre'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='products')
    name = models.CharField(max_length=200)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES, default='product')
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'products'
        indexes = [
            models.Index(fields=['shop', 'is_active']),
            models.Index(fields=['shop', 'name']),
        ]
        constraints = [
            models.UniqueConstraint(Lower('name'), 'shop', name='unique_product_name_per_shop'),
        ]

    def __str__(self):
        return f'{self.name} ({self.shop})'


class ProductVariant(models.Model):
    """
    Une variante = un packaging concret d'un produit (ex. "Pot 250g", "Seau 5kg").
    Porte le prix, le stock, le sku/code-barres. Un produit a au moins une variante.

    Sémantique stock : `stock_quantity` compte des FORMATS (nb de pots, de sacs, etc.),
    pas le contenu cumulé. Pour le vrac, on modélise une variante de base_quantity = 1
    en unité (kg, L, m) → le format vaut une unité, donc stock = quantité physique.
    Le contenu total disponible est dérivé à la volée : `stock_quantity * base_quantity`.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='product_variants')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='variants')
    packaging_name = models.CharField(max_length=120)
    unit = models.CharField(
        max_length=8, choices=Product.UNIT_CHOICES, default='piece',
        help_text="Unité de mesure du contenu (g, kg, mL…). Descriptif uniquement, sert au prix au litre/kilo.",
    )
    base_quantity = models.DecimalField(
        max_digits=14, decimal_places=3, default=1,
        help_text='Quantité contenue par format (ex. 250 pour "Bouteille 250 mL").',
    )
    selling_price = models.DecimalField(max_digits=12, decimal_places=2)
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    stock_quantity = models.DecimalField(
        max_digits=14, decimal_places=3, default=0,
        help_text='Nombre de formats en stock (ex. 50 bouteilles), pas le contenu cumulé.',
    )
    low_stock_threshold = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    sku = models.CharField(max_length=64, blank=True)
    barcode = models.CharField(max_length=64, blank=True)
    position = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'product_variants'
        ordering = ['position', 'created_at']
        indexes = [
            models.Index(fields=['shop', 'product']),
            models.Index(fields=['shop', 'sku']),
            models.Index(fields=['shop', 'barcode']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['product', 'packaging_name'],
                name='unique_variant_packaging_per_product',
            ),
            models.UniqueConstraint(
                fields=['shop', 'sku'],
                condition=~models.Q(sku=''),
                name='unique_variant_sku_per_shop',
            ),
        ]

    def __str__(self):
        return f'{self.product.name} — {self.packaging_name}'

    @property
    def is_low_stock(self):
        from decimal import Decimal
        return (
            self.low_stock_threshold is not None
            and self.stock_quantity <= self.low_stock_threshold
            and self.stock_quantity > Decimal('0')
        )

    @property
    def is_out_of_stock(self):
        from decimal import Decimal
        return self.stock_quantity <= Decimal('0')


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
