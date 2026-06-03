"""
Seed l'environnement de développement avec des données réalistes.
Idempotente : relancer ne crée pas de doublons (django_get_or_create sur les factories).

Usage :
    docker compose exec backend python manage.py seed_data
    docker compose exec backend python manage.py seed_data --reset  # vide d'abord les tables métier
"""

from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = "Seed la base avec des données de développement via factory_boy."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Vide les tables métier avant de seeder (garde les users et boutiques).",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        from decimal import Decimal
        from apps.accounts.factories import UserFactory
        from apps.shops.factories import ShopFactory, ShopMemberFactory
        from apps.stock.factories import StockMovementFactory
        from apps.customers.factories import CustomerFactory
        from apps.accounts.models import User
        from apps.shops.models import ShopMember
        from apps.products.models import Product, ProductVariant
        from apps.stock.models import StockMovement
        from apps.customers.models import Customer

        def seed_product(*, shop, name, packaging_name='Par défaut', unit='piece',
                         selling_price, purchase_price=None, low_stock_threshold=None, sku=''):
            """Crée un Product + sa variante par défaut. Idempotent sur (shop, name)."""
            product, _ = Product.objects.get_or_create(shop=shop, name=name)
            ProductVariant.objects.get_or_create(
                product=product, packaging_name=packaging_name,
                defaults={
                    'shop': shop,
                    'unit': unit,
                    'base_quantity': 1,
                    'selling_price': selling_price,
                    'purchase_price': purchase_price,
                    'low_stock_threshold': low_stock_threshold,
                    'sku': sku,
                    'position': 0,
                    'is_active': True,
                },
            )
            return product

        from apps.orders.models import Order, OrderItem
        from apps.notes.models import Note

        if options["reset"]:
            from apps.products.models import ProductVariant
            OrderItem.objects.all().delete()
            Order.objects.all().delete()
            StockMovement.objects.all().delete()
            ProductVariant.objects.all().delete()
            Product.objects.all().delete()
            Customer.objects.all().delete()
            self.stdout.write(self.style.WARNING("  Tables métier vidées."))

        self.stdout.write(self.style.MIGRATE_HEADING("=== Seeding données de développement ===\n"))

        # ── Superadmin ──────────────────────────────────────────────
        admin, created = User.objects.get_or_create(
            email="admin@mizan.dev",
            defaults={"is_staff": True, "is_superuser": True, "full_name": "Admin Mizan"},
        )
        if created:
            admin.set_password("Admin1234!")
            admin.save()
            self.stdout.write("  ✓ Superadmin : admin@mizan.dev / Admin1234!")
        else:
            self.stdout.write("  · Superadmin existant : admin@mizan.dev")

        # ── Boutique 1 — Youssef (France / EUR) ─────────────────────
        youssef = UserFactory(
            email="youssef@example.com",
            full_name="Youssef Benali",
            phone="+33601020304",
            password="Mizan1234!",
        )
        shop_fr = ShopFactory(name="La Boutique de Youssef", currency="EUR", country="FR")
        ShopMemberFactory(shop=shop_fr, user=youssef, role="owner")
        self.stdout.write(f"  ✓ Boutique FR : {shop_fr.name}")

        products_fr = [
            seed_product(shop=shop_fr, name="Chemise en lin blanc",
                         purchase_price="12.50", selling_price="29.99",
                         low_stock_threshold=3, sku="CHE-LIN-001"),
            seed_product(shop=shop_fr, name="Pantalon chino beige",
                         purchase_price="18.00", selling_price="44.99",
                         low_stock_threshold=2, sku="PAN-CHI-002"),
            seed_product(shop=shop_fr, name="Sandales cuir naturel",
                         purchase_price="22.00", selling_price="59.90",
                         low_stock_threshold=2, sku="SAN-CUI-003"),
            seed_product(shop=shop_fr, name="Ceinture tressée marron",
                         purchase_price="8.00", selling_price="19.99",
                         low_stock_threshold=5, sku="CEI-TRE-004"),
            seed_product(shop=shop_fr, name="Sac en toile naturelle",
                         purchase_price="14.00", selling_price="35.00",
                         low_stock_threshold=3, sku="SAC-TOI-005"),
        ]
        stock_qtys_fr = [15, 8, 6, 20, 2]  # SAC-TOI-005 à 2 < seuil 3 → stock faible
        for product, qty in zip(products_fr, stock_qtys_fr):
            variant = product.variants.first()
            if variant and not variant.stock_movements.exists():
                StockMovementFactory(
                    shop=shop_fr, variant=variant,
                    movement_type="in", quantity=qty,
                    reason="Stock initial — seeding",
                    created_by=youssef,
                )

        customers_fr = [
            ("Karima Bensouda", "+33612345678", "Lyon", "Cliente fidèle depuis 2 ans."),
            ("Hamza Tazi", "+33698765432", "Paris", ""),
            ("Nadia El Fassi", "+33655443322", "Marseille", "Préfère la livraison en point relais."),
        ]
        for name, phone, city, notes in customers_fr:
            CustomerFactory(shop=shop_fr, name=name, phone=phone, city=city, country="FR", notes=notes)

        self.stdout.write(f"    → {len(products_fr)} produits, {len(customers_fr)} clients")

        # Commandes boutique FR
        from apps.orders import services as order_services
        if not Order.objects.filter(shop=shop_fr).exists():
            karima = Customer.objects.get(shop=shop_fr, name='Karima Bensouda')
            o1 = order_services.create_order(shop_fr, youssef, customer=karima, shipping=Decimal('5.00'))
            order_services.add_item(o1, products_fr[0].variants.first(), 2)
            order_services.add_item(o1, products_fr[3].variants.first(), 1)
            order_services.transition_status(o1, 'to_prepare', youssef)
            order_services.update_payment(o1, o1.total_amount)

            o2 = order_services.create_order(shop_fr, youssef)
            order_services.add_item(o2, products_fr[1].variants.first(), 1)
            order_services.add_item(o2, products_fr[2].variants.first(), 1)
            Note.objects.create(shop=shop_fr, order=o2, author=youssef, content='Livraison urgente')

            o3 = order_services.create_order(shop_fr, youssef, customer=karima)
            order_services.add_item(o3, products_fr[4].variants.first(), 3)
            order_services.transition_status(o3, 'to_prepare', youssef)
            order_services.transition_status(o3, 'prepared', youssef)
            order_services.update_payment(o3, Decimal('50.00'))
            self.stdout.write(f"    → 3 commandes créées")

        # ── Boutique 2 — Amira (Maroc / MAD) ────────────────────────
        amira = UserFactory(
            email="amira@example.ma",
            full_name="Amira Chraibi",
            phone="+212661234567",
            password="Mizan1234!",
        )
        shop_ma = ShopFactory(name="Boutique Chraibi — Casablanca", currency="MAD", country="MA")
        ShopMemberFactory(shop=shop_ma, user=amira, role="owner")
        self.stdout.write(f"  ✓ Boutique MA : {shop_ma.name}")

        products_ma = [
            seed_product(shop=shop_ma, name="Caftan brodé bleu nuit",
                         purchase_price="180.00", selling_price="450.00",
                         low_stock_threshold=1, sku="CAF-BRO-001"),
            seed_product(shop=shop_ma, name="Djellaba femme ivoire",
                         purchase_price="90.00", selling_price="220.00",
                         low_stock_threshold=2, sku="DJE-FEM-002"),
            seed_product(shop=shop_ma, name="Babouche artisanale dorée",
                         purchase_price="40.00", selling_price="95.00",
                         low_stock_threshold=3, sku="BAB-ART-003"),
        ]
        stock_qtys_ma = [3, 5, 12]
        for product, qty in zip(products_ma, stock_qtys_ma):
            variant = product.variants.first()
            if variant and not variant.stock_movements.exists():
                StockMovementFactory(
                    shop=shop_ma, variant=variant,
                    movement_type="in", quantity=qty,
                    reason="Stock initial — seeding",
                    created_by=amira,
                )

        customers_ma = [
            ("Zineb Alaoui", "+212662345678", "Rabat", ""),
            ("Sofia Benali", "+212673456789", "Marrakech", "Commande souvent pour des occasions spéciales."),
        ]
        for name, phone, city, notes in customers_ma:
            CustomerFactory(shop=shop_ma, name=name, phone=phone, city=city, country="MA", notes=notes)

        self.stdout.write(f"    → {len(products_ma)} produits, {len(customers_ma)} clients")

        if not Order.objects.filter(shop=shop_ma).exists():
            zineb = Customer.objects.get(shop=shop_ma, name='Zineb Alaoui')
            o4 = order_services.create_order(shop_ma, amira, customer=zineb)
            order_services.add_item(o4, products_ma[0].variants.first(), 1)
            order_services.transition_status(o4, 'to_prepare', amira)
            order_services.update_payment(o4, Decimal('200.00'))
            self.stdout.write(f"    → 1 commande créée")

        self.stdout.write(self.style.SUCCESS("\n=== Seeding terminé ==="))
        self.stdout.write("  youssef@example.com / Mizan1234!")
        self.stdout.write("  amira@example.ma    / Mizan1234!")
        self.stdout.write("  admin@mizan.dev     / Admin1234!")
