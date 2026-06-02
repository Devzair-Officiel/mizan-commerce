import uuid
from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    ACTION_CHOICES = [
        ('stock_entry', 'Entrée stock'),
        ('stock_exit', 'Sortie stock'),
        ('stock_adjustment', 'Ajustement stock'),
        ('order_created', 'Création commande'),
        ('order_status_change', 'Changement statut commande'),
        ('order_payment_change', 'Changement paiement commande'),
        ('customer_delete', 'Suppression client'),
        ('product_delete', 'Suppression produit'),
        ('product_deactivate', 'Désactivation produit'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop_id = models.UUIDField(db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='audit_logs',
    )
    action = models.CharField(max_length=30, choices=ACTION_CHOICES)
    model_name = models.CharField(max_length=50)
    object_id = models.CharField(max_length=36, db_index=True)
    object_repr = models.CharField(max_length=200)
    changes = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['shop_id', 'created_at'])]

    def __str__(self) -> str:
        return f'{self.action} — {self.object_repr}'
