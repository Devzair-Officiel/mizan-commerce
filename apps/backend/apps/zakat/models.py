import uuid
from decimal import Decimal
from django.db import models
from django.db.models.functions import ExtractYear
from apps.shops.models import Shop


class ZakatCalculation(models.Model):
    """Calcul de zakat commerciale d'une boutique pour une date de référence.

    Cycle de vie : `draft` (assistant en cours) → `finalized` (calcul figé).
    Une seule fiche `draft` active à la fois par boutique : si l'utilisateur reprend
    son brouillon, on PATCH la fiche existante au lieu d'en créer une nouvelle.
    """

    STATUS_DRAFT = 'draft'
    STATUS_FINALIZED = 'finalized'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Brouillon'),
        (STATUS_FINALIZED, 'Finalisé'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='zakat_calculations')

    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    # Dernière étape atteinte par l'assistant (0 = liquidités … 5 = récapitulatif).
    # Permet au frontend de reprendre le brouillon au bon endroit.
    current_step = models.PositiveSmallIntegerField(default=0)

    reference_date = models.DateField()

    # ── Liquidités ─────────────────────────────────────────────────────────────
    cash_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))

    # ── Créances clients ───────────────────────────────────────────────────────
    # `has_receivables` permet de distinguer "non renseigné" de "explicitement aucune".
    # `receivables_nominal` = total dû par les clients (mémoire).
    # `receivables_breakdown` = ventilation en 3 classes :
    #   [{'category': 'certain'|'probable'|'doubtful', 'amount': str}]
    # Seules les classes `certain` + `probable` entrent dans `receivables_amount` (cache).
    # Les `doubtful` sont conservées pour mémoire / PDF mais hors base.
    has_receivables = models.BooleanField(default=False)
    receivables_nominal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    receivables_breakdown = models.JSONField(default=list, blank=True)
    receivables_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))

    # ── Stock commercial ───────────────────────────────────────────────────────
    # `stock_value_estimated` = auto-calcul depuis le catalogue (référence).
    # `stock_breakdown` = ventilation manuelle, prioritaire si renseignée :
    #   [{'category': 'finished'|'raw_materials'|'work_in_progress'|'in_transit',
    #     'amount': str}]
    # `stock_value_adjusted` = legacy (ancien ajustement global), conservé pour
    # rétro-compat mais ignoré si `stock_breakdown` est non vide.
    stock_value_estimated = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    stock_breakdown = models.JSONField(default=list, blank=True)
    stock_value_adjusted = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    # ── Éléments exclus (pédagogique, non calculé) ─────────────────────────────
    # Liste de slugs cochés par l'utilisateur pour confirmer sa compréhension :
    # ['vehicle', 'computer', 'machine', 'premises', 'furniture', 'other'].
    excluded_items_acknowledged = models.JSONField(default=list, blank=True)

    # ── Dettes ─────────────────────────────────────────────────────────────────
    # Ventilation par catégorie. Chaque item :
    #   {'category': 'supplier'|'tax_vat'|'salary'|'loan'|'other',
    #    'label': str (libellé libre du commerçant),
    #    'amount': str (Decimal sérialisé),
    #    'is_immediately_due': bool}
    # Seules les dettes `is_immediately_due=True` entrent dans `short_term_debts`
    # (cache recalculé à chaque enregistrement).
    debts_breakdown = models.JSONField(default=list, blank=True)
    short_term_debts = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))

    # ── Résultat figé (renseigné uniquement à la finalisation) ─────────────────
    zakat_base = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    zakat_rate = models.DecimalField(max_digits=5, decimal_places=4, default=Decimal('0.0250'))
    zakat_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    currency = models.CharField(max_length=3)

    # ── Snapshot du seuil de Nisab à la finalisation ──────────────────────────
    # Conservés sur la fiche pour figer le calcul (le cours évolue après finalisation).
    # `None` si la boutique n'avait pas configuré le Nisab au moment du calcul.
    nisab_method = models.CharField(max_length=8, blank=True)
    nisab_unit_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    nisab_threshold = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    pdf_object_key = models.CharField(max_length=500, blank=True)
    notes = models.TextField(blank=True)
    finalized_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'zakat_calculations'
        ordering = ['-reference_date', '-created_at']
        indexes = [
            models.Index(fields=['shop', 'status']),
        ]
        constraints = [
            # Un seul calcul finalisé par boutique et par année — un hawl, un justificatif.
            # Le check applicatif côté service donne un message clair ; cet index est le filet
            # de sécurité contre les courses concurrentes.
            models.UniqueConstraint(
                models.F('shop'),
                ExtractYear('reference_date'),
                condition=models.Q(status='finalized'),
                name='unique_finalized_zakat_per_shop_year',
            ),
        ]

    def __str__(self) -> str:
        return f'Zakat {self.shop} — {self.reference_date} ({self.status})'

    @property
    def is_above_nisab(self) -> bool | None:
        """`True`/`False` si seuil configuré, `None` sinon (impossible à déterminer)."""
        if self.nisab_threshold is None:
            return None
        return self.zakat_base >= self.nisab_threshold

    @property
    def stock_value_for_base(self) -> Decimal:
        """Valeur du stock retenue pour la base zakatable.

        Priorité :
          1. Somme de `stock_breakdown` si non vide (ventilation manuelle, autoritaire).
          2. Sinon `stock_value_adjusted` (rétro-compat).
          3. Sinon `stock_value_estimated` (auto-calcul catalogue).
        """
        if self.stock_breakdown:
            from .services import sum_stock_breakdown
            return sum_stock_breakdown(self.stock_breakdown)
        if self.stock_value_adjusted is not None:
            return self.stock_value_adjusted
        return self.stock_value_estimated
