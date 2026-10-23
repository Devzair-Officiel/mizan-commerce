"""Erreurs de facturation renvoyées au client : message générique, code stable.

Le frontend aiguille sur `code` ; `detail` reste lisible. Aucune donnée Stripe
(identifiant, message brut, clé) n'y figure.
"""

from __future__ import annotations

from typing import Any

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


class NoChange(BillingError):
    default_detail = 'Votre boutique est déjà sur cette formule et ce rythme.'
    default_code = 'no_change'


class ChangeNotSupported(BillingError):
    status_code = status.HTTP_409_CONFLICT
    default_detail = (
        'Ce changement ne peut pas se faire en une fois. Faites-le en deux étapes : '
        "changez d'abord de formule, puis de rythme de paiement."
    )
    default_code = 'change_not_supported'


class PaymentOverdue(BillingError):
    status_code = status.HTTP_409_CONFLICT
    default_detail = (
        'Un paiement est en retard. Réglez-le depuis le portail avant de changer '
        'de formule.'
    )
    default_code = 'payment_overdue'


class CancellationScheduled(BillingError):
    status_code = status.HTTP_409_CONFLICT
    default_detail = (
        "Une résiliation est programmée. Annulez d'abord la résiliation, puis "
        'changez de formule.'
    )
    default_code = 'cancellation_scheduled'


class NothingScheduled(BillingError):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Aucun changement de formule programmé à annuler.'
    default_code = 'nothing_scheduled'


class ConfirmationRequired(BillingError):
    default_detail = 'Confirmez le montant affiché avant de changer de formule.'
    default_code = 'confirmation_required'


class AmountChanged(BillingError):
    """Le montant a changé depuis l'aperçu : rien n'est débité, nouvel aperçu joint."""

    status_code = status.HTTP_409_CONFLICT
    default_detail = (
        'Le montant a changé depuis votre aperçu. Vérifiez-le puis confirmez.'
    )
    default_code = 'amount_changed'

    def __init__(self, preview: dict[str, Any]) -> None:
        super().__init__()
        # Gardé tel quel : DRF changerait sinon chaque nombre en chaîne.
        self.detail = {'detail': self.default_detail, 'code': self.default_code, 'preview': preview}  # noqa: E501


class PaymentFailed(BillingError):
    status_code = status.HTTP_402_PAYMENT_REQUIRED
    default_detail = (
        "Le paiement n'a pas abouti. Mettez à jour votre moyen de paiement depuis "
        'le portail puis réessayez.'
    )
    default_code = 'payment_failed'


class PaymentActionRequired(PaymentFailed):
    default_code = 'payment_action_required'
