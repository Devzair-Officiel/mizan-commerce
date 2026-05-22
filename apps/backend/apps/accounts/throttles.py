from rest_framework.throttling import AnonRateThrottle


class AuthRateThrottle(AnonRateThrottle):
    """10 tentatives par minute par IP sur les endpoints sensibles (login, register, password reset)."""
    scope = 'auth'
