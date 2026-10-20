"""Décodage et préparation d'une photo d'emballage (Pillow).

Deux usages :
- `open_image` : image prête pour le décodage du code-barres, orientée selon
  l'EXIF (une photo de téléphone est souvent stockée couchée) ;
- `prepare_for_provider` : copie réduite (côté long ≤ 1600 px), ré-encodée en
  JPEG sans aucune métadonnée — c'est la seule forme sous laquelle une image
  peut partir chez un fournisseur de vision (la position GPS de l'EXIF trahirait
  l'adresse de la boutique).

Pillow est déjà installé par PaddleOCR ; il est épinglé dans requirements.txt
parce que le code l'utilise directement.
"""
from __future__ import annotations

import io

from PIL import Image, ImageOps, UnidentifiedImageError

# Côté long maximal envoyé au fournisseur : assez pour lire un texte
# d'emballage, sans payer des tuiles d'image inutiles.
PROVIDER_MAX_SIDE_PX: int = 1600
PROVIDER_JPEG_QUALITY: int = 85

# Garde contre les « bombes de décompression » : un PNG de quelques Ko peut
# annoncer 100 000 × 100 000 px. 40 Mpx couvre largement un capteur de téléphone.
MAX_PIXELS: int = 40_000_000


class ImageDecodeError(ValueError):
    """Image illisible ou démesurée — l'endpoint répond 400 générique."""


def open_image(content: bytes) -> Image.Image:
    """Décode l'image, applique l'orientation EXIF et la convertit en RGB."""
    try:
        image = Image.open(io.BytesIO(content))
        if image.width * image.height > MAX_PIXELS:
            raise ImageDecodeError('Image trop grande.')
        image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ImageDecodeError('Image illisible.') from exc
    return ImageOps.exif_transpose(image).convert('RGB')


def prepare_for_provider(image: Image.Image) -> bytes:
    """JPEG réduit, sans EXIF ni autre métadonnée, prêt pour le fournisseur.

    Une image neuve est recopiée pixel par pixel : `save` ne reçoit ni `exif`
    ni `icc_profile`, et la copie n'hérite d'aucun bloc `info` de l'original.
    """
    resized = image.copy()
    resized.thumbnail((PROVIDER_MAX_SIDE_PX, PROVIDER_MAX_SIDE_PX), Image.Resampling.LANCZOS)
    clean = Image.new('RGB', resized.size)
    clean.paste(resized)
    buffer = io.BytesIO()
    clean.save(buffer, format='JPEG', quality=PROVIDER_JPEG_QUALITY, optimize=True)
    return buffer.getvalue()
