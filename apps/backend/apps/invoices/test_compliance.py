"""Vérification avant émission (URS-110) : bloquant partout, recommandé en France."""

from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.customers.models import Customer

from . import services
from .compliance import check_invoice
from .drafts import create_draft_invoice
from .models import Invoice
from .tests import _make_order_with_items, _make_shop

LINE = {
    "description": "Accompagnement",
    "quantity": Decimal("1"),
    "unit_price_ht": Decimal("100.00"),
}


def _codes(invoice: Invoice) -> list[tuple[str, str]]:
    return [(issue.code, issue.level) for issue in check_invoice(invoice)]


def _business(shop, siren: str = "") -> Customer:
    return Customer.objects.create(
        shop=shop, name=f"Atelier {siren or 'sans SIREN'}",
        customer_type="business", siren=siren,
    )


@pytest.mark.django_db
def test_empty_draft_is_blocked() -> None:
    _, shop, _, _ = _make_shop("compliance-empty@example.com")
    invoice = create_draft_invoice(shop, {})
    assert _codes(invoice) == [("no_lines", "blocking"), ("no_customer", "blocking")]


@pytest.mark.django_db
def test_zero_total_is_blocked() -> None:
    _, shop, _, customer = _make_shop("compliance-zero@example.com")
    invoice = create_draft_invoice(shop, {
        "customer": customer.pk,
        "lines": [{**LINE, "unit_price_ht": Decimal("0")}],
    })
    assert _codes(invoice) == [("zero_total", "blocking")]


@pytest.mark.django_db
def test_complete_french_invoice_to_an_individual_has_nothing_to_report() -> None:
    _, shop, _, customer = _make_shop("compliance-ok@example.com")
    invoice = create_draft_invoice(shop, {"customer": customer.pk, "lines": [LINE]})
    assert _codes(invoice) == []


@pytest.mark.django_db
def test_french_seller_details_are_recommended() -> None:
    _, shop, _, customer = _make_shop("compliance-seller@example.com")
    shop.legal_address = ""
    shop.tax_id = ""
    shop.siret = ""
    shop.vat_number = ""
    shop.save()
    invoice = create_draft_invoice(shop, {"customer": customer.pk, "lines": [LINE]})
    assert _codes(invoice) == [
        ("seller_address", "recommended"),
        ("seller_identifier", "recommended"),
        ("vat_number", "recommended"),
    ]
    # Franchise en base : pas de numéro de TVA attendu ; un SIRET suffit.
    shop.invoice_vat_regime = "exempt"
    shop.siret = "12345678900012"
    shop.save()
    assert _codes(invoice) == [("seller_address", "recommended")]


@pytest.mark.django_db
def test_business_customer_needs_siren_and_late_payment_mentions() -> None:
    _, shop, _, _ = _make_shop("compliance-b2b@example.com")
    shop.legal_mentions = ""
    shop.save()
    invoice = create_draft_invoice(
        shop, {"customer": _business(shop).pk, "lines": [LINE]}
    )
    issues = check_invoice(invoice)
    assert [(i.code, i.target) for i in issues] == [
        ("customer_siren", "customer"),
        ("late_penalties", "invoice_settings"),
    ]
    invoice = create_draft_invoice(
        shop, {"customer": _business(shop, "123456789").pk, "lines": [LINE]}
    )
    assert _codes(invoice) == [("late_penalties", "recommended")]


@pytest.mark.django_db
def test_foreign_shop_only_gets_blocking_checks() -> None:
    _, shop, _, _ = _make_shop("compliance-ma@example.com")
    shop.country = "MA"
    shop.legal_address = shop.tax_id = shop.vat_number = shop.legal_mentions = ""
    shop.save()
    invoice = create_draft_invoice(
        shop, {"customer": _business(shop).pk, "lines": [LINE]}
    )
    assert _codes(invoice) == []
    assert _codes(create_draft_invoice(shop, {})) == [
        ("no_lines", "blocking"), ("no_customer", "blocking"),
    ]


@pytest.mark.django_db
def test_compliance_endpoint_lists_issues_for_a_draft_only() -> None:
    user, shop, variant, customer = _make_shop("compliance-api@example.com")
    api = APIClient()
    api.force_authenticate(user)
    draft = create_draft_invoice(shop, {"lines": [LINE]})
    response = api.get(reverse("invoice-compliance", args=[draft.pk]))
    assert response.status_code == 200
    assert response.data == {"issues": [
        {"code": "no_customer", "level": "blocking", "target": "customer"},
    ]}
    order = _make_order_with_items(shop, user, variant, customer)
    issued = services.issue_invoice_from_order(shop=shop, order=order)
    response = api.get(reverse("invoice-compliance", args=[issued.pk]))
    assert response.status_code == 409
