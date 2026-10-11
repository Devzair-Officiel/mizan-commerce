import uuid
from decimal import Decimal
from django.conf import settings
from django.db import models, transaction
from django.db.models import Case, F, Sum, Value, When
from django.db.models.functions import Abs, Coalesce
from apps.shops.models import Shop
from apps.products.models import ProductVariant

MOVEMENT_SIGNS = {
    'in': 1,
    'release': 1,
    'out': -1,
    'reservation': -1,
    'loss': -1,
    'breakage': -1,
    'internal_use': -1,
    'adjustment': None,  # peut être + ou - selon quantity signée
}

_QUANTITY = models.DecimalField(max_digits=16, decimal_places=3)

# Sorties manuelles (perte, casse, usage interne) : limitées au stock disponible.
EXIT_TYPES: tuple[str, ...] = ('loss', 'breakage', 'internal_use')


class StockMovement(models.Model):
    TYPE_CHOICES = [
        ('in', 'Entrée'),
        ('out', 'Sortie'),
        ('reservation', 'Réservation commande'),
        ('release', 'Libération commande'),
        ('adjustment', 'Ajustement'),
        ('loss', 'Perte'),
        ('breakage', 'Casse'),
        ('internal_use', 'Usage interne'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='stock_movements')  # noqa: E501
    # Historique protégé : un format qui a des mouvements ne se supprime pas
    # (RESTRICT ; seule la suppression de toute la boutique l'emporte).
    variant = models.ForeignKey(
        ProductVariant, on_delete=models.RESTRICT, related_name='stock_movements'
    )
    movement_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    # quantity = nombre de formats (bouteilles, sacs…), pas du contenu cumulé.
    # Toujours positive sauf pour 'adjustment' où elle peut être négative.
    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    reason = models.TextField(blank=True)
    order_id = models.UUIDField(null=True, blank=True)
    # Référence d'une entrée : prix d'achat payé, fournisseur et facture (facultatifs).
    unit_purchase_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
    )
    supplier_name = models.CharField(max_length=255, blank=True)
    invoice_number = models.CharField(max_length=100, blank=True)
    invoice_date = models.DateField(null=True, blank=True)
    ocr_result = models.ForeignKey(
        'ocr.OcrResult', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='stock_movements',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='stock_movements'
    )
    # Stock saisi à la création de l'article ou du format : seul mouvement qui
    # n'empêche pas de les supprimer. Posé uniquement par `create_variant`.
    is_initial = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'stock_movements'
        indexes = [
            models.Index(fields=['shop', 'variant', '-created_at']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_movement_type_display()} {self.quantity} × {self.variant}'

    def get_signed_quantity(self) -> Decimal:
        sign = MOVEMENT_SIGNS.get(self.movement_type)
        if sign is None:
            return self.quantity  # adjustment : quantité déjà signée
        return Decimal(sign) * abs(self.quantity)

    def save(self, *args, **kwargs):
        with transaction.atomic():
            super().save(*args, **kwargs)
            self._update_variant_cache()

    def _update_variant_cache(self):
        total = StockMovement.objects.filter(variant_id=self.variant_id).aggregate(
            total=Coalesce(
                Sum(signed_quantity()), Value(Decimal('0')), output_field=_QUANTITY,
            ),
        )['total']
        ProductVariant.objects.filter(pk=self.variant_id).update(stock_quantity=total)


def signed_quantity() -> Case:
    """Quantité signée d'un mouvement, en SQL (même règle que `get_signed_quantity`)."""
    negative = [t for t, sign in MOVEMENT_SIGNS.items() if sign == -1]
    return Case(
        When(movement_type='adjustment', then=F('quantity')),
        When(movement_type__in=negative, then=-Abs(F('quantity'))),
        default=Abs(F('quantity')),
        output_field=_QUANTITY,
    )
