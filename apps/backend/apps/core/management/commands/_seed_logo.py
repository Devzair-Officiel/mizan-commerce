"""Logo géométrique original, sans marque, généré pour la démo (CC0)."""

from io import BytesIO
from typing import TextIO

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image, ImageDraw

from apps.core.storage import is_storage_configured
from apps.shops.models import Shop
from apps.shops.services import upload_shop_logo


def demo_logo_png() -> bytes:
    """Une devanture blanche sur fond terre cuite, sans texte ni ressource externe."""
    image = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((4, 4, 124, 124), radius=28, fill='#c76b38')
    draw.rounded_rectangle((33, 53, 95, 98), radius=5, outline='white', width=6)
    draw.polygon([(27, 53), (39, 32), (89, 32), (101, 53)], fill='white')
    draw.rectangle((57, 72, 72, 98), fill='white')
    output = BytesIO()
    image.save(output, format='PNG')
    return output.getvalue()


def seed_demo_logo(shop: Shop, stdout: TextIO) -> None:
    """Préserve les logos existants et utilise le stockage privé habituel."""
    if shop.logo_object_key:
        return
    if not is_storage_configured():
        stdout.write('    · Logo démo : stockage non configuré\n')
        return
    file = SimpleUploadedFile(
        'demo-logo.png', demo_logo_png(), content_type='image/png'
    )
    saved = upload_shop_logo(shop, file)
    shop.logo_object_key = saved.logo_object_key
    shop.invoice_auto_color = saved.invoice_auto_color
    stdout.write('    ✓ Logo démo généré, couleur automatique extraite\n')
