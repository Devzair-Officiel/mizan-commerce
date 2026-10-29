"""Actions de facturation du propriétaire : paiement, portail, résiliation, reprise.

Le changement de formule payante vit dans `stripe_plan_change`, qui réutilise
les outils de ce module.

Chaque action appelle Stripe puis resynchronise par `stripe_sync` : la
`Subscription` locale n'est écrite que par la synchronisation, sauf
l'identifiant client Stripe, posé ici sous condition SQL. Toute erreur Stripe
devient `PaymentProviderError` ; le journal ne garde que le type d'erreur et le
code Stripe, jamais le message brut. Les URL de retour viennent uniquement de
`settings.FRONTEND_URL`.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from typing import TYPE_CHECKING, Any

import stripe
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone

from .exceptions import (
    AlreadySubscribed,
    BillingDisabled,
    CatalogNotSynced,
    InvalidPlan,
    NoBillingCustomer,
    NothingToCancel,
    NothingToResume,
    PaymentProviderError,
    UseCheckoutOrChangePlan,
)
from .models import Subscription, SubscriptionPlan
from .services import downgrade_to_free
from .stripe_client import billing_enabled, get_client
from .stripe_sync import (
    LIVE_STATUSES,
    STRIPE_CANCELED,
    audit_subscription,
    field_or_none,
    stripe_id,
    sync_subscription_from_stripe,
)

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.shops.models import Shop

logger = logging.getLogger(__name__)

SUBSCRIPTION_PAGE = '/settings/subscription'
# Page CGV publique du frontend (app/(marketing)/cgv), lien des CGV de Checkout.
TERMS_PAGE = '/cgv'
INTERVALS = (SubscriptionPlan.PERIOD_MONTH, SubscriptionPlan.PERIOD_YEAR)

# Textes de Checkout ; l'arabe reçoit l'anglais (pas de traduction validée).
CHECKOUT_TEXTS: dict[str, dict[str, str]] = {
    'fr': {
        'terms': "J'accepte les [CGV]({url}) et l'autorisation de prélèvement "
                 "automatique récurrent.",
        'submit': 'Votre abonnement se renouvelle automatiquement chaque mois '
                  '(ou chaque année selon la formule). Résiliable à tout moment '
                  'depuis Mizan.',
        'trial': ' Votre essai gratuit prend fin dès le paiement.',
    },
    'en': {
        'terms': 'I accept the [Terms of Sale]({url}) and the authorization for '
                 'recurring automatic payments.',
        'submit': 'Your subscription renews automatically every month (or every '
                  'year, depending on the plan). Cancel anytime from Mizan.',
        'trial': ' Your free trial ends as soon as you pay.',
    },
}
CHECKOUT_LANGUAGES = {'fr': 'fr', 'en': 'en', 'ar': 'en'}


@contextmanager
def _stripe_call(action: str, subscription: Subscription) -> Iterator[None]:
    """Convertit une erreur Stripe en erreur applicative générique."""
    try:
        yield
    except stripe.StripeError as exc:
        logger.warning(
            "Facturation (%s) de l'abonnement %s : erreur Stripe %s, code %s.",
            action, subscription.pk, type(exc).__name__, exc.code or '-',
        )
        raise PaymentProviderError() from exc


def _client() -> stripe.StripeClient:
    if not billing_enabled():
        raise BillingDisabled()
    return get_client()


def _subscription_of(shop: Shop) -> Subscription:
    return get_object_or_404(Subscription.objects.select_related('plan', 'shop'), shop=shop)  # noqa: E501


def _frontend_url(path: str) -> str:
    return settings.FRONTEND_URL.rstrip('/') + path


def has_live_stripe_subscription(subscription: Subscription) -> bool:
    """Un abonnement Stripe facture-t-il encore la boutique ?"""
    live = (Subscription.STATUS_ACTIVE, Subscription.STATUS_PAST_DUE)
    return bool(subscription.stripe_subscription_id) and subscription.status in live


def ensure_stripe_customer(
    client: stripe.StripeClient, subscription: Subscription, owner: User,
) -> str:
    """Client Stripe de la boutique, créé une seule fois (clé d'idempotence fixe)."""
    if subscription.stripe_customer_id:
        return subscription.stripe_customer_id
    shop = subscription.shop
    with _stripe_call('client', subscription):
        customer = client.v1.customers.create(
            params={
                'email': owner.email, 'name': shop.name,
                'metadata': {'shop_id': str(shop.id)},
            },
            options={'idempotency_key': f'mizan-customer-{shop.id}'},
        )
    rows = Subscription.objects.filter(pk=subscription.pk, stripe_customer_id='')
    if rows.update(stripe_customer_id=customer.id, updated_at=timezone.now()):
        subscription.stripe_customer_id = customer.id
        return customer.id
    # Une requête concurrente a posé son client la première : c'est lui qui compte.
    winner = Subscription.objects.values_list('stripe_customer_id', flat=True).get(pk=subscription.pk)  # noqa: E501
    if winner != customer.id:
        logger.warning('Abonnement %s : client Stripe créé en double, ignoré.', subscription.pk)  # noqa: E501
    subscription.stripe_customer_id = winner
    return winner


def _checkout_price(plan_code: str, interval: str) -> str:
    plan = (
        SubscriptionPlan.objects.filter(code=plan_code, is_active=True)
        .exclude(code=SubscriptionPlan.CODE_FREE).first()
    )
    if plan is None or interval not in INTERVALS:
        raise InvalidPlan()
    month = interval == SubscriptionPlan.PERIOD_MONTH
    price = plan.stripe_price_id if month else plan.stripe_price_id_yearly
    if not price:
        logger.error(
            'Formule %s (%s) sans prix Stripe : catalogue non synchronisé, '
            'lancer stripe_sync_plans.', plan.code, interval,
        )
        raise CatalogNotSynced()
    return price


def _custom_text(subscription: Subscription, owner: User) -> dict[str, Any]:
    texts = CHECKOUT_TEXTS[CHECKOUT_LANGUAGES.get(owner.language, 'fr')]
    submit = texts['submit']
    in_trial = subscription.status == Subscription.STATUS_TRIALING
    if in_trial and not subscription.is_trial_expired:
        submit += texts['trial']
    return {
        'terms_of_service_acceptance': {
            'message': texts['terms'].format(url=_frontend_url(TERMS_PAGE)),
        },
        'submit': {'message': submit},
    }


def _checkout_params(
    subscription: Subscription, owner: User, customer: str, price: str,
) -> dict[str, Any]:
    shop_id = str(subscription.shop_id)
    return {
        'mode': 'subscription',
        'customer': customer,
        'line_items': [{'price': price, 'quantity': 1}],
        'success_url': _frontend_url(f'{SUBSCRIPTION_PAGE}?checkout=success'),
        'cancel_url': _frontend_url(f'{SUBSCRIPTION_PAGE}?checkout=cancelled'),
        'client_reference_id': shop_id,
        'subscription_data': {'metadata': {'shop_id': shop_id}},
        'billing_address_collection': 'required',
        # L'adresse saisie est gardée sur le client Stripe (factures suivantes).
        'customer_update': {'address': 'auto'},
        'name_collection': {'business': {'enabled': True, 'optional': True}},
        'consent_collection': {'terms_of_service': 'required'},
        'custom_text': _custom_text(subscription, owner),
        'locale': 'auto',
    }


def create_checkout_session(
    shop: Shop, owner: User, plan_code: str, interval: str,
) -> str:
    """Page de paiement Stripe d'une formule payante ; renvoie son URL."""
    client = _client()
    price = _checkout_price(plan_code, interval)
    subscription = _subscription_of(shop)
    if has_live_stripe_subscription(subscription):
        raise AlreadySubscribed()
    customer = ensure_stripe_customer(client, subscription, owner)
    params = _checkout_params(subscription, owner, customer, price)
    with _stripe_call('paiement', subscription):
        session = client.v1.checkout.sessions.create(params=params)
    return session.url


def create_portal_session(shop: Shop) -> str:
    """Portail client Stripe (moyen de paiement, factures) ; renvoie son URL."""
    client = _client()
    subscription = _subscription_of(shop)
    if not subscription.stripe_customer_id:
        raise NoBillingCustomer()
    with _stripe_call('portail', subscription):
        session = client.v1.billing_portal.sessions.create(params={
            'customer': subscription.stripe_customer_id,
            'return_url': _frontend_url(SUBSCRIPTION_PAGE),
        })
    return session.url


def _cancel_scheduled(remote: Any) -> bool:
    return bool(field_or_none(remote, 'cancel_at_period_end')) or (
        field_or_none(remote, 'cancel_at') is not None
    )


def release_schedule(
    client: stripe.StripeClient, subscription: Subscription, remote: Any,
) -> bool:
    """Abandonne le changement programmé : le calendrier lâche l'abonnement.

    L'abonnement continue tel quel ; faux s'il n'avait pas de calendrier.
    """
    schedule_id = stripe_id(field_or_none(remote, 'schedule'))
    if not schedule_id:
        return False
    client.v1.subscription_schedules.release(schedule_id)
    audit_subscription(subscription, 'subscription_plan_changed', {'scheduled_cancelled': True})  # noqa: E501
    return True


def cancel_subscription(shop: Shop) -> Subscription:
    """Résilie : en fin de période si à jour, tout de suite si paiement en retard.

    Un changement de formule programmé est abandonné d'abord : Stripe refuse de
    modifier la résiliation d'un abonnement piloté par un calendrier.
    """
    client = _client()
    subscription = _subscription_of(shop)
    if not has_live_stripe_subscription(subscription):
        raise NothingToCancel()
    sub_id = subscription.stripe_subscription_id
    with _stripe_call('résiliation', subscription):
        remote = client.v1.subscriptions.retrieve(sub_id)
        local_status = LIVE_STATUSES.get(remote.status)
        if local_status == Subscription.STATUS_PAST_DUE:
            release_schedule(client, subscription, remote)
            client.v1.subscriptions.cancel(sub_id)
        elif local_status == Subscription.STATUS_ACTIVE and not _cancel_scheduled(remote):  # noqa: E501
            release_schedule(client, subscription, remote)
            client.v1.subscriptions.update(sub_id, params={'cancel_at_period_end': True})  # noqa: E501
        sync_subscription_from_stripe(client, sub_id)
    return _subscription_of(shop)


def _resume_params(remote: Any) -> dict[str, Any] | None:
    # Un seul des deux réglages à la fois : Stripe refuse de les combiner.
    if field_or_none(remote, 'cancel_at_period_end'):
        return {'cancel_at_period_end': False}
    if field_or_none(remote, 'cancel_at') is not None:
        return {'cancel_at': ''}
    return None


def resume_subscription(shop: Shop) -> Subscription:
    """Annule une résiliation programmée ; refusé si rien n'est programmé."""
    client = _client()
    subscription = _subscription_of(shop)
    if not has_live_stripe_subscription(subscription):
        raise NothingToResume()
    sub_id = subscription.stripe_subscription_id
    with _stripe_call('reprise', subscription):
        remote = client.v1.subscriptions.retrieve(sub_id)
        params = _resume_params(remote) if remote.status != STRIPE_CANCELED else None
        if params is not None:
            client.v1.subscriptions.update(sub_id, params=params)
        # Aussi sans reprise : l'état local périmé est corrigé avant le refus.
        sync_subscription_from_stripe(client, sub_id)
    if params is None:
        raise NothingToResume()
    return _subscription_of(shop)


def _pick_subscription(remotes: Sequence[Any]) -> Any | None:
    # Liste Stripe du plus récent au plus ancien : un abonnement en cours d'abord.
    live = [remote for remote in remotes if remote.status in LIVE_STATUSES]
    return (live or list(remotes) or [None])[0]


def refresh_subscription(shop: Shop) -> Subscription:
    """Resynchronise depuis Stripe, sans attendre le webhook (retour de paiement)."""
    client = _client()
    subscription = _subscription_of(shop)
    if not subscription.stripe_customer_id:
        return subscription
    with _stripe_call('actualisation', subscription):
        remotes = client.v1.subscriptions.list(params={
            'customer': subscription.stripe_customer_id, 'status': 'all', 'limit': 10,
        })
        chosen = _pick_subscription(remotes.data)
        if chosen is None:
            return subscription
        sync_subscription_from_stripe(client, chosen.id)
    return _subscription_of(shop)


def change_plan(shop: Shop, plan_code: str) -> Subscription:
    """POST /change/ avec `plan_code` : seul le retour sur Découverte passe ici.

    Une formule payante passe par `stripe_plan_change.apply_plan_change`.
    """
    if plan_code != SubscriptionPlan.CODE_FREE:
        raise UseCheckoutOrChangePlan()
    subscription = _subscription_of(shop)
    if has_live_stripe_subscription(subscription):
        return cancel_subscription(shop)
    return downgrade_to_free(subscription)
