from rest_framework.throttling import UserRateThrottle


class BillingCheckoutRateThrottle(UserRateThrottle):
    """Ouverture d'une page de paiement : chaque appel crée une session Stripe."""

    scope = 'billing_checkout'


class BillingPortalRateThrottle(UserRateThrottle):
    """Ouverture du portail client Stripe : une session Stripe par appel."""

    scope = 'billing_portal'


class BillingRefreshRateThrottle(UserRateThrottle):
    """Resynchronisation depuis Stripe, au retour de paiement ou du portail."""

    scope = 'billing_refresh'
