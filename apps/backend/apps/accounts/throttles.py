from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class AuthRateThrottle(AnonRateThrottle):
    """10 tentatives par minute par IP sur les endpoints sensibles (login, register, password reset)."""
    scope = 'auth'


class ResendEmailVerificationThrottle(UserRateThrottle):
    """3 renvois de lien de vérification par heure et par utilisateur — un envoi
    d'email étant coûteux et l'utilisateur n'a pas besoin de plus."""
    scope = 'resend_email'
