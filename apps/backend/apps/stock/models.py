import uuid
from decimal import Decimal
from django.conf import settings
from django.db import models, transaction
from apps.shops.models import Shop
from apps.products.models import ProductVariant

MOVEMENT_SIGNS = {
    'in': 1,
    'release': 1,
    'out': -1,
    'reservation': -1,
    'loss': -1,
    'adjustment': None,  # peut être + ou - selon quantity signée
}


class StockMovement(models.Model):
    TYPE_CHOICES = [
        ('in', 'Entrée'),
        ('out', 'Sortie'),
        ('reservation', 'Réservation commande'),
        ('release', 'Libération commande'),
        ('adjustment', 'Ajustement'),
        ('loss', 'Perte / casse'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='stock_movements')
    variant = models.ForeignKey(
        ProductVariant, on_delete=models.CASCADE, related_name='stock_movements'
    )
    movement_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    # quantity = nombre de formats (bouteilles, sacs…), pas du contenu cumulé.
    # Toujours positive sauf pour 'adjustment' où elle peut être négative.
    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    reason = models.TextField(blank=True)
    order_id = models.UUIDField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='stock_movements'
    )
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
        movements = StockMovement.objects.filter(variant=self.variant)
        total = Decimal('0')
        for m in movements:
            total += m.get_signed_quantity()

        ProductVariant.objects.filter(pk=self.variant_id).update(stock_quantity=total)
