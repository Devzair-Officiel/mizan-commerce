import uuid

from django.db import models

from apps.customers.models import Customer
from apps.shops.models import Shop


class PreparedMessage(models.Model):
    """Message WhatsApp préparé côté serveur, jamais envoyé automatiquement.

    URS-031 / URS-066 / URS-067 : le commerçant prépare un message à partir d'un
    contexte (commande, client, produit, libre), peut le modifier, puis ouvre
    WhatsApp via wa.me. L'envoi reste manuel. L'historique sert à garder la trace
    des relances et communications passées.
    """

    class TemplateType(models.TextChoices):
        ORDER_CONFIRMATION = 'order_confirmation', 'Confirmation de commande'
        TRACKING = 'tracking', 'Suivi de colis'
        UNPAID_FOLLOWUP = 'unpaid_followup', 'Relance impayé'
        PROMO = 'promo', 'Promotion'
        FREE = 'free', 'Libre'

    class ContextType(models.TextChoices):
        ORDER = 'order', 'Commande'
        CUSTOMER = 'customer', 'Client'
        PRODUCT = 'product', 'Produit'
        NONE = 'none', 'Aucun'

    class Status(models.TextChoices):
        PREPARED = 'prepared', 'Préparé'
        SENT_MANUALLY = 'sent_manually', 'Envoyé manuellement'
        ARCHIVED = 'archived', 'Archivé'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='prepared_messages')

    template_type = models.CharField(max_length=30, choices=TemplateType.choices)
    context_type = models.CharField(
        max_length=30, choices=ContextType.choices, default=ContextType.NONE,
    )
    # Pas de FK formelle : l'ID polymorphique est résolu côté service selon `context_type`.
    context_id = models.UUIDField(null=True, blank=True)

    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='prepared_messages',
    )
    recipient_name = models.CharField(max_length=150, blank=True)
    recipient_phone = models.CharField(max_length=30, blank=True)

    # Contenu final du message — celui que l'utilisateur copiera / ouvrira dans WhatsApp.
    message = models.TextField()

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PREPARED)
    sent_manually_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'prepared_messages'
        indexes = [
            models.Index(fields=['shop', '-created_at']),
            models.Index(fields=['shop', 'status']),
            models.Index(fields=['shop', 'customer']),
        ]
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.get_template_type_display()} → {self.recipient_name or self.recipient_phone or "?"}'
