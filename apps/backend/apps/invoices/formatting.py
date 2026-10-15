"""Présentation des identifiants : aucune mutation des valeurs enregistrées."""

import re

from apps.customers.services import (
    format_phone_display,
    normalize_phone,
    InvalidPhoneNumber,
)


def compact_identifier(value: str) -> str:
    return re.sub(r'\s', '', value)


def format_siret(value: str) -> str:
    compact = compact_identifier(value)
    if not re.fullmatch(r'[0-9]{14}', compact):
        return value
    return ' '.join((compact[:3], compact[3:6], compact[6:9], compact[9:]))


def format_iban(value: str) -> str:
    compact = compact_identifier(value)
    return ' '.join(compact[i : i + 4] for i in range(0, len(compact), 4))


def format_vat_number(value: str) -> str:
    compact = compact_identifier(value)
    if re.fullmatch(r'FR[A-Z0-9]{2}[0-9]{9}', compact, flags=re.IGNORECASE):
        return ' '.join((compact[:4], compact[4:7], compact[7:10], compact[10:]))
    if re.fullmatch(r'[A-Za-z]{2}[A-Za-z0-9]+', compact):
        return (
            compact[:2]
            + ' '
            + ' '.join(compact[i : i + 3] for i in range(2, len(compact), 3))
        )
    return value


def format_invoice_phone(value: str, country: str = '') -> str:
    try:
        return format_phone_display(normalize_phone(value, country))
    except InvalidPhoneNumber:
        return value


def format_tax_id(value: str) -> str:
    compact = compact_identifier(value)
    if re.fullmatch(r'[0-9]{14}', compact):
        return format_siret(value)
    if re.fullmatch(r'([A-Z]{2}[0-9]+|FR[A-Z0-9]{2}[0-9]{9})', compact, re.IGNORECASE):
        return format_vat_number(value)
    return value
