"""Erreurs de facturation renvoyées au client : message générique, code stable.

Le frontend aiguille sur `code` ; `detail` reste lisible. Aucune donnée Stripe
(identifiant, message brut, clé) n'y figure.
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.exceptions import APIException


class BillingError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = 'Opération de facturation impossible.'
    default_code = 'billing_error'

    def __init__(self) -> None:
        super().__init__({'detail': self.default_detail, 'code': self.default_code})


class BillingDisabled(BillingError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = 'Le paiement en ligne est indisponible.'
    default_code = 'billing_disabled'


class PaymentProviderError(BillingError):
    status_code = status.HTTP_502_BAD_GATEWAY
    default_detail = 'Le service de paiement ne répond pas. Réessayez plus tard.'
    default_code = 'payment_provider_error'


class CatalogNotSynced(BillingError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "Cette formule n'est pas encore disponible au paiement."
    default_code = 'catalog_not_synced'


class InvalidPlan(BillingError):
    default_detail = "Cette formule n'est pas proposée à l'abonnement."
    default_code = 'invalid_plan'


class AlreadySubscribed(BillingError):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Votre boutique a déjà un abonnement en cours.'
    default_code = 'already_subscribed'


class NothingToCancel(BillingError):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Aucun abonnement en cours à résilier.'
    default_code = 'nothing_to_cancel'


class NothingToResume(BillingError):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Aucune résiliation programmée à annuler.'
    default_code = 'nothing_to_resume'


class NoBillingCustomer(BillingError):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Aucun compte de facturation pour votre boutique.'
    default_code = 'no_billing_customer'


class UseCheckoutOrChangePlan(BillingError):
    default_detail = 'Une formule payante se souscrit par le paiement en ligne.'
    default_code = 'use_checkout_or_change_plan'
