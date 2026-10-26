"""Contrôle des images envoyées : bombe de décompression, format, troncature.

Toutes les images sont fabriquées ici (`apps.core.test_utils`), jamais
téléchargées. Les envois refusés ne doivent rien stocker ni rien envoyer au
service IA.
"""

import os
import subprocess
import sys
from unittest.mock import patch

import pytest
from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.core.images import (
    IMAGE_TOO_LARGE,
    IMAGE_UNREADABLE,
    InvalidImageError,
    verify_image,
)
from apps.core.test_utils import bomb_bytes, image_bytes

# Fabriquées une fois : quelques secondes pour les plus grandes.
BOMB_WARNING = bomb_bytes('PNG', 8_000)  # 64 Mpx : avertissement de Pillow
BOMB_ERROR = bomb_bytes('PNG', 12_000)  # 144 Mpx : erreur de Pillow
BOMB_WEBP = bomb_bytes('WEBP', 8_000)

S3 = override_settings(
    AWS_S3_ENDPOINT_URL='https://s3.example.com',
    AWS_ACCESS_KEY_ID='fake-access-key',
)


def _code(content: bytes, content_type: str, **kwargs: int) -> str:
    with pytest.raises(InvalidImageError) as refused:
        verify_image(content, content_type, **kwargs)
    return refused.value.code


@pytest.mark.parametrize(
    ('image_format', 'content_type'),
    [('JPEG', 'image/jpeg'), ('PNG', 'image/png'), ('WEBP', 'image/webp')],
)
def test_valid_images_pass(image_format: str, content_type: str) -> None:
    verify_image(image_bytes(image_format, (640, 480)), content_type)


@pytest.mark.parametrize(
    ('content', 'content_type'),
    [(BOMB_WARNING, 'image/png'), (BOMB_ERROR, 'image/png'), (BOMB_WEBP, 'image/webp')],
    ids=['png-64mpx', 'png-144mpx', 'webp-64mpx'],
)
def test_decompression_bomb_refused_as_too_large(
    content: bytes, content_type: str,
) -> None:
    assert len(content) < 200_000
    assert _code(content, content_type) == IMAGE_TOO_LARGE


# Hors de `verify_image` (rendu d'un logo, autre module), Pillow refuse aussi la
# bombe : l'avertissement est une erreur pour tout le processus. Contrôlé dans un
# processus neuf, démarré comme Gunicorn ou Celery : pytest-django initialise
# Django dans sa propre capture des avertissements, qui efface le filtre.
_PROCESS_CHECK = """
import django, sys
from io import BytesIO
django.setup()
from PIL import Image
from apps.core.test_utils import bomb_bytes
assert Image.MAX_IMAGE_PIXELS == 50_000_000
try:
    Image.open(BytesIO(bomb_bytes('PNG', 8_000)))
except Image.DecompressionBombWarning:
    sys.exit(0)
sys.exit(1)
"""


def test_pillow_refuses_a_bomb_anywhere_in_the_process() -> None:
    result = subprocess.run(  # noqa: S603  (commande fixe)
        [sys.executable, '-c', _PROCESS_CHECK],
        cwd=settings.BASE_DIR,
        env={**os.environ, 'DJANGO_SETTINGS_MODULE': os.environ.get(
            'DJANGO_SETTINGS_MODULE', 'config.settings.local',
        )},
        capture_output=True,
        timeout=60,
        check=False,
    )
    assert result.returncode == 0, result.stderr.decode()[-2000:]


def test_logo_has_its_own_lower_ceiling() -> None:
    content = image_bytes('PNG', (6_000, 5_000))  # 30 Mpx
    verify_image(content, 'image/png')
    assert _code(content, 'image/png', max_pixels=25_000_000) == IMAGE_TOO_LARGE


@pytest.mark.parametrize(
    ('content', 'content_type'),
    [
        (image_bytes('PNG'), 'image/jpeg'),  # PNG renommé en .jpg
        (image_bytes('JPEG'), 'image/webp'),
        (b'<html><script>alert(1)</script></html>', 'image/png'),
        (b'', 'image/jpeg'),
    ],
    ids=['png-as-jpeg', 'jpeg-as-webp', 'html-as-png', 'empty'],
)
def test_wrong_format_refused(content: bytes, content_type: str) -> None:
    assert _code(content, content_type) == IMAGE_UNREADABLE


@pytest.mark.parametrize(
    ('image_format', 'content_type'),
    [('JPEG', 'image/jpeg'), ('PNG', 'image/png'), ('WEBP', 'image/webp')],
)
def test_truncated_image_refused(image_format: str, content_type: str) -> None:
    content = image_bytes(image_format, (640, 480))
    assert _code(content[: len(content) // 2], content_type) == IMAGE_UNREADABLE


# ─── Envois par l'API : 400, rien de stocké ─────────────────────────────────


def _upload(content: bytes, name: str = 'photo.png') -> SimpleUploadedFile:
    return SimpleUploadedFile(name, content, content_type='image/png')


@S3
class ImageUploadRefusedTest(TestCase):
    def setUp(self) -> None:
        from apps.ocr.tests import make_user_shop

        self.user, self.shop = make_user_shop('images@example.com')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_product_photo_bomb_refused_before_storage(self) -> None:
        from apps.products.services import upload_product_image
        from apps.products.tests import make_product

        product = make_product(self.shop)
        with patch('apps.products.services.upload_fileobj') as upload:
            with pytest.raises(ValidationError) as refused:
                upload_product_image(self.shop, str(product.pk), _upload(BOMB_ERROR))
        assert refused.value.get_codes() == [IMAGE_TOO_LARGE]
        upload.assert_not_called()
        assert not product.images.exists()

    def test_product_photo_with_wrong_extension_answers_400(self) -> None:
        """Un JPEG nommé et annoncé PNG."""
        from django.urls import reverse

        from apps.products.tests import make_product

        product = make_product(self.shop)
        with patch('apps.products.services.upload_fileobj') as upload:
            response = self.client.post(
                reverse('product-image-upload', args=[product.pk]),
                {'image': _upload(image_bytes('JPEG'))},
                format='multipart',
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST, response.content
        assert 'illisible' in str(response.data)
        upload.assert_not_called()

    def test_cover_bomb_refused_and_html_name_ignored(self) -> None:
        from apps.public_pages.factories import PublicPageFactory
        from apps.public_pages.services import upload_page_cover

        page = PublicPageFactory(shop=self.shop)
        with patch('apps.public_pages.services.upload_fileobj') as upload:
            with pytest.raises(ValidationError):
                upload_page_cover(page, _upload(BOMB_WARNING, 'cover.png'))
            upload.assert_not_called()
            # Extension déduite du type vérifié, jamais du nom envoyé.
            upload_page_cover(page, _upload(image_bytes('PNG'), 'cover.html'))
        page.refresh_from_db()
        assert page.cover_object_key.endswith('.png')

    def test_logo_bomb_refused_before_storage(self) -> None:
        from apps.shops.services import upload_shop_logo

        with patch('apps.shops.services.upload_fileobj') as upload:
            with pytest.raises(ValidationError) as refused:
                upload_shop_logo(self.shop, _upload(BOMB_WARNING, 'logo.png'))
        assert refused.value.get_codes() == [IMAGE_TOO_LARGE]
        upload.assert_not_called()

    def test_invoice_photo_bomb_refused_with_code(self) -> None:
        with (
            patch('apps.ocr.services.upload_fileobj') as upload,
            patch('apps.ocr.views.process_invoice_ocr.delay') as delay,
        ):
            response = self.client.post(
                '/api/ocr/invoices/',
                {'document': _upload(BOMB_ERROR, 'facture.png')},
                format='multipart',
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST, response.content
        assert response.data['code'] == IMAGE_TOO_LARGE
        upload.assert_not_called()
        delay.assert_not_called()

    def test_truncated_invoice_photo_refused_with_code(self) -> None:
        content = image_bytes('PNG', (640, 480))
        with patch('apps.ocr.services.upload_fileobj') as upload:
            response = self.client.post(
                '/api/ocr/invoices/',
                {'document': _upload(content[:300], 'facture.png')},
                format='multipart',
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST, response.content
        assert response.data['code'] == IMAGE_UNREADABLE
        upload.assert_not_called()

    def test_product_scan_bomb_refused_without_calling_the_ai_service(self) -> None:
        with (
            patch('apps.ocr.services.scan_product_locally_with_ai_service') as local,
            patch('apps.ocr.services.scan_product_vision_with_ai_service') as vision,
        ):
            response = self.client.post(
                '/api/ocr/product-scan/',
                {'image': _upload(BOMB_ERROR, 'scan.png')},
                format='multipart',
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST, response.content
        assert response.data['code'] == IMAGE_TOO_LARGE
        local.assert_not_called()
        vision.assert_not_called()
