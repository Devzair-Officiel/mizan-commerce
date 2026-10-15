from io import BytesIO, StringIO
from unittest.mock import patch

import pytest
from PIL import Image

from apps.core.management.commands._seed_logo import demo_logo_png, seed_demo_logo
from apps.invoices.colors import inspect_logo, white_contrast
from apps.public_pages.factories import PublicPageFactory
from apps.shops.factories import ShopFactory


def test_demo_logo_is_an_original_png_with_an_accessible_color() -> None:
    content = demo_logo_png()
    with Image.open(BytesIO(content)) as image:
        assert image.format == 'PNG'
        assert image.size == (128, 128)
    color, _ = inspect_logo(content, 'image/png')
    assert color and white_contrast(color) >= 4.5


@pytest.mark.django_db
def test_seed_logo_shares_private_logo_and_is_idempotent(settings) -> None:
    settings.AWS_S3_ENDPOINT_URL = 'https://storage.example.com'
    settings.AWS_ACCESS_KEY_ID = 'test'
    shop = ShopFactory()
    page = PublicPageFactory(shop=shop)
    with patch('apps.shops.services.upload_fileobj') as upload:
        seed_demo_logo(shop, StringIO())
        shop.refresh_from_db()
        page.refresh_from_db()
        assert page.logo_object_key == shop.logo_object_key
        assert shop.logo_object_key.endswith('.png')
        assert white_contrast(shop.invoice_auto_color) >= 4.5
        seed_demo_logo(shop, StringIO())
        upload.assert_called_once()


@pytest.mark.django_db
def test_seed_without_storage_keeps_the_shop_unchanged(settings) -> None:
    settings.AWS_S3_ENDPOINT_URL = ''
    shop = ShopFactory()
    seed_demo_logo(shop, StringIO())
    shop.refresh_from_db()
    assert shop.logo_object_key == shop.invoice_auto_color == ''
