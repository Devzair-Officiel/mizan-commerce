"""Accès à l'API Stripe : un seul point d'entrée, la clé lue dans les settings.

La facturation est désactivée tant que `STRIPE_SECRET_KEY` est vide (dev, tests).
La clé n'apparaît jamais dans un log ni dans un message : les erreurs Stripe
passent par `stripe_error_message()` avant d'être affichées.
"""

from __future__ import annotations

import stripe
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

LIVE_KEY_PREFIXES = ('sk_live_', 'rk_live_')
MAX_NETWORK_RETRIES = 2


def billing_enabled() -> bool:
    """Une clé Stripe est-elle configurée ?"""
    return bool(settings.STRIPE_SECRET_KEY)


def is_live_mode() -> bool:
    """La clé configurée agit-elle sur le compte Stripe réel (production) ?"""
    return settings.STRIPE_SECRET_KEY.startswith(LIVE_KEY_PREFIXES)


def get_client() -> stripe.StripeClient:
    """Client Stripe configuré ; lève `ImproperlyConfigured` sans clé."""
    if not billing_enabled():
        raise ImproperlyConfigured(
            'STRIPE_SECRET_KEY absente : facturation Stripe désactivée.',
        )
    return stripe.StripeClient(
        settings.STRIPE_SECRET_KEY, max_network_retries=MAX_NETWORK_RETRIES,
    )


def stripe_error_message(exc: stripe.StripeError) -> str:
    """Message d'erreur renvoyé par Stripe, sans la clé même si elle y figurait."""
    message = exc.user_message or 'erreur Stripe sans message.'
    key = settings.STRIPE_SECRET_KEY
    return message.replace(key, '***') if key else message
