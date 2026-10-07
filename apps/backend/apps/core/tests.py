from decimal import Decimal
from django.core.management import call_command
from django.db.models import F, Q
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from datetime import timedelta
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.shops.models import Shop, ShopMember
from apps.products.models import Product, ProductVariant
from apps.stock.models import StockMovement
from apps.orders import services as order_services
from apps.orders.models import Order
from apps.notes.models import Reminder


def setup(email: str):
    user = User.objects.create_user(email=email, password="Pass123!Strong")
    shop = Shop.objects.create(name=f"Shop {email}", currency="EUR")
    ShopMember.objects.create(shop=shop, user=user, role="owner")
    return user, shop


class DashboardTodayTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = setup("dashboard@example.com")
        self.client.force_authenticate(user=self.user)

    def _url(self):
        return reverse("dashboard-today")

    def test_empty_dashboard(self):
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["orders_to_prepare"]["count"], 0)
        self.assertEqual(response.data["unpaid_orders"]["count"], 0)
        self.assertEqual(response.data["low_stock_products"]["count"], 0)
        self.assertEqual(response.data["today_reminders"]["count"], 0)

    def test_orders_to_prepare_count(self):
        order = order_services.create_order(self.shop, self.user)
        order_services.transition_status(order, "to_prepare", self.user)
        response = self.client.get(self._url())
        self.assertEqual(response.data["orders_to_prepare"]["count"], 1)

    def test_unpaid_orders_count(self):
        order = order_services.create_order(self.shop, self.user)
        order_services.transition_status(order, "to_prepare", self.user)
        response = self.client.get(self._url())
        self.assertEqual(response.data["unpaid_orders"]["count"], 1)

    def test_low_stock_products_count(self):
        p = Product.objects.create(shop=self.shop, name="P")
        v = ProductVariant.objects.create(
            shop=self.shop,
            product=p,
            packaging_name="Par défaut",
            unit="piece",
            base_quantity=1,
            selling_price=Decimal("10"),
            purchase_price=Decimal("5"),
            low_stock_threshold=5,
        )
        StockMovement.objects.create(
            shop=self.shop, variant=v, movement_type="in", quantity=3
        )  # noqa: E501
        response = self.client.get(self._url())
        self.assertEqual(response.data["low_stock_products"]["count"], 1)

    def test_out_of_stock_included(self):
        p = Product.objects.create(shop=self.shop, name="Rupture")
        ProductVariant.objects.create(
            shop=self.shop,
            product=p,
            packaging_name="Par défaut",
            unit="piece",
            base_quantity=1,
            selling_price=Decimal("10"),
        )
        response = self.client.get(self._url())
        self.assertEqual(response.data["low_stock_products"]["count"], 1)

    def test_today_reminders_count(self):
        Reminder.objects.create(
            shop=self.shop,
            author=self.user,
            title="Relance",
            due_at=timezone.now(),
        )
        Reminder.objects.create(
            shop=self.shop,
            author=self.user,
            title="Demain",
            due_at=timezone.now() + timedelta(days=1),
        )
        response = self.client.get(self._url())
        self.assertEqual(response.data["today_reminders"]["count"], 1)

    def test_multitenant_isolation(self):
        user_b, shop_b = setup("b@example.com")
        order_b = order_services.create_order(shop_b, user_b)
        order_services.transition_status(order_b, "to_prepare", user_b)
        response = self.client.get(self._url())
        self.assertEqual(response.data["orders_to_prepare"]["count"], 0)


class SeedDataTest(TestCase):
    """Vérifie que seed_data --reset produit le jeu de données attendu."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        import io

        call_command(
            "seed_data", reset=True, stdout=io.StringIO(), stderr=io.StringIO()
        )

    def _shop(self, name):
        return Shop.objects.get(name=name)

    def test_empty_shop_has_no_products(self):
        shop = self._shop("Boutique Neuve")
        self.assertEqual(Product.objects.filter(shop=shop).count(), 0)

    def test_empty_shop_has_no_customers(self):
        from apps.customers.models import Customer

        shop = self._shop("Boutique Neuve")
        self.assertEqual(Customer.objects.filter(shop=shop).count(), 0)

    def test_empty_shop_has_no_orders(self):
        shop = self._shop("Boutique Neuve")
        self.assertEqual(Order.objects.filter(shop=shop).count(), 0)

    def test_fr_shop_has_order_today_not_cancelled(self):
        shop = self._shop("La Boutique de Youssef")
        today = timezone.now().date()
        count = (
            Order.objects.filter(
                shop=shop,
                created_at__date=today,
            )
            .exclude(status__in=("draft", "cancelled"))
            .count()
        )
        self.assertGreater(count, 0)

    def test_fr_shop_has_to_prepare_order(self):
        shop = self._shop("La Boutique de Youssef")
        self.assertTrue(Order.objects.filter(shop=shop, status="to_prepare").exists())

    def test_fr_shop_has_unpaid_order_with_customer(self):
        shop = self._shop("La Boutique de Youssef")
        exists = (
            Order.objects.filter(
                shop=shop,
                payment_status__in=("unpaid", "partial"),
                customer__isnull=False,
            )
            .exclude(status__in=("draft", "cancelled"))
            .exists()
        )
        self.assertTrue(exists)

    def test_fr_shop_has_order_without_customer(self):
        shop = self._shop("La Boutique de Youssef")
        self.assertTrue(Order.objects.filter(shop=shop, customer__isnull=True).exists())

    def test_fr_shop_has_variant_below_threshold(self):
        shop = self._shop("La Boutique de Youssef")
        low = ProductVariant.objects.filter(
            shop=shop,
            is_active=True,
            product__is_active=True,
        ).filter(
            Q(stock_quantity__lte=0)
            | Q(
                low_stock_threshold__isnull=False,
                stock_quantity__lte=F("low_stock_threshold"),
            )
        )
        self.assertTrue(low.exists())
