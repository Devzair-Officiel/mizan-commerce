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
        from apps.accounts.factories import UserFactory
        from apps.shops.factories import ShopFactory, ShopMemberFactory
        from apps.products.factories import ProductFactory
        from apps.stock.factories import StockMovementFactory
        from apps.customers.factories import CustomerFactory
        from apps.accounts.models import User
        from apps.shops.models import ShopMember
        from apps.products.models import Product
        from apps.stock.models import StockMovement
        from apps.customers.models import Customer

        if options["reset"]:
            StockMovement.objects.all().delete()
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
            ProductFactory(
                shop=shop_fr,
                name="Chemise en lin blanc",
                reference="CHE-LIN-001",
                purchase_price="12.50",
                selling_price="29.99",
                low_stock_threshold=3,
            ),
            ProductFactory(
                shop=shop_fr,
                name="Pantalon chino beige",
                reference="PAN-CHI-002",
                purchase_price="18.00",
                selling_price="44.99",
                low_stock_threshold=2,
            ),
            ProductFactory(
                shop=shop_fr,
                name="Sandales cuir naturel",
                reference="SAN-CUI-003",
                purchase_price="22.00",
                selling_price="59.90",
                low_stock_threshold=2,
            ),
            ProductFactory(
                shop=shop_fr,
                name="Ceinture tressée marron",
                reference="CEI-TRE-004",
                purchase_price="8.00",
                selling_price="19.99",
                low_stock_threshold=5,
            ),
            ProductFactory(
                shop=shop_fr,
                name="Sac en toile naturelle",
                reference="SAC-TOI-005",
                purchase_price="14.00",
                selling_price="35.00",
                low_stock_threshold=3,
            ),
        ]
        stock_qtys_fr = [15, 8, 6, 20, 2]  # SAC-TOI-005 à 2 < seuil 3 → stock faible
        for product, qty in zip(products_fr, stock_qtys_fr):
            if not product.stock_movements.exists():
                StockMovementFactory(
                    shop=shop_fr, product=product,
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
            ProductFactory(
                shop=shop_ma,
                name="Caftan brodé bleu nuit",
                reference="CAF-BRO-001",
                purchase_price="180.00",
                selling_price="450.00",
                low_stock_threshold=1,
            ),
            ProductFactory(
                shop=shop_ma,
                name="Djellaba femme ivoire",
                reference="DJE-FEM-002",
                purchase_price="90.00",
                selling_price="220.00",
                low_stock_threshold=2,
            ),
            ProductFactory(
                shop=shop_ma,
                name="Babouche artisanale dorée",
                reference="BAB-ART-003",
                purchase_price="40.00",
                selling_price="95.00",
                low_stock_threshold=3,
            ),
        ]
        stock_qtys_ma = [3, 5, 12]
        for product, qty in zip(products_ma, stock_qtys_ma):
            if not product.stock_movements.exists():
                StockMovementFactory(
                    shop=shop_ma, product=product,
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

        self.stdout.write(self.style.SUCCESS("\n=== Seeding terminé ==="))
        self.stdout.write("  youssef@example.com / Mizan1234!")
        self.stdout.write("  amira@example.ma    / Mizan1234!")
        self.stdout.write("  admin@mizan.dev     / Admin1234!")
