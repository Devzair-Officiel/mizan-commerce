import uuid
from decimal import Decimal

from django.db import models
from django.utils import timezone


class SubscriptionPlan(models.Model):
    """Plan tarifaire géré par l'admin de la plateforme.

    Conforme à `docs/schema_base_donnees.md` §15. Trois plans seedés au démarrage
    (`free`, `pro`, `boutique_plus`). Les commerçants ne créent pas de plans —
    ils en souscrivent un.
    """

    CODE_FREE = 'free'
    CODE_PRO = 'pro'
    CODE_BOUTIQUE_PLUS = 'boutique_plus'
    # Ordre hiérarchique — utilisé par le gating (FEATURE_MIN_PLAN). Plus l'index
    # est élevé, plus le plan débloque de fonctionnalités.
    TIER_ORDER = (CODE_FREE, CODE_PRO, CODE_BOUTIQUE_PLUS)

    PERIOD_MONTH = 'month'
    PERIOD_YEAR = 'year'
    PERIOD_LIFETIME = 'lifetime'
    PERIOD_CHOICES = [
        (PERIOD_MONTH, 'Mensuel'),
        (PERIOD_YEAR, 'Annuel'),
        (PERIOD_LIFETIME, 'À vie'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    price_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    currency = models.CharField(max_length=3, default='EUR')
    billing_period = models.CharField(max_length=20, choices=PERIOD_CHOICES, blank=True)
    # Préparé pour la future intégration Stripe — laissé vide tant que la couche
    # facturation n'est pas branchée.
    stripe_price_id = models.CharField(max_length=100, blank=True)
    # NULL = illimité côté schéma. Le mapping FEATURE_MIN_PLAN gère le gating
    # qualitatif (modules), ces limites quantitatives s'appliquent en sus.
    max_products = models.PositiveIntegerField(null=True, blank=True)
    max_orders_per_month = models.PositiveIntegerField(null=True, blank=True)
    features_json = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'subscription_plans'
        ordering = ['price_amount']

    def __str__(self):
        return f'{self.name} ({self.code})'

    @property
    def tier(self) -> int:
        """Index dans la hiérarchie des plans (0 = free)."""
        try:
            return self.TIER_ORDER.index(self.code)
        except ValueError:
            return 0


class Subscription(models.Model):
    """Abonnement d'une boutique à un plan.

    OneToOne avec Shop : une boutique = un abonnement actif à un instant T.
    L'historique éventuel (changements de plan, anciens trials) sera tracé par
    `audit_logs` côté plateforme, pas par duplication ici.
    """

    STATUS_TRIALING = 'trialing'
    STATUS_ACTIVE = 'active'
    STATUS_PAST_DUE = 'past_due'
    STATUS_CANCELLED = 'cancelled'
    STATUS_PAUSED = 'paused'
    STATUS_CHOICES = [
        (STATUS_TRIALING, 'En essai'),
        (STATUS_ACTIVE, 'Actif'),
        (STATUS_PAST_DUE, 'Paiement en retard'),
        (STATUS_CANCELLED, 'Résilié'),
        (STATUS_PAUSED, 'Suspendu'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.OneToOneField(
        'shops.Shop', on_delete=models.CASCADE, related_name='subscription',
    )
    plan = models.ForeignKey(
        SubscriptionPlan, on_delete=models.PROTECT, related_name='subscriptions',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    # Stripe — préparés, vides tant que la couche paiement n'est pas branchée.
    stripe_subscription_id = models.CharField(max_length=100, blank=True)
    stripe_customer_id = models.CharField(max_length=100, blank=True)
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'subscriptions'

    def __str__(self):
        return f'{self.shop} — {self.plan.code} ({self.status})'

    @property
    def is_trial_expired(self) -> bool:
        """True si la souscription est en essai mais que la date de fin est passée.

        Utilisé par `Shop.effective_plan` pour gater même avant le run Celery —
        évite qu'un retard de la tâche périodique laisse passer une feature
        payante à un utilisateur dont l'essai est terminé.
        """
        if self.status != self.STATUS_TRIALING:
            return False
        if not self.current_period_end:
            return False
        return self.current_period_end <= timezone.now()
