from copy import deepcopy

import pytest

from .formatting import (
    format_iban,
    format_invoice_phone,
    format_siret,
    format_tax_id,
    format_vat_number,
)
from .pdf import build_invoice_pdf
from .preview import reference_invoice
from .test_pdf import text_pages


@pytest.mark.parametrize(
    'raw,formatted',
    [
        ('91234567800012', '912 345 678 00012'),
        ('912 345 678 00012', '912 345 678 00012'),
        ('', ''),
        ('123', '123'),
    ],
)
def test_siret_display(raw: str, formatted: str) -> None:
    assert format_siret(raw) == formatted


@pytest.mark.parametrize(
    'raw,formatted',
    [
        ('FR7630006000011234567890189', 'FR76 3000 6000 0112 3456 7890 189'),
        ('DE89370400440532013000', 'DE89 3704 0044 0532 0130 00'),
        ('', ''),
    ],
)
def test_iban_display(raw: str, formatted: str) -> None:
    assert format_iban(raw) == formatted


@pytest.mark.parametrize(
    'raw,formatted',
    [
        ('FR12345678901', 'FR12 345 678 901'),
        ('FR12 345 678 901', 'FR12 345 678 901'),
        ('GB123456789', 'GB 123 456 789'),
        ('', ''),
    ],
)
def test_vat_display(raw: str, formatted: str) -> None:
    assert format_vat_number(raw) == formatted


@pytest.mark.parametrize(
    'raw,country,formatted',
    [
        ('+33612345678', 'FR', '+33 6 12 34 56 78'),
        ('0612345678', 'FR', '+33 6 12 34 56 78'),
        ('', '', ''),
        ('ancienne saisie', 'FR', 'ancienne saisie'),
    ],
)
def test_phone_display(raw: str, country: str, formatted: str) -> None:
    assert format_invoice_phone(raw, country) == formatted


def test_free_tax_identifier_keeps_its_original_text() -> None:
    assert format_tax_id('SIRET: 123') == 'SIRET: 123'
    assert format_tax_id('Identifiant libre') == 'Identifiant libre'


@pytest.mark.django_db
def test_pdf_formats_identifiers_without_modifying_the_snapshot() -> None:
    invoice = reference_invoice()
    invoice.buyer_phone = '+33612345678'
    invoice.presentation.update(vat_regime='applicable', vat_number='FR12345678901')
    before = deepcopy(invoice.presentation)
    text = '\n'.join(text_pages(build_invoice_pdf(invoice)))
    for formatted in (
        '912 345 678 00012',
        'FR76 3000 6000 0112 3456 7890 189',
        'FR12 345 678 901',
        '+33 6 12 34 56 78',
        '+33 1 23 45 67 89',
    ):
        # PDFium peut rendre une fin de ligne entre les blocs d'un IBAN long.
        assert formatted in ' '.join(text.split())
    assert invoice.presentation == before
    assert invoice.buyer_phone == '+33612345678'
