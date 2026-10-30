"""Devis (URS-111) : brouillon, envoi, acceptation ou refus, expiration, conversion.

Un devis reprend les champs d'une facture (`BillingDocument`, `BillingLine`).
Envoyé, il est figé : lignes, montants, instantanés vendeur et acheteur ne
changent plus, seul le statut évolue ; une révision est une copie en brouillon.
"""

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.customers.models import Customer
from apps.invoices.models import BillingDocument, BillingLine, Invoice
from apps.shops.models import Shop


def reopen_quote(collector, field, sub_objs, using) -> None:
    """Facture issue du devis supprimée (un brouillon seulement) : le devis
    redevient accepté, sans facture, et peut être converti à nouveau."""
    collector.add_field_update(field, None, sub_objs)
    status = field.model._meta.get_field('status')
    collector.add_field_update(status, Quote.STATUS_ACCEPTED, sub_objs)


class Quote(BillingDocument):
    """Devis client ; numéro `devis-…` et instantanés attribués à l'envoi."""

    STATUS_DRAFT = 'draft'
    STATUS_SENT = 'sent'
    STATUS_ACCEPTED = 'accepted'
    STATUS_DECLINED = 'declined'
    STATUS_EXPIRED = 'expired'
    STATUS_INVOICED = 'invoiced'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Brouillon'),
        (STATUS_SENT, 'Envoyé'),
        (STATUS_ACCEPTED, 'Accepté'),
        (STATUS_DECLINED, 'Refusé'),
        (STATUS_EXPIRED, 'Expiré'),
        (STATUS_INVOICED, 'Facturé'),
    ]
    DEFAULT_VALIDITY_DAYS = 30

    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='quotes')
    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='quotes',
    )
    # Seul lien devis ↔ facture (spec §12 D8) ; `invoice.quote` par le lien inverse.
    invoice = models.OneToOneField(
        Invoice,
        on_delete=reopen_quote,
        null=True,
        blank=True,
        related_name='quote',
    )

    number = models.CharField(max_length=40, blank=True)
    status = models.CharField(
        max_length=12, choices=STATUS_CHOICES, default=STATUS_DRAFT
    )

    # Durée choisie sur le brouillon ; `valid_until` = date d'envoi + cette durée.
    validity_days = models.PositiveSmallIntegerField(
        default=DEFAULT_VALIDITY_DAYS,
        validators=[MinValueValidator(1), MaxValueValidator(365)],
    )
    valid_until = models.DateField(null=True, blank=True)
    payment_terms_days = models.PositiveSmallIntegerField(null=True, blank=True)

    sent_at = models.DateTimeField(null=True, blank=True)
    viewed_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    accepted_name = models.CharField(max_length=200, blank=True)
    declined_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'quotes'
        constraints = [
            models.UniqueConstraint(
                fields=['shop', 'number'],
                condition=~models.Q(number=''),
                name='unique_quote_number_per_shop',
            ),
        ]
        indexes = [
            models.Index(fields=['shop', '-sent_at']),
            models.Index(fields=['shop', 'status']),
            # Expiration quotidienne : devis envoyés dont la validité est passée.
            models.Index(fields=['status', 'valid_until']),
        ]
        ordering = ['-sent_at', '-created_at']

    def __str__(self) -> str:
        return f'{self.number or "Brouillon"} — {self.buyer_name}'


class QuoteLine(BillingLine):
    """Ligne de devis : mêmes champs qu'une ligne de facture, montants HT."""

    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='quote_lines')
    quote = models.ForeignKey(Quote, on_delete=models.RESTRICT, related_name='lines')

    class Meta:
        db_table = 'quote_lines'
        indexes = [models.Index(fields=['quote'])]
        ordering = ['position', 'created_at']

    def __str__(self) -> str:
        return f'{self.quantity} × {self.description}'
