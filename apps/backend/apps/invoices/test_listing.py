from copy import deepcopy
from datetime import datetime, timedelta, timezone as utc
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Invoice
from .tests import _make_shop


@pytest.fixture
def context():
    user, shop, _, customer = _make_shop("invoice-list@example.com")
    api = APIClient()
    api.force_authenticate(user)
    now = timezone.now()
    rows = []
    for n, state, paid in [
        (1, "issued", "0"),
        (2, "issued", "30"),
        (3, "paid", "300"),
        (4, "cancelled", "0"),
    ]:
        rows.append(
            Invoice.objects.create(
                shop=shop,
                customer=customer,
                number=f"fact-151026-{n:04}",
                status=state,
                buyer_name="Client " + ["Delta", "Charlie", "Bravo", "Alpha"][n - 1],
                currency="EUR",
                issued_at=now - timedelta(minutes=n),
                due_date=now.date() + timedelta(days=n),
                total_ttc=Decimal("100") * n,
                amount_paid=Decimal(paid),
                paid_at=now if state == "paid" else None,
            )
        )
    return api, shop, rows


@pytest.mark.django_db
def test_summary_matches_card_filters_and_excludes_other_shops(context) -> None:
    api, _, rows = context
    _, other, _, _ = _make_shop("invoice-other@example.com")
    Invoice.objects.create(
        shop=other,
        number="secret",
        currency="EUR",
        issued_at=timezone.now(),
        due_date=timezone.now().date(),
        total_ttc=9999,
    )
    data = api.get(reverse("invoice-summary")).data
    assert data["due"]["count"] == 2
    assert Decimal(data["due"]["amount"]) == Decimal("270")
    for card, query in [
        ("due", {"payment": "due"}),
        ("issued_month", {"period": "issued_month"}),
        ("paid_month", {"period": "paid_month"}),
    ]:
        response = api.get(reverse("invoice-list"), query)
        assert response.data["count"] == data[card]["count"]
        assert all(
            row["id"] in {str(i.pk) for i in rows} for row in response.data["results"]
        )


@pytest.mark.django_db
@pytest.mark.parametrize(
    "payment,expected", [("due", 2), ("unpaid", 1), ("partial", 1), ("paid", 1)]
)
def test_payment_filters(context, payment: str, expected: int) -> None:
    api, _, _ = context
    assert (
        api.get(reverse("invoice-list"), {"payment": payment}).data["count"] == expected
    )


@pytest.mark.django_db
def test_zero_invoice_is_unpaid_but_not_an_amount_to_collect(context) -> None:
    api, shop, rows = context
    Invoice.objects.create(
        shop=shop, number='fact-zero', currency='EUR', total_ttc=0,
        issued_at=rows[0].issued_at, due_date=rows[0].due_date,
    )
    assert api.get(reverse('invoice-list'), {'payment': 'unpaid'}).data['count'] == 2
    assert api.get(reverse('invoice-summary')).data['due']['count'] == 2
    facets = api.get(reverse('invoice-facets')).data['payment']
    assert facets['unpaid'] == facets['due'] == 2


@pytest.mark.django_db
def test_facets_ignore_their_own_filter_and_include_search(context) -> None:
    api, _, _ = context
    response = api.get(
        reverse("invoice-facets"), {"status": "issued", "payment": "partial"}
    )
    data = response.data
    assert data["status"] == {"all": 1, "issued": 1, "paid": 0, "cancelled": 0}
    assert data["payment"] == {"all": 2, "due": 2, "unpaid": 1, "partial": 1, "paid": 0}
    data = api.get(reverse("invoice-facets"), {"search": "Client Delta"}).data
    assert data["status"]["all"] == data["payment"]["unpaid"] == 1


@pytest.mark.django_db
@pytest.mark.parametrize(
    "field", ["number", "buyer_name", "issued_at", "due_date", "total_ttc", "status"]
)
@pytest.mark.parametrize("descending", [False, True])
def test_server_sorting_all_columns(context, field: str, descending: bool) -> None:
    api, _, rows = context
    ordering = ("-" if descending else "") + field
    data = api.get(reverse("invoice-list"), {"ordering": ordering}).data
    ranks = {"issued": 0, "paid": 1, "cancelled": 2}

    def key(row: Invoice):
        return ranks[row.status] if field == "status" else getattr(row, field)

    expected = sorted(rows, key=key, reverse=descending)
    assert [row["id"] for row in data["results"]] == [str(row.pk) for row in expected]


@pytest.mark.django_db
def test_search_and_pagination_are_server_side_and_stable(context) -> None:
    api, shop, rows = context
    for n in range(5, 26):
        Invoice.objects.create(
            shop=shop,
            number=f"fact-151026-{n:04}",
            buyer_name="Archive",
            currency="EUR",
            issued_at=rows[0].issued_at,
            due_date=rows[0].due_date,
        )
    first = api.get(reverse("invoice-list")).data
    second = api.get(reverse("invoice-list"), {"page": 2}).data
    assert first["count"] == 25 and len(first["results"]) == 20
    assert second["count"] == 25 and len(second["results"]) == 5
    assert not {i["id"] for i in first["results"]} & {
        i["id"] for i in second["results"]
    }
    assert api.get(reverse("invoice-list"), {"search": "0002"}).data["count"] == 1
    assert (
        api.get(reverse("invoice-list"), {"search": "Client Charlie"}).data["count"]
        == 1
    )


@pytest.mark.django_db
def test_month_uses_shop_timezone_and_payment_date(context) -> None:
    api, shop, rows = context
    # Shop.save recalcule le fuseau depuis le pays ; isoler ici la borne mensuelle.
    type(shop).objects.filter(pk=shop.pk).update(timezone="Pacific/Kiritimati")
    now = datetime(2026, 10, 31, 10, 15, tzinfo=utc.utc)
    Invoice.objects.filter(shop=shop).update(
        issued_at=now - timedelta(days=2), paid_at=None
    )
    Invoice.objects.filter(pk=rows[0].pk).update(issued_at=now - timedelta(minutes=15))
    Invoice.objects.filter(pk=rows[2].pk).update(paid_at=now)
    with patch("apps.orders.services.timezone.now", return_value=now):
        summary = api.get(reverse("invoice-summary")).data
        assert summary["issued_month"]["count"] == 1
        assert summary["paid_month"]["count"] == 1
        assert (
            api.get(reverse("invoice-list"), {"period": "paid_month"}).data["count"]
            == 1
        )


@pytest.mark.django_db
def test_detail_logo_uses_frozen_key_without_mutating_snapshot(
    context, settings
) -> None:
    api, shop, rows = context
    settings.AWS_S3_ENDPOINT_URL = "https://storage.example.com"
    settings.AWS_ACCESS_KEY_ID = "test"
    shop.logo_object_key = "new-logo.png"
    shop.save(update_fields=["logo_object_key"])
    invoice = rows[0]
    invoice.presentation = {"logo_object_key": "frozen-logo.png", "color": "#9c4f2c"}
    invoice.save(update_fields=["presentation"])
    before = deepcopy(invoice.presentation)
    with patch(
        "apps.invoices.serializers.get_signed_url",
        return_value="https://signed.example/logo",
    ) as sign:
        data = api.get(reverse("invoice-detail", args=[invoice.pk])).data
        sign.assert_called_once_with("frozen-logo.png")
    assert data["logo_url"] == "https://signed.example/logo"
    invoice.refresh_from_db()
    assert invoice.presentation == before
    assert (
        api.patch(
            reverse("invoice-detail", args=[invoice.pk]), {"total_ttc": "1"}
        ).status_code
        == 405
    )
