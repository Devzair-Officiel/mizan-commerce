"""Textes des e-mails de compte : durée de validité des liens, en français."""

_DAY = 24 * 60 * 60
_UNITS = ((_DAY, 'jour'), (60 * 60, 'heure'), (60, 'minute'), (1, 'seconde'))


def validity_label(seconds: int) -> str:
    """Durée lisible : « 7 jours », « 3 jours », « 24 heures », « 1 heure ».

    Plus grande unité qui tombe juste ; un seul jour s'écrit « 24 heures ».
    """
    for size, unit in _UNITS:
        count, rest = divmod(seconds, size)
        if rest or not count or (size == _DAY and count == 1):
            continue
        return f'{count} {unit}{"s" if count > 1 else ""}'
    return f'{seconds} seconde{"s" if seconds > 1 else ""}'
