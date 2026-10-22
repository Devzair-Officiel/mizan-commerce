"""Webhook Stripe : `POST /webhooks/stripe/`, hors de `/api/`.

Vue Django simple, sans JWT ni CSRF : l'authenticité vient de la signature
`Stripe-Signature` (HMAC du corps brut avec `STRIPE_WEBHOOK_SECRET`). Réponses
génériques ; seuls l'identifiant et le type de l'événement sont journalisés,
jamais le corps, la signature ou le secret.
"""

from __future__ import annotations

import logging

import stripe
from django.conf import settings
from django.http import HttpRequest, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .stripe_client import billing_enabled, get_client
from .stripe_events import handle_event

logger = logging.getLogger(__name__)


@csrf_exempt
@require_POST
def stripe_webhook(request: HttpRequest) -> JsonResponse:
    secret = settings.STRIPE_WEBHOOK_SECRET
    if not secret or not billing_enabled():
        logger.error('Webhook Stripe reçu, facturation non configurée.')
        return JsonResponse({'detail': 'Service indisponible.'}, status=503)
    try:
        event = stripe.Webhook.construct_event(
            request.body, request.headers.get('Stripe-Signature'), secret,
        )
    except (ValueError, stripe.SignatureVerificationError):
        # L'exception embarque le corps et l'en-tête : ni journalisée, ni renvoyée.
        logger.warning('Webhook Stripe refusé : signature absente ou invalide.')
        return JsonResponse({'detail': 'Requête invalide.'}, status=400)
    try:
        processed = handle_event(get_client(), event)
    except Exception:
        # Transaction annulée, événement compris : Stripe réessaiera.
        logger.exception('Webhook Stripe %s (%s) : échec du traitement.', event.id, event.type)  # noqa: E501
        return JsonResponse({'detail': 'Erreur de traitement.'}, status=500)
    outcome = 'traité' if processed else 'déjà traité'
    logger.info('Webhook Stripe %s (%s) : %s.', event.id, event.type, outcome)
    return JsonResponse({'received': True})
