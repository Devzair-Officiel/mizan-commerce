import uuid
from django.conf import settings
from django.db import models


class Shop(models.Model):
    NISAB_METHOD_GOLD = 'gold'
    NISAB_METHOD_SILVER = 'silver'
    NISAB_METHOD_CHOICES = [
        (NISAB_METHOD_GOLD, 'Or (85 g)'),
        (NISAB_METHOD_SILVER, 'Argent (595 g)'),
    ]

    CATALOG_PRODUCTS = 'products'
    CATALOG_SERVICES = 'services'
    CATALOG_BOTH = 'both'
    CATALOG_KIND_CHOICES = [
        (CATALOG_PRODUCTS, 'Produits'),
        (CATALOG_SERVICES, 'Services'),
        (CATALOG_BOTH, 'Les deux'),
    ]

    DASHBOARD_MINIMAL = 'minimal'
    DASHBOARD_COMPLETE = 'complete'
    DASHBOARD_MODE_CHOICES = [
        (DASHBOARD_MINIMAL, 'Minimaliste'),
        (DASHBOARD_COMPLETE, 'Complet'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    currency = models.CharField(max_length=3, default='EUR')
    country = models.CharField(max_length=2, blank=True)
    timezone = models.CharField(max_length=50, default='Europe/Paris')
    zakat_annual_date = models.DateField(null=True, blank=True)
    # Méthode et prix unitaire (par gramme) utilisés pour calculer le seuil de Nisab.
    # Pas de valeur par défaut sur le prix : le cours fluctue, l'utilisateur doit le saisir.
    # Argent par défaut comme méthode (plus inclusif, recommandé pour la zakat commerciale).
    nisab_method = models.CharField(
        max_length=8, choices=NISAB_METHOD_CHOICES, default=NISAB_METHOD_SILVER,
    )
    nisab_unit_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
    )
    logo_object_key = models.CharField(max_length=500, blank=True)

    # ── Facturation ─────────────────────────────────────────────────────────
    # Champs libres : chaque commerçant remplit selon sa juridiction (FR/MA/TN/US…).
    # `tax_id` accepte SIRET, n° TVA intracom, NIF, EIN, etc. — pas de format imposé.
    # `legal_mentions` est imprimé en pied de facture, libre au commerçant d'y mettre
    # ses mentions légales locales (auto-liquidation, franchise en base, n° RCS…).
    legal_address = models.TextField(blank=True)
    tax_id = models.CharField(max_length=64, blank=True)
    legal_mentions = models.TextField(blank=True)
    # Taux par défaut appliqué à la création d'une facture (0 si non assujetti).
    default_tax_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
    )
    default_payment_terms_days = models.PositiveSmallIntegerField(default=30)

    # ── Onboarding ──────────────────────────────────────────────────────────
    # Choix saisis dans le wizard 1er login, modifiables ensuite depuis les
    # réglages. `onboarding_completed_at` non null = wizard validé (ou skippé).
    catalog_kind = models.CharField(
        max_length=10, choices=CATALOG_KIND_CHOICES, default=CATALOG_BOTH,
    )
    dashboard_mode = models.CharField(
        max_length=10, choices=DASHBOARD_MODE_CHOICES, default=DASHBOARD_COMPLETE,
    )
    onboarding_completed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'shops'

    def save(self, *args, **kwargs):
        from .services import timezone_for_country
        self.timezone = timezone_for_country(self.country)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    @property
    def effective_plan(self):
        """Renvoie le `SubscriptionPlan` réellement applicable maintenant.

        Si l'essai 14j est dépassé mais que la tâche Celery `expire_trials` n'a
        pas encore tourné, on rebascule sur Gratuit côté lecture pour gater
        immédiatement les fonctionnalités. La DB sera réconciliée par le run
        quotidien (et par `services.expire_trial()` au prochain accès écrivain).

        Renvoie le plan Gratuit pour toute boutique sans souscription (cas
        ancien stock, tests, ou migration en cours).
        """
        # Import local pour éviter la dépendance circulaire shops ↔ subscriptions
        # (subscriptions référence shops via string-FK, shops lit subscriptions ici).
        from apps.subscriptions.models import Subscription, SubscriptionPlan

        sub = getattr(self, 'subscription', None)
        if sub is None or sub.is_trial_expired:
            return SubscriptionPlan.objects.get(code=SubscriptionPlan.CODE_FREE)
        if sub.status in (Subscription.STATUS_CANCELLED, Subscription.STATUS_PAUSED):
            return SubscriptionPlan.objects.get(code=SubscriptionPlan.CODE_FREE)
        return sub.plan


class ShopMember(models.Model):
    ROLE_OWNER = 'owner'
    ROLE_ADMIN = 'admin'
    ROLE_STAFF = 'staff'
    ROLE_CHOICES = [
        (ROLE_OWNER, 'Owner'),
        (ROLE_ADMIN, 'Admin'),
        (ROLE_STAFF, 'Staff'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='shop_memberships')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_OWNER)
    permissions = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'shop_members'
        unique_together = ('shop', 'user')

    def __str__(self):
        return f'{self.user} — {self.shop} ({self.role})'

    @property
    def is_admin(self) -> bool:
        return self.role in (self.ROLE_OWNER, self.ROLE_ADMIN)

    def has_module(self, module: str) -> bool:
        if self.is_admin:
            return True
        return module in (self.permissions or [])
