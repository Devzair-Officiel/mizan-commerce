import io
import os
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db.models import F, Q
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from unittest import mock

from apps.accounts.models import User
from apps.shops.models import Shop, ShopMember
from apps.products.models import Product, ProductVariant
from apps.stock.models import StockMovement
from apps.orders import services as order_services
from apps.orders.models import Order
from apps.notes.models import Reminder

from apps.customers.models import Customer
from apps.core.services import build_dashboard_today, build_nav_badges


def setup(email: str, shop_timezone: str = "Europe/Paris"):
    user = User.objects.create_user(email=email, password="Pass123!Strong")
    shop = Shop.objects.create(
        name=f"Shop {email}", currency="EUR", timezone=shop_timezone
    )  # noqa: E501
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
        order_services.create_order(self.shop, self.user)
        response = self.client.get(self._url())
        self.assertEqual(response.data["orders_to_prepare"]["count"], 1)

    def test_unpaid_orders_count(self):
        order_services.create_order(self.shop, self.user)
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
        order_services.create_order(shop_b, user_b)
        response = self.client.get(self._url())
        self.assertEqual(response.data["orders_to_prepare"]["count"], 0)

    # ── Timezone ──────────────────────────────────────────────────────────────

    def test_order_at_2330_paris_counts_today(self):
        """Une commande à 23:30 heure de Paris doit compter aujourd'hui."""
        # now = 15 janvier 2025 à 12:00 UTC (= 13:00 Paris)
        now = datetime(2025, 1, 15, 12, 0, tzinfo=ZoneInfo("UTC"))
        # Commande à 22:30 UTC = 23:30 Paris Jan 15 → aujourd'hui ✓
        order = order_services.create_order(self.shop, self.user)
        Order.objects.filter(pk=order.pk).update(
            created_at=datetime(2025, 1, 15, 22, 30, tzinfo=ZoneInfo("UTC")),
        )
        data = build_dashboard_today(self.shop, now=now)
        # to_prepare n'est pas exclu → la commande compte dans orders_count aujourd'hui
        self.assertEqual(data["today"]["orders_count"], 1)
        self.assertEqual(data["orders_to_prepare"]["count"], 1)

    def test_order_at_0030_paris_doesnt_count_today(self):
        """00:30 heure de Paris le lendemain ne compte pas aujourd'hui."""  # noqa: E501
        now = datetime(2025, 1, 15, 12, 0, tzinfo=ZoneInfo("UTC"))
        # 23:30 UTC = 00:30 Paris Jan 16 → demain ✗
        order = order_services.create_order(self.shop, self.user)
        Order.objects.filter(pk=order.pk).update(
            created_at=datetime(2025, 1, 15, 23, 30, tzinfo=ZoneInfo("UTC")),
        )
        data = build_dashboard_today(self.shop, now=now)
        self.assertEqual(data["today"]["orders_count"], 0)

    # ── amount_due & total_due ─────────────────────────────────────────────────

    def test_amount_due_per_order(self):
        """amount_due = total_amount - amount_paid pour chaque commande impayée."""
        order = order_services.create_order(self.shop, self.user)
        Order.objects.filter(pk=order.pk).update(
            total_amount=Decimal("100.00"),
            amount_paid=Decimal("30.00"),
            payment_status="partial",
        )
        data = build_dashboard_today(self.shop)
        item = data["unpaid_orders"]["items"][0]
        self.assertEqual(Decimal(item["amount_due"]), Decimal("70.00"))

    def test_total_due_across_orders(self):
        """total_due = somme de tous les amount_due."""
        for total, paid in [
            (Decimal("100.00"), Decimal("30.00")),
            (Decimal("50.00"), Decimal("0.00")),
        ]:  # noqa: E501
            order = order_services.create_order(self.shop, self.user)
            Order.objects.filter(pk=order.pk).update(
                total_amount=total,
                amount_paid=paid,
                payment_status="partial" if paid > 0 else "unpaid",
            )
        data = build_dashboard_today(self.shop)
        self.assertEqual(Decimal(data["unpaid_orders"]["total_due"]), Decimal("120.00"))

    # ── out_of_stock_count ────────────────────────────────────────────────────

    def test_out_of_stock_count_field(self):
        """out_of_stock_count compte uniquement les variantes à stock ≤ 0."""
        p = Product.objects.create(shop=self.shop, name="Multi")
        # Variante en rupture
        ProductVariant.objects.create(
            shop=self.shop,
            product=p,
            packaging_name="Rupture",
            unit="piece",
            base_quantity=1,
            selling_price=Decimal("10"),
        )
        # Variante sous seuil mais pas en rupture
        v2 = ProductVariant.objects.create(
            shop=self.shop,
            product=p,
            packaging_name="Faible",
            unit="piece",
            base_quantity=1,
            selling_price=Decimal("10"),
            low_stock_threshold=5,
        )
        StockMovement.objects.create(
            shop=self.shop, variant=v2, movement_type="in", quantity=3
        )  # noqa: E501
        data = build_dashboard_today(self.shop)
        self.assertEqual(data["low_stock_products"]["count"], 2)
        self.assertEqual(data["low_stock_products"]["out_of_stock_count"], 1)

    # ── overdue reminders ─────────────────────────────────────────────────────

    def test_overdue_reminder_appears_with_flag(self):
        """Un rappel d'hier en attente doit apparaître avec is_overdue=True."""
        Reminder.objects.create(
            shop=self.shop,
            author=self.user,
            title="En retard",
            due_at=timezone.now() - timedelta(days=1),
        )
        data = build_dashboard_today(self.shop)
        self.assertEqual(data["today_reminders"]["count"], 1)
        self.assertTrue(data["today_reminders"]["items"][0]["is_overdue"])

    def test_overdue_comes_before_today(self):
        """Les rappels en retard apparaissent avant les rappels du jour."""
        Reminder.objects.create(
            shop=self.shop,
            author=self.user,
            title="Aujourd'hui",
            due_at=timezone.now(),
        )
        Reminder.objects.create(
            shop=self.shop,
            author=self.user,
            title="Hier",
            due_at=timezone.now() - timedelta(days=1),
        )
        data = build_dashboard_today(self.shop)
        self.assertEqual(data["today_reminders"]["count"], 2)
        self.assertTrue(data["today_reminders"]["items"][0]["is_overdue"])

    # ── setup block ───────────────────────────────────────────────────────────

    def test_setup_empty_shop(self):
        """Boutique neuve : has_orders=False, counts à 0."""
        data = build_dashboard_today(self.shop)
        self.assertFalse(data["setup"]["has_orders"])
        self.assertEqual(data["setup"]["products_count"], 0)
        self.assertEqual(data["setup"]["customers_count"], 0)

    def test_setup_has_orders(self):
        """has_orders est True dès qu'une commande existe."""
        order_services.create_order(self.shop, self.user)
        data = build_dashboard_today(self.shop)
        self.assertTrue(data["setup"]["has_orders"])

    # ── multitenant (setup) ───────────────────────────────────────────────────

    def test_setup_multitenant_isolation(self):
        """setup ne compte pas les données d'une autre boutique."""
        user_b, shop_b = setup("setup_b@example.com")
        order_services.create_order(shop_b, user_b)
        data = build_dashboard_today(self.shop)
        self.assertFalse(data["setup"]["has_orders"])


class DashboardBadgesTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = setup("badges@example.com")
        self.client.force_authenticate(user=self.user)

    def _url(self):
        return reverse("dashboard-badges")

    def test_empty_badges(self):
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("orders_to_prepare", response.data)
        self.assertNotIn("low_stock", response.data)
        self.assertNotIn("reminders_due", response.data)

    def test_orders_to_prepare_badge(self):
        order_services.create_order(self.shop, self.user)
        response = self.client.get(self._url())
        self.assertEqual(response.data.get("orders_to_prepare"), 1)

    def test_low_stock_badge(self):
        p = Product.objects.create(shop=self.shop, name="Low stock test")
        v = ProductVariant.objects.create(
            shop=self.shop,
            product=p,
            packaging_name="Par défaut",
            unit="piece",
            base_quantity=1,
            selling_price=Decimal("10"),
            low_stock_threshold=5,
        )
        StockMovement.objects.create(
            shop=self.shop, variant=v, movement_type="in", quantity=3
        )  # noqa: E501
        response = self.client.get(self._url())
        self.assertEqual(response.data.get("low_stock"), 1)

    def test_out_of_stock_badge(self):
        p = Product.objects.create(shop=self.shop, name="Rupture test")
        ProductVariant.objects.create(
            shop=self.shop,
            product=p,
            packaging_name="Par défaut",
            unit="piece",
            base_quantity=1,
            selling_price=Decimal("10"),
        )
        response = self.client.get(self._url())
        self.assertEqual(response.data.get("low_stock"), 1)

    def test_reminders_due_badge(self):
        Reminder.objects.create(
            shop=self.shop,
            author=self.user,
            title="Relance",
            due_at=timezone.now() - timedelta(hours=2),
        )
        response = self.client.get(self._url())
        self.assertEqual(response.data.get("reminders_due"), 1)

    def test_multitenant_isolation(self):
        user_b, shop_b = setup("badges_b@example.com")
        order_services.create_order(shop_b, user_b)
        response = self.client.get(self._url())
        self.assertNotIn("orders_to_prepare", response.data)

    def test_unauthenticated(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_service_direct(self):
        from apps.shops.models import ShopMember

        order_services.create_order(self.shop, self.user)
        member = ShopMember.objects.get(shop=self.shop, user=self.user)
        badges = build_nav_badges(self.shop, member)
        self.assertEqual(badges.get("orders_to_prepare"), 1)


class SeedDataTest(TestCase):
    """Vérifie que seed_data --reset produit le jeu de données attendu."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with override_settings(DEBUG=True):
            call_command(
                "seed_data", reset=True,
                stdout=io.StringIO(), stderr=io.StringIO(),
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
            Order.objects.filter(shop=shop, created_at__date=today)
            .exclude(status="cancelled")
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
            .exclude(status="cancelled")
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
            )  # noqa: E501
        )
        self.assertTrue(low.exists())

    def test_fr_shop_is_both_on_site(self):
        """La boutique FR est catalog_kind='both' et fulfillment_mode='on_site'."""
        shop = self._shop("La Boutique de Youssef")
        self.assertEqual(shop.catalog_kind, "both")
        self.assertEqual(shop.fulfillment_mode, "on_site")

    def test_fr_shop_has_no_prepared_order(self):
        """Boutique on_site : aucune commande 'prepared' (statut absent du parcours)."""
        shop = self._shop("La Boutique de Youssef")
        self.assertFalse(Order.objects.filter(shop=shop, status="prepared").exists())

    def test_fr_shop_has_service_product(self):
        """La boutique FR a au moins un produit de type service actif."""
        shop = self._shop("La Boutique de Youssef")
        self.assertTrue(
            Product.objects.filter(shop=shop, type="service", is_active=True).exists()
        )

    def test_fr_shop_is_boutique_plus(self):
        """La boutique FR (employée + page publique) est en formule Boutique+."""
        from apps.subscriptions.models import SubscriptionPlan

        shop = self._shop("La Boutique de Youssef")
        self.assertEqual(shop.effective_plan.code, SubscriptionPlan.CODE_BOUTIQUE_PLUS)

    def test_seeded_shops_have_plan_for_their_features(self):
        """Une boutique de démo n'utilise pas de fonction absente de sa formule."""
        from apps.public_pages.models import PublicPage
        from apps.core.management.commands.seed_data import SEED_DEMO_EMAILS
        from apps.subscriptions.permissions import FEATURE_MIN_PLAN, _tier_index

        def allows(shop, feature):
            return shop.effective_plan.tier >= _tier_index(FEATURE_MIN_PLAN[feature])

        demo_shops = Shop.objects.filter(members__user__email__in=SEED_DEMO_EMAILS)
        for shop in demo_shops.distinct():
            if ShopMember.objects.filter(shop=shop).exclude(role="owner").exists():
                self.assertTrue(allows(shop, "multi_user"), shop.name)
            if PublicPage.objects.filter(shop=shop).exists():
                self.assertTrue(allows(shop, "public_pages"), shop.name)


class SeedDataSecurityTest(TestCase):
    """Garde DEBUG, isolation des boutiques externes, idempotence du --reset."""

    def test_refused_when_debug_false(self):
        """seed_data lève CommandError si DEBUG=False et ALLOW_SEED non défini."""
        with mock.patch.dict(os.environ, {"ALLOW_SEED": ""}):
            with override_settings(DEBUG=False):
                with self.assertRaises(CommandError):
                    call_command(
                        "seed_data",
                        stdout=io.StringIO(), stderr=io.StringIO(),
                    )

    def test_non_demo_shop_survives_reset(self):
        """Une boutique créée hors seed n'est pas touchée par --reset."""
        user = User.objects.create_user(
            email="ext@test.local", password="Pass123!Strong"
        )
        shop = Shop.objects.create(name="Boutique Externe", currency="EUR")
        ShopMember.objects.create(shop=shop, user=user, role="owner")
        with override_settings(DEBUG=True):
            call_command(
                "seed_data", reset=True,
                stdout=io.StringIO(), stderr=io.StringIO(),
            )
        self.assertTrue(Shop.objects.filter(pk=shop.pk).exists())
        self.assertTrue(User.objects.filter(pk=user.pk).exists())

    def test_double_reset_idempotent(self):
        """Deux seed_data --reset successifs ne lèvent pas d'exception."""
        out = io.StringIO()
        with override_settings(DEBUG=True):
            call_command("seed_data", reset=True, stdout=out, stderr=io.StringIO())
            call_command("seed_data", reset=True, stdout=out, stderr=io.StringIO())
        self.assertTrue(Shop.objects.filter(name="La Boutique de Youssef").exists())


def _make_product(shop, name: str, sku: str = "", barcode: str = "", price: Decimal = Decimal("10")) -> Product:  # noqa: E501
    p = Product.objects.create(shop=shop, name=name)
    ProductVariant.objects.create(
        shop=shop, product=p, packaging_name="U",
        unit="piece", base_quantity=1, selling_price=price, sku=sku, barcode=barcode,
    )
    return p


class GlobalSearchTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.shop = setup("search@example.com")
        self.member = ShopMember.objects.get(shop=self.shop, user=self.user)
        self.client.force_authenticate(user=self.user)

    def _url(self, q: str) -> str:
        return reverse("global-search") + f"?q={q}"

    # ── module filtering ──────────────────────────────────────────────────────

    def test_staff_without_customers_sees_no_customers(self):
        """Staff sans module customers ne voit aucun client dans la recherche."""
        Customer.objects.create(shop=self.shop, name="Karima Bensaid")
        staff_user = User.objects.create_user(email="staff_s@example.com", password="Pass123!Strong")  # noqa: E501
        ShopMember.objects.create(
            shop=self.shop, user=staff_user, role="staff", permissions=["orders", "products"],  # noqa: E501
        )
        self.client.force_authenticate(user=staff_user)
        resp = self.client.get(self._url("Karima"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["customers"]["total"], 0)
        self.assertEqual(resp.data["customers"]["items"], [])

    def test_staff_without_orders_sees_no_orders(self):
        """Staff sans module orders ne voit aucune commande."""
        order = order_services.create_order(self.shop, self.user)
        staff_user = User.objects.create_user(email="staff_o@example.com", password="Pass123!Strong")  # noqa: E501
        ShopMember.objects.create(
            shop=self.shop, user=staff_user, role="staff", permissions=["products", "customers"],  # noqa: E501
        )
        self.client.force_authenticate(user=staff_user)
        resp = self.client.get(self._url(order.order_number))
        self.assertEqual(resp.data["orders"]["total"], 0)

    # ── multi-tenant isolation ────────────────────────────────────────────────

    def test_multitenant_isolation(self):
        """La recherche ne renvoie pas de données d'une autre boutique."""
        other_user, other_shop = setup("other_search@example.com")
        Customer.objects.create(shop=other_shop, name="ClientAutreBoutique")
        _make_product(other_shop, "ProduitAutreBoutique")
        resp = self.client.get(self._url("AutreBoutique"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["customers"]["total"], 0)
        self.assertEqual(resp.data["products"]["total"], 0)

    # ── barcode search ────────────────────────────────────────────────────────

    def test_search_by_barcode(self):
        """La recherche fonctionne sur le code-barres d'une variante."""
        _make_product(self.shop, "Produit Code-Barres", barcode="8901234567890")
        resp = self.client.get(self._url("8901234"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["products"]["total"], 1)
        self.assertEqual(resp.data["products"]["items"][0]["name"], "Produit Code-Barres")  # noqa: E501

    def test_search_by_sku(self):
        """La recherche fonctionne sur le SKU d'une variante."""
        _make_product(self.shop, "Produit SKU", sku="SKU-ABC-001")
        resp = self.client.get(self._url("SKU-ABC"))
        self.assertEqual(resp.data["products"]["total"], 1)

    # ── totals ────────────────────────────────────────────────────────────────

    def test_totals_exceed_limit(self):
        """total reflète le nombre total même si items est limité à 5."""
        for i in range(8):
            Customer.objects.create(shop=self.shop, name=f"TestClient {i}")
        resp = self.client.get(self._url("TestClient"))
        self.assertEqual(resp.data["customers"]["total"], 8)
        self.assertEqual(len(resp.data["customers"]["items"]), 5)

    def test_enriched_product_fields(self):
        """La section produits expose min_price, type et is_out_of_stock."""
        _make_product(self.shop, "Café Arabica", price=Decimal("12.50"))
        resp = self.client.get(self._url("Café"))
        item = resp.data["products"]["items"][0]
        self.assertIn("min_price", item)
        self.assertEqual(item["min_price"], "12.50")
        self.assertIn("type", item)
        self.assertIn("is_out_of_stock", item)

    def test_enriched_order_fields(self):
        """La section commandes expose payment_status et created_at."""
        order = order_services.create_order(self.shop, self.user)
        resp = self.client.get(self._url(order.order_number))
        item = resp.data["orders"]["items"][0]
        self.assertIn("payment_status", item)
        self.assertIn("created_at", item)

    def test_short_query_returns_empty(self):
        """Une requête d'1 caractère renvoie des sections vides."""
        resp = self.client.get(self._url("a"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["products"]["total"], 0)
        self.assertEqual(resp.data["customers"]["total"], 0)
        self.assertEqual(resp.data["orders"]["total"], 0)
