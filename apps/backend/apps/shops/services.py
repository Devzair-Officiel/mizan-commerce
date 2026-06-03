from __future__ import annotations

import uuid

from django.conf import settings
from django.core.files.uploadedfile import InMemoryUploadedFile
from rest_framework.exceptions import ValidationError

from apps.core.storage import delete_object, upload_fileobj

from .models import Shop

SHOP_LOGO_MAX_SIZE_MB = 5
SHOP_LOGO_ALLOWED_TYPES = {'image/jpeg', 'image/png', 'image/webp'}

COUNTRY_TIMEZONES: dict[str, str] = {
    'FR': 'Europe/Paris',
    'BE': 'Europe/Brussels',
    'GB': 'Europe/London',
    'MA': 'Africa/Casablanca',
    'TN': 'Africa/Tunis',
    'DZ': 'Africa/Algiers',
    'SN': 'Africa/Dakar',
    'CI': 'Africa/Abidjan',
}
DEFAULT_TIMEZONE = 'Europe/Paris'


def timezone_for_country(country: str | None) -> str:
    if not country:
        return DEFAULT_TIMEZONE
    return COUNTRY_TIMEZONES.get(country.upper(), DEFAULT_TIMEZONE)


def upload_shop_logo(shop: Shop, file: InMemoryUploadedFile) -> Shop:
    """Upload un nouveau logo, met à jour ``shop.logo_object_key`` et supprime
    l'ancien fichier S3 (best-effort, sans faire échouer l'upload)."""
    max_bytes = SHOP_LOGO_MAX_SIZE_MB * 1024 * 1024
    if file.size > max_bytes:
        raise ValidationError(f"Le logo ne doit pas dépasser {SHOP_LOGO_MAX_SIZE_MB} Mo.")
    if file.content_type not in SHOP_LOGO_ALLOWED_TYPES:
        raise ValidationError(
            f"Type de fichier non autorisé : {file.content_type}. Formats acceptés : JPEG, PNG, WebP.",
        )
    if not settings.AWS_S3_ENDPOINT_URL or not settings.AWS_ACCESS_KEY_ID:
        raise ValidationError("L'upload vers Object Storage n'est pas configuré sur cet environnement.")

    ext = file.name.rsplit('.', 1)[-1].lower() if '.' in file.name else 'jpg'
    new_key = f"shops/{shop.pk}/logo-{uuid.uuid4()}.{ext}"

    upload_fileobj(file, new_key, file.content_type)

    old_key = shop.logo_object_key
    shop.logo_object_key = new_key
    shop.save(update_fields=['logo_object_key', 'updated_at'])

    if old_key and old_key != new_key:
        delete_object(old_key)

    return shop


def delete_shop_logo(shop: Shop) -> Shop:
    old_key = shop.logo_object_key
    shop.logo_object_key = ''
    shop.save(update_fields=['logo_object_key', 'updated_at'])
    if old_key:
        delete_object(old_key)
    return shop
