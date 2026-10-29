"""Client professionnel (URS-110) : type de client et SIREN."""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.invoices.tests import _make_shop

from .models import Customer


@pytest.fixture
def api():
    user, _, _, _ = _make_shop("customer-b2b@example.com")
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.mark.django_db
def test_siren_is_stored_without_spaces(api) -> None:
    response = api.post(reverse("customer-list"), {
        "name": "Atelier", "customer_type": "business", "siren": "123 456 789",
    }, format="json")
    assert response.status_code == 201, response.data
    assert (response.data["customer_type"], response.data["siren"]) == (
        "business", "123456789",
    )
    assert Customer.objects.get(pk=response.data["id"]).siren == "123456789"


@pytest.mark.django_db
@pytest.mark.parametrize("siren", ["12345678", "1234567890", "12345678A", "١٢٣٤٥٦٧٨٩"])
def test_siren_must_have_nine_digits(api, siren) -> None:
    response = api.post(reverse("customer-list"), {
        "name": f"Atelier {siren}", "customer_type": "business", "siren": siren,
    }, format="json")
    assert response.status_code == 400
    assert "siren" in response.data["errors"]


@pytest.mark.django_db
def test_customer_is_an_individual_by_default(api) -> None:
    response = api.post(reverse("customer-list"), {"name": "Martin"}, format="json")
    assert (response.data["customer_type"], response.data["siren"]) == (
        "individual", "",
    )
