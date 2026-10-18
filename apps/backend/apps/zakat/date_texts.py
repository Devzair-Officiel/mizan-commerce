"""Dates du jour J en toutes lettres, grégorienne et hégirienne : justificatif PDF et
e-mail de rappel. Mêmes noms de mois que l'écran (`zakat.hijri_month.*`)."""
from datetime import date

from babel.dates import format_date

from . import hawl

HIJRI_MONTHS: dict[str, tuple[str, ...]] = {
    'fr': (
        'mouharram', 'safar', 'rabia al-awal', 'rabia ath-thani', 'joumada al-oula',
        'joumada ath-thania', 'rajab', 'chaabane', 'ramadan', 'chawwal',
        "dhou al-qi'da", 'dhou al-hijja',
    ),
    'en': (
        'Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Ula',
        'Jumada al-Akhirah', 'Rajab', 'Shaban', 'Ramadan', 'Shawwal',
        'Dhu al-Qadah', 'Dhu al-Hijjah',
    ),
    'ar': (
        'محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة',
        'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة',
    ),
}


def gregorian_text(day: date, language: str) -> str:
    """« 22 février 2027 », « February 22, 2027 »."""
    return format_date(day, format='long', locale=language)


def hijri_text(day: date, language: str) -> str | None:
    """« 15 ramadan 1448 » ; `None` hors de la plage du calendrier Umm al-Qura."""
    try:
        year, month, hijri_day = hawl.to_hijri(day)
    except hawl.HijriRangeError:
        return None
    return f'{hijri_day} {HIJRI_MONTHS[language][month - 1]} {year}'
