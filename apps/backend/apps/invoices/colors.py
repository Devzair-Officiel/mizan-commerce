"""Couleur d'accent accessible ; Pillow est déjà fourni par ReportLab."""

from collections import Counter
from io import BytesIO

from PIL import Image, UnidentifiedImageError
from rest_framework.exceptions import ValidationError


def white_contrast(color: str) -> float:
    """Rapport WCAG entre une couleur sRGB et le blanc (dans les deux sens)."""
    channels = [int(color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [
        v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in channels
    ]
    luminance = sum(v * weight for v, weight in zip(linear, (0.2126, 0.7152, 0.0722)))
    return 1.05 / (luminance + 0.05)


def accessible_color(color: str) -> str:
    """Assombrit en préservant la teinte jusqu'à un contraste blanc ≥ 4,5:1."""
    rgb = [int(color[i : i + 2], 16) for i in (1, 3, 5)]
    while white_contrast(color) < 4.5:
        rgb = [max(0, int(v * 0.98)) for v in rgb]
        color = '#' + ''.join(f'{v:02x}' for v in rgb)
    return color.lower()


def inspect_logo(content: bytes, content_type: str) -> tuple[str, str]:
    """Vérifie l’image et extrait sa couleur dominante hors pixels achromatiques."""
    formats = {'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WEBP'}
    try:
        with Image.open(BytesIO(content)) as source:
            if (
                source.format != formats.get(content_type)
                or source.width * source.height > 25_000_000
            ):
                raise ValidationError('Image invalide ou dimensions trop grandes.')
            source.verify()
        with Image.open(BytesIO(content)) as source:
            source.thumbnail((128, 128))
            pixels = list(source.convert('RGBA').getdata())
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
    ) as exc:
        raise ValidationError(
            'Image invalide. Formats acceptés : JPEG, PNG, WebP.'
        ) from exc
    useful = [
        (r, g, b)
        for r, g, b, a in pixels
        if a >= 128
        and max(r, g, b) - min(r, g, b) >= 25
        and max(r, g, b) >= 30
        and min(r, g, b) <= 235
    ]
    if not useful:
        return '', {'PNG': 'png', 'JPEG': 'jpg', 'WEBP': 'webp'}[formats[content_type]]
    bucket = Counter(tuple(v // 24 for v in rgb) for rgb in useful).most_common(1)[0][0]
    dominant = [rgb for rgb in useful if tuple(v // 24 for v in rgb) == bucket]
    rgb = [sum(p[i] for p in dominant) // len(dominant) for i in range(3)]
    color = accessible_color('#' + ''.join(f'{v:02x}' for v in rgb))
    return color, {'PNG': 'png', 'JPEG': 'jpg', 'WEBP': 'webp'}[formats[content_type]]
