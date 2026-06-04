import uuid

from django.db import models

from apps.customers.models import Customer
from apps.orders.models import Order
from apps.shops.models import Shop


class InvoiceSequence(models.Model):
    """Compteur atomique du n° de facture par boutique — continu, jamais reset.

    Verrouillé via `select_for_update()` côté service au moment d'émettre une facture
    pour garantir une numérotation continue et sans trou — exigence légale dans la
    plupart des juridictions (FR : art. 242 nonies A CGI, EU : Directive TVA).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.OneToOneField(Shop, on_delete=models.CASCADE, related_name='invoice_sequence')
    last_number = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'invoice_sequences'

    def __str__(self):
        return f'{self.shop} (last: {self.last_number})'


class Invoice(models.Model):
    """Facture client émise depuis une commande.

    Une fois émise, la facture est immuable sur ses montants et son numéro (exigence
    légale). On accepte uniquement un changement de statut (`issued` → `paid`/`cancelled`).
    Toutes les infos vendeur/acheteur sont **snapshottées** : si le commerçant change
    son adresse ou si le client est renommé, l'historique de facturation reste figé.
    """

    STATUS_ISSUED = 'issued'
    STATUS_PAID = 'paid'
    STATUS_CANCELLED = 'cancelled'
    STATUS_CHOICES = [
        (STATUS_ISSUED, 'Émise'),
        (STATUS_PAID, 'Payée'),
        (STATUS_CANCELLED, 'Annulée'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='invoices')
    # `SET_NULL` sur Order : la suppression d'une commande ne doit pas effacer la facture émise.
    order = models.OneToOneField(
        Order, on_delete=models.SET_NULL, null=True, blank=True, related_name='invoice',
    )
    customer = models.ForeignKey(
        Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name='invoices',
    )

    # Numéro humain stable, ex: "fact-040626-0001" — préfixe fixe, date d'émission,
    # compteur continu par boutique (jamais reset).
    number = models.CharField(max_length=40)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_ISSUED)

    issued_at = models.DateTimeField()
    due_date = models.DateField()
    paid_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    # ── Snapshot vendeur ───────────────────────────────────────────────────
    seller_name = models.CharField(max_length=120)
    seller_address = models.TextField(blank=True)
    seller_tax_id = models.CharField(max_length=64, blank=True)
    seller_legal_mentions = models.TextField(blank=True)
    seller_country = models.CharField(max_length=2, blank=True)

    # ── Snapshot client ────────────────────────────────────────────────────
    buyer_name = models.CharField(max_length=200, blank=True)
    buyer_address = models.TextField(blank=True)
    buyer_city = models.CharField(max_length=100, blank=True)
    buyer_postal_code = models.CharField(max_length=20, blank=True)
    buyer_country = models.CharField(max_length=2, blank=True)
    buyer_email = models.EmailField(max_length=254, blank=True)
    buyer_phone = models.CharField(max_length=30, blank=True)

    # ── Totaux figés à l'émission ──────────────────────────────────────────
    currency = models.CharField(max_length=3)
    # Taux TVA appliqué à toutes les lignes (uniforme en v1 — si besoin par-ligne plus tard).
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    subtotal_ht = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    # Remise commerciale et frais de port — snapshot depuis la commande à l'émission.
    # Règle TVA FR/UE : la base imposable = subtotal_ht − discount + shipping
    # (les remises diminuent la base, les frais de port accessoires l'augmentent).
    discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    shipping_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_ttc = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    # Montant réellement reçu — synchronisé depuis Order.amount_paid pour permettre
    # l'affichage "partiellement payée" sans dépendre de la commande au runtime.
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    notes = models.TextField(blank=True)
    pdf_object_key = models.CharField(max_length=500, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'invoices'
        constraints = [
            # Le numéro doit être strictement unique au sein d'une boutique.
            models.UniqueConstraint(fields=['shop', 'number'], name='unique_invoice_number_per_shop'),
        ]
        indexes = [
            models.Index(fields=['shop', '-issued_at']),
            models.Index(fields=['shop', 'status']),
        ]
        ordering = ['-issued_at', '-created_at']

    def __str__(self):
        return f'{self.number} — {self.seller_name}'


class InvoiceLine(models.Model):
    """Ligne de facture — snapshot d'un item de commande au moment de l'émission.

    Découplée du `OrderItem` : si la commande est modifiée ou supprimée, les lignes
    restent inchangées. Tous les montants en € HT.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='invoice_lines')
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='lines')

    description = models.CharField(max_length=300)
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    unit_price_ht = models.DecimalField(max_digits=12, decimal_places=2)
    line_subtotal_ht = models.DecimalField(max_digits=14, decimal_places=2)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'invoice_lines'
        indexes = [models.Index(fields=['invoice'])]
        ordering = ['created_at']

    def __str__(self):
        return f'{self.quantity} × {self.description}'
