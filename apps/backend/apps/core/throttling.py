"""Limitation de débit DRF sur un cache partagé (alias `throttle`, Redis en production).

Les compteurs sont communs à tous les processus Gunicorn et à tous les conteneurs
backend : une limite de 10/minute vaut 10/minute, pas 10 par processus. Toutes
les classes de limitation du projet héritent de `AnonRateThrottle` ou de
`UserRateThrottle` ci-dessous (test : `apps/core/test_throttling.py`).

Redis indisponible : la limitation s'ouvre (la requête passe) plutôt que de
renvoyer une erreur 500 sur toute l'API ; un avertissement est journalisé.

Adresse du visiteur : une IPv6 compte pour son bloc /64 (un abonné en reçoit
au moins un, et en change d'adresse à volonté) ; une IPv4 reste exacte. La même
clé sert au blocage de connexion de django-axes (`axes_client_ip`).
"""

from __future__ import annotations

import ipaddress
import logging
from typing import TYPE_CHECKING

from django.core.cache import caches
from django.utils.connection import ConnectionProxy
from redis.exceptions import RedisError
from rest_framework import throttling

if TYPE_CHECKING:
    # rest_framework.views lit DEFAULT_THROTTLE_CLASSES (ce module) à l'import.
    from django.http import HttpRequest
    from rest_framework.request import Request
    from rest_framework.views import APIView

logger = logging.getLogger(__name__)

THROTTLE_CACHE_ALIAS = 'throttle'
IPV6_PREFIX_LENGTH = 64


def rate_limit_ident(ident: str) -> str:
    """Clé d'un visiteur : bloc /64 pour une IPv6, IPv4 exacte (mappée comprise).

    Une valeur qui n'est pas une adresse est rendue telle quelle (comportement
    de DRF : le visiteur garde un compteur, rien ne casse).
    """
    try:
        address = ipaddress.ip_address(ident)
    except ValueError:
        return ident
    if address.version == 4:
        return str(address)
    if address.ipv4_mapped is not None:  # ::ffff:203.0.113.7
        return str(address.ipv4_mapped)
    # Par l'entier : laisse aussi de côté un éventuel identifiant de zone (%eth0).
    host_bits = 128 - IPV6_PREFIX_LENGTH
    network = ipaddress.IPv6Network(
        ((int(address) >> host_bits) << host_bits, IPV6_PREFIX_LENGTH),
    )
    return str(network)


# Règle de DRF pour l'adresse brute (NUM_PROXIES : dernière entrée de
# X-Forwarded-For, sinon REMOTE_ADDR). Sans état : une instance suffit.
_DRF_IDENT = throttling.BaseThrottle()


def _remote_addr(request: HttpRequest | Request) -> str:
    try:
        return str(request.META.get('REMOTE_ADDR') or '')
    except Exception:  # noqa: BLE001  (jamais d'exception : clé vide)
        return ''


def visitor_ident(request: HttpRequest | Request) -> str:
    """Clé d'un visiteur, commune à la limitation de DRF et au blocage d'axes.

    Adresse lue par la règle de DRF, puis `rate_limit_ident`. Ne lève jamais
    d'exception : repli sur REMOTE_ADDR.
    """
    try:
        return rate_limit_ident(_DRF_IDENT.get_ident(request))
    except Exception:  # noqa: BLE001
        return _remote_addr(request)


def _is_address_key(value: str) -> bool:
    """Une adresse, ou un bloc /64 rendu par `rate_limit_ident`."""
    try:
        ipaddress.ip_address(value)
        return True
    except ValueError:
        pass
    try:
        return ipaddress.IPv6Network(value).prefixlen == IPV6_PREFIX_LENGTH
    except ValueError:
        return False


def axes_client_ip(request: HttpRequest | Request) -> str | None:
    """Adresse retenue par django-axes (AXES_CLIENT_IP_CALLABLE) : `visitor_ident`.

    Axes l'enregistre dans une colonne `inet` : une valeur qui n'est ni une
    adresse ni un bloc /64 est remplacée par REMOTE_ADDR, jamais enregistrée.
    """
    for candidate in (visitor_ident(request), _remote_addr(request)):
        if _is_address_key(candidate):
            return candidate
    return None


class SharedCacheThrottleMixin:
    """À placer avant la classe DRF : remplace son cache et rend la limitation tolérante aux pannes."""  # noqa: E501

    cache = ConnectionProxy(caches, THROTTLE_CACHE_ALIAS)
    scope: str | None

    def get_ident(self, request: Request) -> str:
        return visitor_ident(request)

    def allow_request(self, request: Request, view: APIView) -> bool:
        try:
            return super().allow_request(request, view)  # type: ignore[misc]
        except (RedisError, OSError) as exc:
            # Ni IP, ni utilisateur, ni message d'erreur (il peut contenir l'URL Redis).
            logger.warning(
                'Limitation de débit inactive (cache %r indisponible, %s) : '
                'requête acceptée, portée %s.',
                THROTTLE_CACHE_ALIAS, type(exc).__name__, self.scope,
            )
            return True


class AnonRateThrottle(SharedCacheThrottleMixin, throttling.AnonRateThrottle):
    """Visiteurs non connectés, par adresse IP (transmise par le proxy Next.js)."""


class UserRateThrottle(SharedCacheThrottleMixin, throttling.UserRateThrottle):
    """Utilisateurs connectés, par identifiant ; IP pour un visiteur anonyme."""
