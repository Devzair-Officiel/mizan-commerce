"""Traitement des événements Stripe reçus par le webhook.

Du contenu d'un événement, on ne lit que `id`, `type`, `created` et des
identifiants (objet, client, paiement) : tout état est redemandé à Stripe.
Chaque événement est traité une seule fois (`StripeEvent`), dans une transaction :
un échec annule tout, l'enregistrement de l'événement compris, et Stripe réessaie.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

import stripe
from django.db import transaction
from django.utils import timezone

from .models import StripeEvent
from .stripe_sync import (
    audit_subscription,
    find_by_customer,
    stripe_id,
    sync_subscription_from_stripe,
)

logger = logging.getLogger(__name__)

SUBSCRIPTION_EVENTS = frozenset({
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
})
INVOICE_EVENTS = frozenset({'invoice.paid', 'invoice.payment_failed'})
DISPUTE_CREATED = 'charge.dispute.created'


def handle_event(client: stripe.StripeClient, event: Any) -> bool:
    """Traite l'événement s'il ne l'a pas déjà été ; False s'il l'était."""
    with transaction.atomic():
        record, created = StripeEvent.objects.get_or_create(
            id=event.id,
            defaults={
                'event_type': event.type,
                'stripe_created_at': datetime.fromtimestamp(event.created, tz=UTC),
            },
        )
        if not created and record.processed_at is not None:
            return False
        process_event(client, event)
        StripeEvent.objects.filter(pk=event.id, processed_at__isnull=True).update(
            processed_at=timezone.now(),
        )
    return True


def process_event(client: stripe.StripeClient, event: Any) -> None:
    """Aiguille l'événement ; un type non géré est accepté sans action."""
    obj = event.data.object
    if event.type in SUBSCRIPTION_EVENTS:
        sync_subscription_from_stripe(client, obj.id)
    elif event.type in INVOICE_EVENTS:
        _sync_from_invoice(client, obj)
    elif event.type == DISPUTE_CREATED:
        _record_dispute(client, obj)


def _sync_from_invoice(client: stripe.StripeClient, invoice: Any) -> None:
    # Par le client et non `invoice.subscription`, déplacé dans les API récentes.
    local = find_by_customer(stripe_id(invoice.customer))
    if local is None:
        logger.warning('Facture Stripe %s : client inconnu, rien modifié.', invoice.id)
        return
    if not local.stripe_subscription_id:
        logger.warning(
            'Facture Stripe %s : souscription %s sans abonnement Stripe, rien modifié.',
            invoice.id, local.pk,
        )
        return
    sync_subscription_from_stripe(client, local.stripe_subscription_id)


def _record_dispute(client: stripe.StripeClient, dispute: Any) -> None:
    charge_id = stripe_id(dispute.charge)
    charge = client.v1.charges.retrieve(charge_id)
    local = find_by_customer(stripe_id(charge.customer))
    if local is None:
        logger.warning('Contestation Stripe %s : client inconnu.', dispute.id)
        return
    # Identifiants seulement : ni montant, ni motif, ni donnée de carte.
    audit_subscription(
        local, 'subscription_dispute', {'dispute': dispute.id, 'charge': charge_id},
    )
    logger.error(
        'Contestation Stripe %s sur la souscription %s : à traiter dans le Dashboard.',
        dispute.id, local.pk,
    )
