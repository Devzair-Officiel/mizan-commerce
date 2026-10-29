"""Brouillons de facture libre (URS-110) : création, enregistrement, suppression."""

from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import AuditLog
from apps.customers.models import Customer
from apps.products.models import Product, ProductVariant

from . import drafts, services
from .models import Invoice, InvoiceLine
from .tests import _make_order_with_items, _make_shop

LINE = {
    "description": "Nuit d'hôtel",
    "details": "Chambre double\nPetit-déjeuner compris",
    "unit": "nuit",
    "quantity": "2",
    "unit_price_ht": "85.50",
}


@pytest.fixture
def ctx() -> SimpleNamespace:
    user, shop, variant, customer = _make_shop("drafts@example.com")
    api = APIClient()
    api.force_authenticate(user)
    return SimpleNamespace(
        user=user, shop=shop, variant=variant, customer=customer, api=api
    )


def _create(ctx: SimpleNamespace, **payload) -> dict:
    payload.setdefault("customer", str(ctx.customer.pk))
    payload.setdefault("lines", [LINE])
    response = ctx.api.post(reverse("invoice-draft-create"), payload, format="json")
    assert response.status_code == 201, response.data
    return response.data


def _patch(ctx: SimpleNamespace, draft: dict, **payload):
    payload.setdefault("updated_at", draft["updated_at"])
    return ctx.api.patch(
        reverse("invoice-draft", args=[draft["id"]]), payload, format="json"
    )


def _issued(ctx: SimpleNamespace) -> Invoice:
    order = _make_order_with_items(ctx.shop, ctx.user, ctx.variant, ctx.customer)
    return services.issue_invoice_from_order(shop=ctx.shop, order=order)


@pytest.mark.django_db
def test_draft_has_no_number_and_takes_shop_defaults(ctx) -> None:
    data = _create(ctx)
    assert data["status"] == "draft"
    assert data["number"] == ""
    assert data["issued_at"] is None
    assert data["due_date"] is None
    assert data["payment_terms_days"] == 30
    # Catalogue « both » par défaut : opération mixte.
    assert data["operation_category"] == "mixed"
    assert data["buyer_name"] == ctx.customer.display_name
    line = data["lines"][0]
    assert line["details"] == "Chambre double\nPetit-déjeuner compris"
    assert (line["unit"], line["position"]) == ("nuit", 0)
    assert Decimal(data["subtotal_ht"]) == Decimal("171.00")
    assert Decimal(data["tax_amount"]) == Decimal("34.20")
    assert Decimal(data["total_ttc"]) == Decimal("205.20")


@pytest.mark.django_db
def test_operation_category_follows_catalog_kind(ctx) -> None:
    ctx.shop.catalog_kind = "services"
    ctx.shop.save(update_fields=["catalog_kind"])
    assert _create(ctx)["operation_category"] == "services"
    assert _create(ctx, operation_category="goods")["operation_category"] == "goods"


@pytest.mark.django_db
def test_two_drafts_coexist_without_number_conflict(ctx) -> None:
    first, second = _create(ctx), _create(ctx)
    assert first["id"] != second["id"]
    assert Invoice.objects.filter(shop=ctx.shop, number="").count() == 2


@pytest.mark.django_db
def test_totals_are_exact_decimals(ctx) -> None:
    lines = [{"description": f"Ligne {n}", "quantity": "1", "unit_price_ht": "0.10"}
             for n in range(3)]
    lines.append({"description": "Fraction", "quantity": "0.333",
                  "unit_price_ht": "0.10"})
    invoice = drafts.create_draft_invoice(ctx.shop, {
        "customer": ctx.customer.pk,
        "lines": [
            {**row, "quantity": Decimal(row["quantity"]),
             "unit_price_ht": Decimal(row["unit_price_ht"])}
            for row in lines
        ],
        "discount_amount": Decimal("0.05"),
        "shipping_amount": Decimal("1.00"),
    })
    invoice.refresh_from_db()
    # 0,10 × 3 + 0,03 : en flottant, 0,30000000000000004.
    assert invoice.subtotal_ht == Decimal("0.33")
    assert invoice.tax_amount == Decimal("0.26")  # (0,33 − 0,05 + 1) × 20 %
    assert invoice.total_ttc == Decimal("1.54")
    assert all(isinstance(v, Decimal) for v in
               (invoice.subtotal_ht, invoice.tax_amount, invoice.total_ttc))


@pytest.mark.django_db
def test_patch_replaces_lines_in_order_and_recomputes(ctx) -> None:
    draft = _create(ctx)
    response = _patch(ctx, draft, lines=[
        {"description": "Trajet", "quantity": "1", "unit_price_ht": "40"},
        {**LINE, "quantity": "1"},
    ], payment_terms_days=15)
    assert response.status_code == 200, response.data
    assert [line["description"] for line in response.data["lines"]] == [
        "Trajet", "Nuit d'hôtel",
    ]
    assert [line["position"] for line in response.data["lines"]] == [0, 1]
    assert Decimal(response.data["subtotal_ht"]) == Decimal("125.50")
    assert response.data["payment_terms_days"] == 15
    assert response.data["updated_at"] != draft["updated_at"]
    assert InvoiceLine.objects.filter(invoice_id=draft["id"]).count() == 2


@pytest.mark.django_db
def test_patch_without_lines_keeps_them(ctx) -> None:
    draft = _create(ctx)
    response = _patch(ctx, draft, notes="Merci")
    assert response.status_code == 200
    assert response.data["notes"] == "Merci"
    assert len(response.data["lines"]) == 1


@pytest.mark.django_db
def test_stale_patch_returns_409_and_keeps_saved_version(ctx) -> None:
    draft = _create(ctx)
    assert _patch(ctx, draft, notes="Onglet A").status_code == 200
    response = _patch(ctx, draft, notes="Onglet B")
    assert response.status_code == 409
    assert response.data["code"] == "draft_conflict"
    assert Invoice.objects.get(pk=draft["id"]).notes == "Onglet A"


@pytest.mark.django_db
def test_patch_requires_updated_at(ctx) -> None:
    draft = _create(ctx)
    response = ctx.api.patch(
        reverse("invoice-draft", args=[draft["id"]]), {"notes": "x"}, format="json"
    )
    assert response.status_code == 400
    assert "updated_at" in response.data["errors"]


@pytest.mark.django_db
def test_invalid_lines_are_rejected(ctx) -> None:
    for line in (
        {**LINE, "quantity": "0"},
        {**LINE, "unit_price_ht": "-1"},
        {**LINE, "description": ""},
        {**LINE, "unit": "u" * 31},
    ):
        response = ctx.api.post(
            reverse("invoice-draft-create"), {"lines": [line]}, format="json"
        )
        assert response.status_code == 400, line
    assert not Invoice.objects.filter(shop=ctx.shop).exists()


@pytest.mark.django_db
def test_customer_can_be_changed_or_removed(ctx) -> None:
    other = Customer.objects.create(
        shop=ctx.shop, name="Atelier", customer_type="business", siren="123456789"
    )
    draft = _create(ctx)
    response = _patch(ctx, draft, customer=str(other.pk))
    assert response.data["buyer_name"] == other.display_name
    assert response.data["buyer_email"] == ""
    response = _patch(ctx, response.data, customer=None)
    assert response.data["customer"] is None
    assert response.data["buyer_name"] == ""


@pytest.mark.django_db
def test_issued_invoice_is_neither_patched_nor_deleted(ctx) -> None:
    invoice = _issued(ctx)
    response = ctx.api.patch(
        reverse("invoice-draft", args=[invoice.pk]),
        {"notes": "x", "updated_at": invoice.updated_at.isoformat()},
        format="json",
    )
    assert response.status_code == 409
    assert response.data["code"] == "not_draft"
    response = ctx.api.delete(reverse("invoice-draft", args=[invoice.pk]))
    assert response.status_code == 409
    assert Invoice.objects.filter(pk=invoice.pk, status="issued").exists()


@pytest.mark.django_db
def test_delete_draft_removes_lines_and_is_logged(ctx) -> None:
    draft = _create(ctx)
    response = ctx.api.delete(reverse("invoice-draft", args=[draft["id"]]))
    assert response.status_code == 204
    assert not Invoice.objects.filter(pk=draft["id"]).exists()
    assert not InvoiceLine.objects.filter(invoice_id=draft["id"]).exists()
    log = AuditLog.objects.get(action="invoice_draft_deleted")
    assert (log.shop_id, log.object_id) == (ctx.shop.pk, draft["id"])


@pytest.mark.django_db
def test_draft_has_no_payment_status_nor_pdf(ctx) -> None:
    draft = _create(ctx)
    response = ctx.api.patch(
        reverse("invoice-status", args=[draft["id"]]), {"status": "paid"},
        format="json",
    )
    assert (response.status_code, response.data["code"]) == (409, "draft_not_issued")
    response = ctx.api.get(reverse("invoice-pdf", args=[draft["id"]]))
    assert (response.status_code, response.data["code"]) == (409, "draft_no_pdf")
    assert Invoice.objects.get(pk=draft["id"]).status == "draft"


@pytest.mark.django_db
def test_mark_paid_and_cancel_refuse_a_draft(ctx) -> None:
    invoice = Invoice.objects.get(pk=_create(ctx)["id"])
    for transition in (services.mark_paid, services.cancel_invoice):
        with pytest.raises(services.InvoiceStateError):
            transition(invoice)
    assert Invoice.objects.get(pk=invoice.pk).status == "draft"


def _list_ids(ctx: SimpleNamespace, ordering: str | None = None) -> list[str]:
    params = {"ordering": ordering} if ordering else {}
    response = ctx.api.get(reverse("invoice-list"), params)
    return [row["id"] for row in response.data["results"]]


@pytest.mark.django_db
def test_list_shows_drafts_first_by_last_update_then_issued(ctx) -> None:
    old_issued, new_issued = _issued(ctx), _issued(ctx)
    Invoice.objects.filter(pk=old_issued.pk).update(
        issued_at=timezone.now() - timedelta(days=2)
    )
    older, newer = _create(ctx), _create(ctx)
    Invoice.objects.filter(pk=older["id"]).update(
        updated_at=timezone.now() + timedelta(minutes=5)
    )
    issued = [str(new_issued.pk), str(old_issued.pk)]
    assert _list_ids(ctx) == [older["id"], newer["id"], *issued]
    # Statut : brouillons d'abord, puis le tri par défaut.
    assert _list_ids(ctx, "status") == [older["id"], newer["id"], *issued]
    # Date croissante ou échéance : sans date, le brouillon passe en fin.
    assert _list_ids(ctx, "issued_at")[:2] == issued[::-1]
    assert _list_ids(ctx, "issued_at")[2:] == [older["id"], newer["id"]]
    assert _list_ids(ctx, "due_date")[2:] == [older["id"], newer["id"]]
    assert _list_ids(ctx, "-due_date")[2:] == [older["id"], newer["id"]]


@pytest.mark.django_db
def test_drafts_stay_out_of_indicators_but_have_a_facet(ctx) -> None:
    _create(ctx)
    summary = ctx.api.get(reverse("invoice-summary")).data
    assert summary["due"]["count"] == 0
    assert summary["issued_month"]["count"] == 0
    facets = ctx.api.get(reverse("invoice-facets")).data
    assert facets["status"]["draft"] == 1
    assert facets["payment"]["due"] == 0
    response = ctx.api.get(reverse("invoice-list"), {"status": "draft"})
    assert response.data["count"] == 1


@pytest.mark.django_db
def test_every_endpoint_is_scoped_to_the_shop(ctx) -> None:
    draft = _create(ctx)
    intruder, _, _, _ = _make_shop("drafts-intruder@example.com")
    api = APIClient()
    api.force_authenticate(intruder)
    pk = draft["id"]
    stamp = {"updated_at": draft["updated_at"], "notes": "x"}
    responses = [
        api.patch(reverse("invoice-draft", args=[pk]), stamp, format="json"),
        api.delete(reverse("invoice-draft", args=[pk])),
        api.get(reverse("invoice-compliance", args=[pk])),
        api.post(reverse("invoice-issue", args=[pk]), {}, format="json"),
        api.get(reverse("invoice-detail", args=[pk])),
        api.patch(reverse("invoice-status", args=[pk]), {"status": "paid"}),
        api.get(reverse("invoice-pdf", args=[pk])),
    ]
    assert [r.status_code for r in responses] == [404] * len(responses)
    response = api.post(
        reverse("invoice-draft-create"),
        {"customer": str(ctx.customer.pk)},
        format="json",
    )
    assert response.status_code == 400
    assert "customer" in response.data["errors"]
    assert Invoice.objects.get(pk=pk).notes == ""
    assert api.get(reverse("invoice-list")).data["count"] == 0


@pytest.mark.django_db
def test_line_suggestions_list_catalog_then_previous_lines(ctx) -> None:
    product = Product.objects.create(shop=ctx.shop, name="Nuitée", type="service")
    ProductVariant.objects.create(
        shop=ctx.shop, product=product, packaging_name="Par défaut",
        unit_label="nuit", selling_price="90.00",
    )
    _create(ctx)  # Brouillon : ses lignes ne sont jamais suggérées.
    invoice = _issued(ctx)
    InvoiceLine.objects.create(
        shop=ctx.shop, invoice=invoice, description="Nuit d'hôtel",
        details="Vue mer", unit="nuit", quantity=1, unit_price_ht="85.50",
        line_subtotal_ht="85.50", position=5,
    )
    rows = ctx.api.get(reverse("invoice-line-suggestions"), {"q": "nui"}).data
    assert [(row["source"], row["description"]) for row in rows] == [
        ("catalog", "Nuitée"), ("invoice_line", "Nuit d'hôtel"),
    ]
    assert (rows[0]["unit"], rows[0]["unit_price_ht"]) == ("nuit", "90.00")
    assert rows[1]["invoice_number"] == invoice.number
    assert rows[1]["details"] == "Vue mer"
    assert ctx.api.get(reverse("invoice-line-suggestions"), {"q": " "}).data == []

    intruder, _, _, _ = _make_shop("suggest-intruder@example.com")
    api = APIClient()
    api.force_authenticate(intruder)
    assert api.get(reverse("invoice-line-suggestions"), {"q": "nui"}).data == []
