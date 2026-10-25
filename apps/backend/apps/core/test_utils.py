"""Fichiers fabriqués pour les tests : jamais téléchargés, jamais lus sur disque."""

from io import BytesIO

import pypdfium2 as pdfium
from PIL import Image

A4_PT = (595, 842)


def image_bytes(image_format: str = 'JPEG', size: tuple[int, int] = (8, 8)) -> bytes:
    """Vraie image, minuscule : passe `apps.core.images.verify_image`."""
    buffer = BytesIO()
    Image.new('RGB', size, (200, 80, 40)).save(buffer, image_format)
    return buffer.getvalue()


def bomb_bytes(image_format: str = 'PNG', side: int = 12_000) -> bytes:
    """Image unie très grande mais très compressible (« bombe ») : 140 Ko en
    PNG pour 12 000 × 12 000 px, 144 millions de pixels une fois décodée."""
    buffer = BytesIO()
    Image.new('L', (side, side), 0).save(buffer, image_format)
    return buffer.getvalue()


def pdf_bytes(sizes: list[tuple[float, float]] | None = None) -> bytes:
    """PDF de pages blanches, aux tailles données en points (A4 par défaut)."""
    document = pdfium.PdfDocument.new()
    for width, height in sizes or [A4_PT]:
        document.new_page(width, height)
    buffer = BytesIO()
    document.save(buffer)
    document.close()
    return buffer.getvalue()
