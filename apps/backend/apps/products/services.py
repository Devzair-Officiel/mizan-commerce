from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from django.conf import settings
from django.core.files.uploadedfile import InMemoryUploadedFile
from rest_framework.exceptions import ValidationError

if TYPE_CHECKING:
    from apps.products.models import ProductImage
    from apps.shops.models import Shop


def _get_s3_client():
    import boto3
    return boto3.client(
        's3',
        endpoint_url=settings.AWS_S3_ENDPOINT_URL,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_S3_REGION_NAME,
    )


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

    s3 = _get_s3_client()
    s3.upload_fileobj(
        file,
        settings.AWS_STORAGE_BUCKET_NAME,
        object_key,
        ExtraArgs={'ContentType': file.content_type, 'ACL': 'private'},
    )

    is_first = not ProductImage.objects.filter(product=product).exists()
    image = ProductImage.objects.create(
        shop=shop,
        product=product,
        object_key=object_key,
        is_primary=is_first,
        position=ProductImage.objects.filter(product=product).count(),
    )
    return image


def get_signed_url(object_key: str, expires_in: int = 3600) -> str:
    s3 = _get_s3_client()
    return s3.generate_presigned_url(
        'get_object',
        Params={'Bucket': settings.AWS_STORAGE_BUCKET_NAME, 'Key': object_key},
        ExpiresIn=expires_in,
    )
