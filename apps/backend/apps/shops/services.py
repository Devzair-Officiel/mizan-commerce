from __future__ import annotations

import uuid

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import InMemoryUploadedFile
from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.core.permissions import TOGGLEABLE_MODULES
from apps.core.storage import delete_object, upload_fileobj

from .models import Shop, ShopMember

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


def _validate_permissions(perms: list[str]) -> list[str]:
    cleaned = list(dict.fromkeys(perms or []))
    invalid = [p for p in cleaned if p not in TOGGLEABLE_MODULES]
    if invalid:
        raise ValidationError(
            {'permissions': f"Modules inconnus : {', '.join(invalid)}"},
        )
    return cleaned


@transaction.atomic
def create_staff_member(
    *,
    shop: Shop,
    email: str,
    full_name: str,
    phone: str,
    password: str,
    permissions: list[str],
) -> ShopMember:
    """Crée un nouvel utilisateur `staff` et son `ShopMember` sur la boutique courante.

    Raises ``ValidationError`` si l'email est déjà utilisé sur la boutique ou si
    les permissions contiennent des modules inconnus.
    """
    User = get_user_model()
    perms = _validate_permissions(permissions)

    user, created = User.objects.get_or_create(
        email=email,
        defaults={'full_name': full_name, 'phone': phone},
    )
    if created:
        user.set_password(password)
        user.save()
    else:
        # Un user existant ne peut pas être réutilisé s'il est déjà membre de
        # cette boutique. S'il n'a aucune boutique on lui rattache, sinon erreur.
        if ShopMember.objects.filter(shop=shop, user=user).exists():
            raise ValidationError({'email': 'Cet utilisateur est déjà membre de la boutique.'})
        if ShopMember.objects.filter(user=user).exists():
            raise ValidationError({'email': 'Cet email est déjà associé à une autre boutique.'})

    return ShopMember.objects.create(
        shop=shop,
        user=user,
        role=ShopMember.ROLE_STAFF,
        permissions=perms,
    )


def update_member_permissions(
    *,
    member: ShopMember,
    role: str | None = None,
    permissions: list[str] | None = None,
) -> ShopMember:
    """Met à jour le rôle et/ou les permissions d'un membre.

    On ne peut **pas** modifier le rôle d'un `owner`. Les permissions sont
    ignorées pour les admins (toujours accès total).
    """
    if member.role == ShopMember.ROLE_OWNER and role is not None and role != ShopMember.ROLE_OWNER:
        raise ValidationError({'role': "Impossible de retirer le rôle owner."})

    fields = []
    if role is not None and role != member.role:
        if role not in {ShopMember.ROLE_ADMIN, ShopMember.ROLE_STAFF}:
            raise ValidationError({'role': "Rôle invalide pour cette opération."})
        member.role = role
        fields.append('role')
    if permissions is not None:
        member.permissions = _validate_permissions(permissions)
        fields.append('permissions')
    if fields:
        member.save(update_fields=fields)
    return member


def remove_member(member: ShopMember) -> None:
    """Supprime un membre de la boutique. Un `owner` ne peut pas être supprimé."""
    if member.role == ShopMember.ROLE_OWNER:
        raise ValidationError("Impossible de retirer le propriétaire de la boutique.")
    member.delete()
