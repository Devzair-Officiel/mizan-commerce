"""Site d'administration interne de Mizan (support, modération, débogage).

**Cet admin n'est PAS filtré par `shop_id`** : il voit toutes les boutiques. Il
est réservé aux superusers actifs de l'équipe Mizan et n'est joignable que par
le tailnet (docs/exploitation/acces-admin-django.md). Ne jamais réutiliser ce
site ni ses ModelAdmin pour une vue côté commerçant : celles-ci passent par
`ShopScopedQuerysetMixin`.

Posture : lecture seule par défaut (`ReadOnlyAdminMixin`). Les rares écritures
autorisées passent par un service qui trace l'action dans `AuditLog`.
"""

from __future__ import annotations

from typing import Any

from django.contrib.admin import AdminSite
from django.contrib.admin.forms import AdminAuthenticationForm
from django.contrib.auth.base_user import AbstractBaseUser
from django.core.exceptions import ValidationError
from django.http import HttpRequest
from django.urls import reverse

# Navigation par domaine : (clé, titre, [(modèle, nom affiché)]), dans l'ordre.
# Tout modèle enregistré doit y figurer (contrôlé par apps/core/test_admin.py).
DOMAINS: tuple[tuple[str, str, tuple[tuple[str, str], ...]], ...] = (
    (
        'boutiques',
        'Boutiques & équipe',
        (
            ('shops.Shop', 'Boutiques'),
            ('shops.ShopMember', 'Membres'),
            ('accounts.User', 'Comptes utilisateurs'),
        ),
    ),
    (
        'abonnements',
        'Abonnements',
        (
            ('subscriptions.Subscription', 'Abonnements'),
            ('subscriptions.SubscriptionPlan', 'Formules'),
            ('subscriptions.StripeEvent', 'Événements Stripe'),
        ),
    ),
    (
        'ventes',
        'Ventes & clients',
        (
            ('orders.Order', 'Commandes'),
            ('customers.Customer', 'Clients'),
            ('loyalty.LoyaltyCard', 'Cartes de fidélité'),
            ('loyalty.LoyaltyTransaction', 'Mouvements de points'),
            ('loyalty.LoyaltyProgram', 'Programmes de fidélité'),
        ),
    ),
    (
        'facturation',
        'Facturation',
        (
            ('invoices.Invoice', 'Factures'),
            ('invoices.InvoiceSequence', 'Séquences de numérotation'),
        ),
    ),
    (
        'catalogue',
        'Catalogue & stock',
        (
            ('products.Product', 'Articles'),
            ('products.ProductVariant', 'Formats'),
            ('stock.StockMovement', 'Mouvements de stock'),
            ('ocr.UploadedDocument', 'Documents OCR'),
            ('ocr.OcrResult', 'Lectures OCR'),
            ('ocr.ProductScanUsage', 'Usage du scan'),
            ('ocr.SupplierLineMatch', 'Correspondances fournisseur'),
        ),
    ),
    (
        'communication',
        'Communication & suivi',
        (
            ('comms.PreparedMessage', 'Messages préparés'),
            ('comms.MessageSettings', 'Réglages des messages'),
            ('notes.Reminder', 'Rappels'),
            ('notes.ReminderSettings', 'Réglages des rappels'),
            ('notes.Note', 'Notes'),
        ),
    ),
    ('pages', 'Pages publiques', (('public_pages.PublicPage', 'Pages'),)),
    (
        'zakat',
        'Zakat',
        (
            ('zakat.ZakatCalculation', 'Calculs'),
            ('zakat.ZakatProfile', 'Profils'),
            ('zakat.ZakatReceivableFollowUp', 'Suivis de créances'),
        ),
    ),
    (
        'systeme',
        'Système & audit',
        (
            ('core.AuditLog', "Journal d'audit"),
            ('axes.AccessAttempt', 'Tentatives bloquées'),
            ('axes.AccessFailureLog', 'Échecs de connexion'),
            ('axes.AccessLog', 'Connexions'),
        ),
    ),
)


def is_internal_admin(user: Any) -> bool:
    """Seul critère d'accès à l'admin : superuser actif (is_staff ne suffit pas)."""
    return bool(user.is_active and user.is_staff and user.is_superuser)


class MizanAdminAuthenticationForm(AdminAuthenticationForm):
    """Refuse dès la connexion un compte staff qui n'est pas superuser."""

    def confirm_login_allowed(self, user: AbstractBaseUser) -> None:
        super().confirm_login_allowed(user)
        if not is_internal_admin(user):
            raise ValidationError(
                self.error_messages['invalid_login'],
                code='invalid_login',
                params={'username': self.username_field.verbose_name},
            )


class MizanAdminSite(AdminSite):
    site_header = 'Mizan — administration interne'
    site_title = 'Mizan admin'
    index_title = 'Support et modération'
    login_form = MizanAdminAuthenticationForm

    def has_permission(self, request: HttpRequest) -> bool:
        return is_internal_admin(request.user)

    def get_app_list(
        self, request: HttpRequest, app_label: str | None = None
    ) -> list[dict[str, Any]]:
        app_list = super().get_app_list(request, app_label)
        # Page d'une app (/admin/orders/) : liste native, les groupes n'ont pas d'URL.
        if app_label is not None:
            return app_list
        return group_by_domain(app_list, reverse('admin:index', current_app=self.name))


def group_by_domain(
    app_list: list[dict[str, Any]], index_url: str
) -> list[dict[str, Any]]:
    """Regroupe les modèles des apps Django selon `DOMAINS`.

    Un modèle absent de `DOMAINS` tombe dans « Autres » plutôt que de disparaître.
    """
    by_label = {m['model']._meta.label: m for app in app_list for m in app['models']}
    groups = []
    for key, title, entries in DOMAINS:
        models = [
            {**by_label.pop(label), 'name': name}
            for label, name in entries
            if label in by_label
        ]
        if models:
            groups.append(_group(key, title, models, index_url))
    if by_label:
        groups.append(_group('autres', 'Autres', list(by_label.values()), index_url))
    return groups


def _group(
    key: str, title: str, models: list[dict[str, Any]], index_url: str
) -> dict[str, Any]:
    # `app_url` non vide et sans correspondance de chemin : le gabarit natif marque
    # « current-app » tout groupe dont l'URL figure dans le chemin courant.
    return {
        'name': title,
        'app_label': key,
        'app_url': f'{index_url}#{key}',
        'has_module_perms': True,
        'models': models,
    }


class ReadOnlyAdminMixin:
    """Consultation seule : ni ajout, ni modification, ni suppression.

    S'applique aux ModelAdmin comme aux inlines (`obj` n'existe que pour ces derniers).
    """

    def has_add_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_change_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_delete_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False
