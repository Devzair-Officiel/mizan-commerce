"""Dates du hawl : conversion grégorien ↔ hégirien (calendrier Umm al-Qura).

Fonctions pures, sans accès à la base. `hijridate` couvre 1343–1500 H
(1924-08-01 → 2077-11-16) : hors de cette plage, `HijriRangeError`.
"""
from datetime import date

from hijridate import Gregorian, Hijri

CALENDAR_HIJRI = 'hijri'
CALENDAR_GREGORIAN = 'gregorian'
CALENDAR_CHOICES = [
    (CALENDAR_HIJRI, 'Hégirien'),
    (CALENDAR_GREGORIAN, 'Grégorien'),
]


class HijriRangeError(ValueError):
    """Date hors de la plage du calendrier Umm al-Qura."""


def to_hijri(day: date) -> tuple[int, int, int]:
    """(année, mois, jour) hégiriens d'une date grégorienne."""
    try:
        hijri = Gregorian.fromdate(day).to_hijri()
    except (OverflowError, ValueError) as exc:
        raise HijriRangeError(str(exc)) from exc
    return hijri.year, hijri.month, hijri.day


def hawl_year(day: date, calendar: str) -> int:
    """Année du hawl d'une date de référence : hégirienne ou grégorienne."""
    if calendar == CALENDAR_HIJRI:
        return to_hijri(day)[0]
    return day.year


def _hijri_anniversary(year: int, month: int, day: int) -> date:
    """Date grégorienne du jour `day` du mois hégirien, borné à la longueur du mois."""
    try:
        length = Hijri(year, month, 1).month_length()
        gregorian = Hijri(year, month, min(day, length)).to_gregorian()
    except (OverflowError, ValueError) as exc:
        raise HijriRangeError(str(exc)) from exc
    return date(gregorian.year, gregorian.month, gregorian.day)


def _gregorian_anniversary(year: int, month: int, day: int) -> date:
    """Anniversaire grégorien ; le 29 février devient le 28 les années non bissextiles."""  # noqa: E501
    try:
        return date(year, month, day)
    except ValueError:
        return date(year, month, day - 1)


def _anniversary(hawl_date: date, calendar: str, year: int) -> date:
    """Anniversaire du jour J pour l'année `year` (hégirienne ou grégorienne)."""
    if calendar == CALENDAR_HIJRI:
        _, month, day = to_hijri(hawl_date)
        return _hijri_anniversary(year, month, day)
    return _gregorian_anniversary(year, hawl_date.month, hawl_date.day)


def next_hawl_date(hawl_date: date, calendar: str, today: date) -> date:
    """Prochaine date (≥ `today`) anniversaire du jour J, dans le calendrier choisi."""
    year = hawl_year(today, calendar)
    candidate = _anniversary(hawl_date, calendar, year)
    if candidate < today:
        candidate = _anniversary(hawl_date, calendar, year + 1)
    return candidate


def hawl_cycle(hawl_date: date, calendar: str, today: date) -> tuple[date, date]:
    """(jour J précédent, prochain jour J ≥ `today`) : bornes du cycle en cours."""
    upcoming = next_hawl_date(hawl_date, calendar, today)
    previous = _anniversary(hawl_date, calendar, hawl_year(upcoming, calendar) - 1)
    return previous, upcoming
