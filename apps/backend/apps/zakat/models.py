import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models

from apps.shops.models import Shop
from .hawl import CALENDAR_CHOICES


class ZakatProfile(models.Model):
    """Réglages zakat d'une personne dans une boutique : jour J, seuil, choix d'avis.

    Personnel : chaque admin a le sien. Les choix d'avis valent `None` tant que la
    personne ne les a pas faits — jamais de valeur par défaut (référentiel § 1).
    """

    NISAB_METHOD_GOLD = 'gold'
    NISAB_METHOD_SILVER = 'silver'
    NISAB_METHOD_CHOICES = [
        (NISAB_METHOD_GOLD, 'Or (85 g)'),
        (NISAB_METHOD_SILVER, 'Argent (595 g)'),
    ]
    STOCK_VALUATION_SALE = 'sale'
    STOCK_VALUATION_PURCHASE = 'purchase'
    STOCK_VALUATION_CHOICES = [
        (STOCK_VALUATION_SALE, 'Prix de vente'),
        (STOCK_VALUATION_PURCHASE, 'Prix d\'achat'),
    ]
    RECEIVABLES_YEARLY = 'yearly'
    RECEIVABLES_ON_COLLECTION = 'on_collection'
    RECEIVABLES_MODE_CHOICES = [
        (RECEIVABLES_YEARLY, 'Comptées chaque année'),
        (RECEIVABLES_ON_COLLECTION, 'Versées à l\'encaissement'),
    ]
    DEBTS_ALL = 'all'
    DEBTS_WITHIN_12_MONTHS = 'within_12_months'
    DEBTS_NONE = 'none'
    DEBTS_MODE_CHOICES = [
        (DEBTS_ALL, 'Toutes les dettes'),
        (DEBTS_WITHIN_12_MONTHS, 'Part due dans les 12 mois'),
        (DEBTS_NONE, 'Aucune'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='zakat_profiles')  # noqa: E501
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='zakat_profiles',  # noqa: E501
    )

    hawl_date = models.DateField(null=True, blank=True)
    calendar = models.CharField(max_length=10, choices=CALENDAR_CHOICES, null=True, blank=True)  # noqa: E501

    nisab_method = models.CharField(
        max_length=8, choices=NISAB_METHOD_CHOICES, null=True, blank=True,
    )
    nisab_unit_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)  # noqa: E501
    # Posé par le serveur quand le prix change : l'écran alerte au-delà de 7 jours.
    nisab_price_updated_at = models.DateTimeField(null=True, blank=True)

    stock_valuation = models.CharField(
        max_length=10, choices=STOCK_VALUATION_CHOICES, null=True, blank=True,
    )
    receivables_mode = models.CharField(
        max_length=16, choices=RECEIVABLES_MODE_CHOICES, null=True, blank=True,
    )
    debts_mode = models.CharField(max_length=20, choices=DEBTS_MODE_CHOICES, null=True, blank=True)  # noqa: E501

    # Part de la personne dans la boutique, en % (0 < part ≤ 100). S'applique aux
    # montants de la boutique, pas aux autres biens (personnels).
    ownership_share = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('100'))  # noqa: E501

    # E-mail 7 jours avant le jour J. Année de hawl du dernier envoi (calendrier et
    # année) : posée par un update conditionnel, un seul e-mail par année de hawl.
    reminder_email_enabled = models.BooleanField(default=True)
    reminder_sent_calendar = models.CharField(max_length=10, choices=CALENDAR_CHOICES, null=True, blank=True)  # noqa: E501
    reminder_sent_year = models.PositiveSmallIntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'zakat_profiles'
        constraints = [
            models.UniqueConstraint(fields=['shop', 'user'], name='unique_zakat_profile_per_member'),  # noqa: E501
            models.CheckConstraint(
                condition=models.Q(ownership_share__gt=0, ownership_share__lte=100),
                name='zakat_profile_ownership_share_range',
            ),
            models.CheckConstraint(
                condition=models.Q(nisab_unit_price__isnull=True) | models.Q(nisab_unit_price__gt=0),  # noqa: E501
                name='zakat_profile_nisab_unit_price_positive',
            ),
        ]

    def __str__(self) -> str:
        return f'Profil zakat {self.user_id} — {self.shop}'


class ZakatCalculation(models.Model):
    """Calcul de zakat personnel d'un admin, pour une date de référence (jour J).

    Une fiche par personne, par boutique et par année de hawl (hégirienne ou
    grégorienne). Jamais figée : elle reste modifiable. Le résultat n'est pas
    stocké : il vient de `services.compute_totals`.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='zakat_calculations')  # noqa: E501
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='zakat_calculations',  # noqa: E501
    )
    # Incrémentée à chaque écriture : un PATCH qui porte une version périmée → 409.
    version = models.PositiveIntegerField(default=1)

    # Dernière étape validée de l'assistant (0 = aucune … 6 = toutes les saisies ;
    # l'étape 7 est le résultat). Bornée par le serializer.
    current_step = models.PositiveSmallIntegerField(default=0)

    reference_date = models.DateField()
    # Année du hawl, calculée côté serveur depuis `reference_date` et le calendrier
    # choisi dans la fiche (grégorien tant que la personne n'a pas choisi).
    hawl_calendar = models.CharField(max_length=10, choices=CALENDAR_CHOICES)
    hawl_year = models.PositiveSmallIntegerField()

    # ── Liquidités ─────────────────────────────────────────────────────────────
    cash_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))  # noqa: E501

    # ── Stock commercial ───────────────────────────────────────────────────────
    # Valeurs du catalogue le jour J (Σ quantité × prix), recopiées tant que le jour J
    # n'est pas passé, puis figées sauf demande explicite (`refresh_stock`).
    stock_sale_value = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))  # noqa: E501
    stock_purchase_value = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))  # noqa: E501
    # Stock hors Mizan, ajouté par la personne.
    stock_extra = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))  # noqa: E501

    # ── Saisies ligne à ligne (validées par les serializers, montants en str) ──
    # receivable_items : [{'order_id': uuid|None, 'label', 'amount', 'doubtful': bool}]
    # other_assets     : [{'category', 'label', 'amount', 'counted': bool}] — personnels
    # debt_items       : [{'category', 'label', 'amount', 'amount_within_12_months'}]
    receivable_items = models.JSONField(default=list, blank=True)
    other_assets = models.JSONField(default=list, blank=True)
    debt_items = models.JSONField(default=list, blank=True)
    # Choix de la fiche : copiés du profil à la création, modifiables ensuite. La
    # fiche la plus récente met à jour le profil (point de départ de la suivante).
    choices_snapshot = models.JSONField(default=dict, blank=True)

    currency = models.CharField(max_length=3)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'zakat_calculations'
        ordering = ['-reference_date', '-created_at']
        indexes = [
            models.Index(fields=['shop', 'user']),
        ]
        constraints = [
            # Un calcul par personne et par année de hawl. Filet contre les courses
            # concurrentes : l'IntegrityError devient un 409 avec l'id existant.
            models.UniqueConstraint(
                fields=['shop', 'user', 'hawl_calendar', 'hawl_year'],
                name='unique_zakat_per_person_hawl_year',
            ),
        ]

    def __str__(self) -> str:
        return f'Zakat {self.shop} — {self.reference_date}'
