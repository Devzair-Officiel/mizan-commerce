"""
Seed l'environnement de développement avec des données réalistes.
Idempotente : relancer ne crée pas de doublons (get_or_create sur les factories).

Usage :
    docker compose exec backend python manage.py seed_data
    docker compose exec backend python manage.py seed_data --reset
"""  # noqa: E501

from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = "Seed la base avec des données de développement via factory_boy."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Vide les tables métier avant de seeder (garde les users et boutiques).",  # noqa: E501
        )

    @transaction.atomic
    def handle(self, *args, **options):
        from datetime import timedelta
        from decimal import Decimal
        from django.utils import timezone
        from apps.accounts.factories import UserFactory
        from apps.shops.factories import ShopFactory, ShopMemberFactory
        from apps.stock.factories import StockMovementFactory
        from apps.customers.factories import CustomerFactory
        from apps.accounts.models import User
        from apps.products.models import Product, ProductVariant
        from apps.stock.models import StockMovement
        from apps.customers.models import Customer
        from apps.subscriptions.models import Subscription, SubscriptionPlan
        from .seed_fr import run_seed_fr

        def seed_subscription(*, shop, plan_code, status, period_end=None):
            """Pose un abonnement déterministe sur la boutique. Idempotent."""
            plan = SubscriptionPlan.objects.get(code=plan_code)
            now = timezone.now()
            Subscription.objects.update_or_create(
                shop=shop,
                defaults={
                    "plan": plan,
                    "status": status,
                    "current_period_start": now,
                    "current_period_end": period_end,
                },
            )

        from apps.orders.models import Order, OrderItem
        from apps.notes.models import Note, Reminder
        from apps.ocr.models import OcrResult, UploadedDocument
        from apps.comms.models import PreparedMessage
        from apps.public_pages.models import (
            ContactButton,
            PublicCatalogVisibility,
            PublicPage,
            PublicPageSection,
        )

        if options["reset"]:
            from apps.loyalty.models import (
                LoyaltyCard,
                LoyaltyProgram,
                LoyaltyTransaction,
            )

            LoyaltyTransaction.objects.all().delete()
            LoyaltyCard.objects.all().delete()
            LoyaltyProgram.objects.all().delete()
            ContactButton.objects.all().delete()
            PublicCatalogVisibility.objects.all().delete()
            PublicPageSection.objects.all().delete()
            PublicPage.objects.all().delete()
            PreparedMessage.objects.all().delete()
            OcrResult.objects.all().delete()
            UploadedDocument.objects.all().delete()
            Reminder.objects.all().delete()
            Note.objects.all().delete()
            OrderItem.objects.all().delete()
            Order.objects.all().delete()
            StockMovement.objects.all().delete()
            ProductVariant.objects.all().delete()
            Product.objects.all().delete()
            Customer.objects.all().delete()
            self.stdout.write(self.style.WARNING("  Tables métier vidées."))

        self.stdout.write(
            self.style.MIGRATE_HEADING("=== Seeding données de développement ===\n")
        )

        # ── Superadmin ──────────────────────────────────────────────
        admin, created = User.objects.get_or_create(
            email="admin@mizan.dev",
            defaults={
                "is_staff": True,
                "is_superuser": True,
                "full_name": "Admin Mizan",
            },
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
        shop_fr = ShopFactory(
            name="La Boutique de Youssef", currency="EUR", country="FR"
        )
        ShopMemberFactory(shop=shop_fr, user=youssef, role="owner")
        seed_subscription(
            shop=shop_fr,
            plan_code=SubscriptionPlan.CODE_PRO,
            status=Subscription.STATUS_ACTIVE,
        )
        if youssef.trial_consumed_at is None:
            youssef.trial_consumed_at = timezone.now()
            youssef.save(update_fields=["trial_consumed_at", "updated_at"])
        self.stdout.write(f"  ✓ Boutique FR : {shop_fr.name} (plan Pro)")

        sara = UserFactory(
            email="sara@example.com",
            full_name="Sara Naji",
            phone="+33611223344",
            password="Mizan1234!",
        )
        ShopMemberFactory(
            shop=shop_fr,
            user=sara,
            role="staff",
            permissions=["products", "orders", "customers", "stock"],
        )
        self.stdout.write(f"    + Staff : {sara.email} (4 modules)")

        run_seed_fr(shop_fr, youssef, sara, stdout=self.stdout)

        # ── Messages WhatsApp boutique FR ────────────────────────────
        if not PreparedMessage.objects.filter(shop=shop_fr).exists():
            karima = Customer.objects.get(shop=shop_fr, name="Karima Bensouda")
            hamza = Customer.objects.get(shop=shop_fr, name="Hamza Tazi")
            PreparedMessage.objects.create(
                shop=shop_fr,
                customer=karima,
                template_type=PreparedMessage.TemplateType.ORDER_CONFIRMATION,
                context_type=PreparedMessage.ContextType.CUSTOMER,
                context_id=karima.id,
                recipient_name=karima.name,
                recipient_phone=karima.phone,
                message=(
                    f"Bonjour {karima.name},\n\n"
                    "Votre commande a bien été enregistrée. "
                    "Nous vous tiendrons informée dès qu'elle sera prête.\n\n"
                    "Merci pour votre confiance,\nLa Boutique de Youssef"
                ),
                status=PreparedMessage.Status.SENT_MANUALLY,
            )
            PreparedMessage.objects.create(
                shop=shop_fr,
                customer=hamza,
                template_type=PreparedMessage.TemplateType.FREE,
                context_type=PreparedMessage.ContextType.NONE,
                recipient_name=hamza.name,
                recipient_phone=hamza.phone,
                message=(
                    f"Bonjour {hamza.name}, nous venons de recevoir une nouvelle collection "  # noqa: E501
                    "qui pourrait vous plaire. Passez quand vous voulez !"
                ),
                status=PreparedMessage.Status.PREPARED,
            )
            self.stdout.write("    → 2 messages WhatsApp préparés")

        # ── Boutique 2 — Amira (Maroc / MAD) ────────────────────────
        amira = UserFactory(
            email="amira@example.ma",
            full_name="Amira Chraibi",
            phone="+212661234567",
            password="Mizan1234!",
        )
        shop_ma = ShopFactory(
            name="Boutique Chraibi — Casablanca", currency="MAD", country="MA"
        )
        ShopMemberFactory(shop=shop_ma, user=amira, role="owner")
        seed_subscription(
            shop=shop_ma,
            plan_code=SubscriptionPlan.CODE_BOUTIQUE_PLUS,
            status=Subscription.STATUS_TRIALING,
            period_end=timezone.now() + timedelta(days=14),
        )
        if amira.trial_consumed_at is None:
            amira.trial_consumed_at = timezone.now()
            amira.save(update_fields=["trial_consumed_at", "updated_at"])
        self.stdout.write(f"  ✓ Boutique MA : {shop_ma.name} (essai Boutique+ 14j)")

        def seed_product_ma(
            *, name, selling_price, purchase_price, low_stock_threshold, sku
        ):
            product, _ = Product.objects.get_or_create(shop=shop_ma, name=name)
            ProductVariant.objects.get_or_create(
                product=product,
                packaging_name="Par défaut",
                defaults={
                    "shop": shop_ma,
                    "unit": "piece",
                    "base_quantity": 1,
                    "selling_price": Decimal(str(selling_price)),
                    "purchase_price": Decimal(str(purchase_price)),
                    "low_stock_threshold": Decimal(str(low_stock_threshold)),
                    "sku": sku,
                    "position": 0,
                    "is_active": True,
                },
            )
            return product

        products_ma = [
            seed_product_ma(
                name="Caftan brodé bleu nuit",
                selling_price="450.00",
                purchase_price="180.00",
                low_stock_threshold=1,
                sku="CAF-BRO-001",
            ),
            seed_product_ma(
                name="Djellaba femme ivoire",
                selling_price="220.00",
                purchase_price="90.00",
                low_stock_threshold=2,
                sku="DJE-FEM-002",
            ),
            seed_product_ma(
                name="Babouche artisanale dorée",
                selling_price="95.00",
                purchase_price="40.00",
                low_stock_threshold=3,
                sku="BAB-ART-003",
            ),
        ]
        stock_qtys_ma = [3, 5, 12]
        for product, qty in zip(products_ma, stock_qtys_ma):
            variant = product.variants.first()
            if variant and not variant.stock_movements.exists():
                StockMovementFactory(
                    shop=shop_ma,
                    variant=variant,
                    movement_type="in",
                    quantity=qty,
                    reason="Stock initial — seeding",
                    created_by=amira,
                )

        customers_ma = [
            ("Zineb Alaoui", "+212662345678", "Rabat", ""),
            (
                "Sofia Benali",
                "+212673456789",
                "Marrakech",
                "Commande souvent pour des occasions spéciales.",
            ),
        ]
        for name, phone, city, notes in customers_ma:
            CustomerFactory(
                shop=shop_ma,
                name=name,
                phone=phone,
                city=city,
                country="MA",
                notes=notes,
            )
        self.stdout.write(
            f"    → {len(products_ma)} produits, {len(customers_ma)} clients"
        )

        from apps.orders import services as order_services

        if not Order.objects.filter(shop=shop_ma).exists():
            zineb = Customer.objects.get(shop=shop_ma, name="Zineb Alaoui")
            o4 = order_services.create_order(shop_ma, amira, customer=zineb)
            order_services.add_item(o4, products_ma[0].variants.first(), 1)
            order_services.transition_status(o4, "to_prepare", amira)
            order_services.update_payment(o4, Decimal("200.00"))
            self.stdout.write("    → 1 commande créée")

        if not PreparedMessage.objects.filter(shop=shop_ma).exists():
            sofia = Customer.objects.get(shop=shop_ma, name="Sofia Benali")
            PreparedMessage.objects.create(
                shop=shop_ma,
                customer=sofia,
                template_type=PreparedMessage.TemplateType.UNPAID_FOLLOWUP,
                context_type=PreparedMessage.ContextType.CUSTOMER,
                context_id=sofia.id,
                recipient_name=sofia.name,
                recipient_phone=sofia.phone,
                message=(
                    f"Bonjour {sofia.name}, un petit rappel concernant le solde restant "  # noqa: E501
                    "sur votre dernière commande. Merci de nous tenir informés."
                ),
                status=PreparedMessage.Status.PREPARED,
            )
            self.stdout.write("    → 1 message WhatsApp préparé")

        # ── Boutique 3 — Vide (démo état initial) ───────────────────
        vide = UserFactory(
            email="vide@example.com",
            full_name="Boutique Neuve",
            password="Mizan1234!",
        )
        shop_vide = ShopFactory(name="Boutique Neuve", currency="EUR", country="FR")
        ShopMemberFactory(shop=shop_vide, user=vide, role="owner")
        seed_subscription(
            shop=shop_vide,
            plan_code=SubscriptionPlan.CODE_BOUTIQUE_PLUS,
            status=Subscription.STATUS_TRIALING,
            period_end=timezone.now() + timedelta(days=14),
        )
        if vide.trial_consumed_at is None:
            vide.trial_consumed_at = timezone.now()
            vide.save(update_fields=["trial_consumed_at", "updated_at"])
        # Onboarding terminé → atterrit sur l'accueil vide (pas le wizard)
        if shop_vide.onboarding_completed_at is None:
            shop_vide.onboarding_completed_at = timezone.now()
            shop_vide.save(update_fields=["onboarding_completed_at", "updated_at"])
        # Email non vérifié : email_verified_at reste None → bandeau de confirmation
        self.stdout.write(
            f"  ✓ Boutique VIDE : {shop_vide.name} (essai Boutique+ 14j, email non vérifié)"  # noqa: E501
        )

        # ── Pages publiques ─────────────────────────────────────────
        page_fr, fr_created = PublicPage.objects.get_or_create(
            shop=shop_fr,
            defaults={
                "slug": "boutique-youssef",
                "is_active": True,
                "is_published": True,
                "display_name": shop_fr.name,
                "tagline": "Mode artisanale, élégance simple.",
                "description": (
                    "Bienvenue dans la boutique de Youssef. Chemises en lin, "
                    "pantalons chino, accessoires en cuir : des pièces choisies "
                    "pour durer et bien tomber."
                ),
                "theme": PublicPage.THEME_CLASSIC,
                "primary_color": "#0ea5e9",
            },
        )
        if fr_created:
            sections_fr = [
                (PublicPageSection.Type.HEADER, 0, ""),
                (PublicPageSection.Type.DESCRIPTION, 1, ""),
                (PublicPageSection.Type.PRODUCTS, 2, ""),
                (PublicPageSection.Type.SERVICES, 3, ""),
                (PublicPageSection.Type.CONTACT, 4, ""),
            ]
            for section_type, position, content in sections_fr:
                PublicPageSection.objects.create(
                    page=page_fr,
                    type=section_type,
                    position=position,
                    content=content,
                )
            products_fr_first4 = list(
                Product.objects.filter(shop=shop_fr).order_by("created_at")[:4]
            )
            for position, product in enumerate(products_fr_first4):
                PublicCatalogVisibility.objects.create(
                    page=page_fr,
                    product=product,
                    position=position,
                    badge_new=(position == 0),
                )
            ContactButton.objects.create(
                page=page_fr,
                type=ContactButton.Type.WHATSAPP,
                value=youssef.phone,
                is_primary=True,
                position=0,
            )
            ContactButton.objects.create(
                page=page_fr,
                type=ContactButton.Type.PHONE,
                value=youssef.phone,
                position=1,
            )
            self.stdout.write(f"  ✓ Page publique : /boutique/{page_fr.slug}")

        page_ma, ma_created = PublicPage.objects.get_or_create(
            shop=shop_ma,
            defaults={
                "slug": "boutique-chraibi",
                "is_active": True,
                "is_published": False,
                "display_name": shop_ma.name,
                "tagline": "L'élégance marocaine, brodée main.",
                "theme": PublicPage.THEME_MODERN,
                "primary_color": "#b45309",
            },
        )
        if ma_created:
            PublicPageSection.objects.create(
                page=page_ma,
                type=PublicPageSection.Type.HEADER,
                position=0,
            )
            self.stdout.write(
                f"  ✓ Page publique (brouillon) : /boutique/{page_ma.slug}"
            )

        # ── OCR ─────────────────────────────────────────────────────
        if not UploadedDocument.objects.filter(shop=shop_fr).exists():
            demo_doc = UploadedDocument.objects.create(
                shop=shop_fr,
                uploaded_by_user=youssef,
                document_type=UploadedDocument.DOCUMENT_TYPE_SUPPLIER_INVOICE,
                object_key=f"ocr/{shop_fr.pk}/supplier-invoices/seed-demo.jpg",
                original_filename="facture-fournisseur-demo.jpg",
                mime_type="image/jpeg",
                size_bytes=245_678,
            )
            OcrResult.objects.create(
                shop=shop_fr,
                uploaded_document=demo_doc,
                status=OcrResult.STATUS_PENDING,
            )
            self.stdout.write("    → 1 document OCR (pending)")

        # ── Loyalty ─────────────────────────────────────────────────
        from apps.loyalty.factories import LoyaltyProgramFactory
        from apps.loyalty import services as loyalty_services

        LoyaltyProgramFactory(
            shop=shop_fr, is_active=True, points_per_unit=1, redemption_threshold=100
        )
        LoyaltyProgramFactory(
            shop=shop_ma, is_active=True, points_per_unit=2, redemption_threshold=150
        )

        karima = Customer.objects.get(shop=shop_fr, name="Karima Bensouda")
        card_karima = loyalty_services.get_or_create_card(shop_fr, karima)
        if card_karima.total_points_earned == 0:
            loyalty_services.earn_points(
                card_karima, 80, created_by=youssef, note="Achat chemise et ceinture"
            )
            loyalty_services.earn_points(
                card_karima, 35, created_by=youssef, note="Achat sac × 3"
            )

        zineb = Customer.objects.get(shop=shop_ma, name="Zineb Alaoui")
        card_zineb = loyalty_services.get_or_create_card(shop_ma, zineb)
        if card_zineb.total_points_earned == 0:
            loyalty_services.earn_points(
                card_zineb, 100, created_by=amira, note="Achat caftan brodé"
            )

        self.stdout.write(
            "  ✓ Loyalty : 2 programmes, 2 cartes (Karima 115pts, Zineb 100pts)"
        )

        # ── Récapitulatif ────────────────────────────────────────────
        from apps.orders.models import Order as Ord

        fr_orders = Ord.objects.filter(shop=shop_fr)
        fr_status = {
            s: fr_orders.filter(status=s).count()
            for s in ("draft", "to_prepare", "prepared", "shipped", "cancelled")
        }
        fr_unpaid = (
            fr_orders.filter(payment_status__in=("unpaid", "partial"))
            .exclude(status__in=("draft", "cancelled"))
            .count()
        )

        self.stdout.write(self.style.SUCCESS("\n=== Seeding terminé ==="))
        self.stdout.write("  Comptes :")
        self.stdout.write("    youssef@example.com / Mizan1234!  (Pro actif)")
        self.stdout.write("    sara@example.com    / Mizan1234!  (Staff FR)")
        self.stdout.write("    amira@example.ma    / Mizan1234!  (essai Boutique+ MA)")
        self.stdout.write(
            "    vide@example.com    / Mizan1234!  (essai Boutique+, accueil vide)"
        )
        self.stdout.write("    admin@mizan.dev     / Admin1234!  (superadmin)")
        self.stdout.write(f"  Boutique FR — commandes : {fr_status}")
        self.stdout.write(f"  Boutique FR — impayées/partielles actives : {fr_unpaid}")
