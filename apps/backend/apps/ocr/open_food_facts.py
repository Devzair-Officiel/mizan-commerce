"""Recherche d'un code-barres dans Open Food Facts (scan d'emballage, URS-109).

Seul l'EAN sort vers l'extérieur — jamais l'image, ni une donnée de boutique.
Défenses contre la SSRF : domaine fixe en dur, EAN validé (chiffres seuls,
longueur GTIN, clé de contrôle) AVANT de construire l'URL. Toute erreur
(réseau, délai, réponse illisible, Redis indisponible) est non bloquante : la
recherche renvoie `None` et le scan continue avec l'OCR.
"""
from __future__ import annotations

import logging
from typing import Any, NamedTuple

import httpx
from django.conf import settings
from django.core.cache import caches

logger = logging.getLogger(__name__)

__all__ = (
    'OpenFoodFactsProduct', 'is_restricted_gtin', 'is_valid_gtin', 'lookup_barcode',
)

# Domaine fixe : jamais dérivé d'une entrée utilisateur ni d'un réglage.
_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product/{ean}.json'
_FIELDS = 'product_name,product_name_fr,brands,quantity'
# Open Food Facts demande un User-Agent qui identifie l'application.
_USER_AGENT = 'MizanCommerce/1.0 (scan emballage)'
_GTIN_LENGTHS = frozenset({8, 12, 13, 14})
_CACHE_ALIAS = 'product_lookups'
_CACHE_KEY = 'off:v1:{ean}'
# Un produit absent peut être ajouté par la communauté : on ne le garde qu'un jour.
_NOT_FOUND_CACHE_SECONDS = 24 * 3600
_MAX_TEXT_LENGTH = 200


class OpenFoodFactsProduct(NamedTuple):
    name: str | None
    brand: str | None
    quantity: str | None


def is_valid_gtin(value: str) -> bool:
    """Chiffres ASCII seuls, longueur GTIN, clé de contrôle GS1 (modulo 10)."""
    if len(value) not in _GTIN_LENGTHS or not (value.isascii() and value.isdigit()):
        return False
    body, check = value[:-1], int(value[-1])
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def is_restricted_gtin(value: str) -> bool:
    """Code à diffusion restreinte (article pesé, code interne d'un magasin).

    GS1 réserve les préfixes 02, 04 et 2 (GTIN-13) et 0, 2 (EAN-8) aux codes
    attribués localement : ils ne désignent aucun produit dans une base
    publique et peuvent encoder un poids ou un prix.
    """
    if len(value) == 8:
        return value[0] in '02'
    gtin13 = value[1:] if len(value) == 14 else value.zfill(13)
    return gtin13.startswith(('02', '04', '2'))


def _clean(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    text = ' '.join(value.split())
    return text[:_MAX_TEXT_LENGTH] or None


def _parse(payload: Any) -> OpenFoodFactsProduct | None:
    if not isinstance(payload, dict) or payload.get('status') != 1:
        return None
    product = payload.get('product')
    if not isinstance(product, dict):
        return None
    # `brands` : marques séparées par des virgules, la première est la principale.
    brands = _clean(product.get('brands'))
    name_fr = _clean(product.get('product_name_fr'))
    found = OpenFoodFactsProduct(
        name=name_fr or _clean(product.get('product_name')),
        brand=_clean(brands.split(',')[0]) if brands else None,
        quantity=_clean(product.get('quantity')),
    )
    return found if any(found) else None


def _fetch(ean: str) -> tuple[bool, OpenFoodFactsProduct | None]:
    """(réponse exploitable, produit) ; une erreur donne `(False, None)`, sans cache."""
    try:
        response = httpx.get(
            _PRODUCT_URL.format(ean=ean),
            params={'fields': _FIELDS},
            headers={'User-Agent': _USER_AGENT},
            timeout=settings.OPEN_FOOD_FACTS_TIMEOUT_SECONDS,
            follow_redirects=False,
        )
    except httpx.HTTPError as exc:
        logger.warning('Open Food Facts unreachable: %s', type(exc).__name__)
        return False, None
    if response.status_code == 404:
        return True, None
    if response.status_code != 200:
        logger.warning('Open Food Facts HTTP error: status=%s', response.status_code)
        return False, None
    try:
        return True, _parse(response.json())
    except ValueError:
        logger.warning('Open Food Facts returned invalid JSON')
        return False, None


def _cache_get(key: str) -> tuple[bool, OpenFoodFactsProduct | None]:
    try:
        cached = caches[_CACHE_ALIAS].get(key)
    except Exception as exc:  # noqa: BLE001 — Redis indisponible : on interroge directement
        logger.warning('Product lookup cache unavailable: %s', type(exc).__name__)
        return False, None
    if not isinstance(cached, dict):
        return False, None
    if not cached:
        return True, None
    return True, OpenFoodFactsProduct(
        name=_clean(cached.get('name')), brand=_clean(cached.get('brand')),
        quantity=_clean(cached.get('quantity')),
    )


def _cache_set(key: str, product: OpenFoodFactsProduct | None) -> None:
    value = product._asdict() if product else {}
    timeout = (
        settings.OPEN_FOOD_FACTS_CACHE_SECONDS if product else _NOT_FOUND_CACHE_SECONDS
    )
    try:
        caches[_CACHE_ALIAS].set(key, value, timeout)
    except Exception as exc:  # noqa: BLE001 — cache facultatif
        logger.warning('Product lookup cache unavailable: %s', type(exc).__name__)


def lookup_barcode(ean: str) -> OpenFoodFactsProduct | None:
    """Fiche publique d'un EAN, ou `None` (inconnu, invalide, restreint, erreur)."""
    if not is_valid_gtin(ean) or is_restricted_gtin(ean):
        return None
    key = _CACHE_KEY.format(ean=ean)
    hit, product = _cache_get(key)
    if hit:
        return product
    usable, product = _fetch(ean)
    if usable:
        _cache_set(key, product)
    return product
