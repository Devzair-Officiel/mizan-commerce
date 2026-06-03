from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from django.conf import settings
from django.core.files.uploadedfile import InMemoryUploadedFile
from rest_framework.exceptions import ValidationError

from apps.core.storage import get_signed_url, upload_fileobj

if TYPE_CHECKING:
    from apps.products.models import ProductImage
    from apps.shops.models import Shop


__all__ = ('upload_product_image', 'get_signed_url')


def upload_product_image(shop: 'Shop', product_id: str, file: InMemoryUploadedFile) -> 'ProductImage':
    from apps.products.models import Product, ProductImage

    max_bytes = getattr(settings, 'PRODUCT_IMAGE_MAX_SIZE_MB', 5) * 1024 * 1024
    allowed_types: set[str] = getattr(settings, 'PRODUCT_IMAGE_ALLOWED_TYPES', {'image/jpeg', 'image/png', 'image/webp'})

    if file.size > max_bytes:
        raise ValidationError(f"L'image ne doit pas dépasser {max_bytes // (1024 * 1024)} Mo.")

    if file.content_type not in allowed_types:
        raise ValidationError(f"Type de fichier non autorisé : {file.content_type}. Formats acceptés : JPEG, PNG, WebP.")

    product = Product.objects.get(pk=product_id, shop=shop)

    ext = file.name.rsplit('.', 1)[-1].lower() if '.' in file.name else 'jpg'
    object_key = f"products/{shop.pk}/{product_id}/{uuid.uuid4()}.{ext}"

    upload_fileobj(file, object_key, file.content_type)

    is_first = not ProductImage.objects.filter(product=product).exists()
    image = ProductImage.objects.create(
        shop=shop,
        product=product,
        object_key=object_key,
        is_primary=is_first,
        position=ProductImage.objects.filter(product=product).count(),
    )
    return image
