from django.core.management.base import BaseCommand

from apps.accounts.factories import UserFactory
from apps.accounts.models import User
from apps.shops.factories import ShopFactory, ShopMemberFactory
from apps.shops.models import Shop


SEED_DATA = [
    {
        "user": {
            "email": "karim.benali@example.com",
            "full_name": "Karim Benali",
            "phone": "06 12 34 56 78",
        },
        "shop": {
            "name": "Épicerie Benali",
            "currency": "EUR",
            "country": "FR",
        },
        "role": "owner",
    },
    {
        "user": {
            "email": "fatima.ouardi@example.com",
            "full_name": "Fatima Ouardi",
            "phone": "06 98 76 54 32",
        },
        "shop": {
            "name": "Boutique Ouardi Mode",
            "currency": "EUR",
            "country": "FR",
        },
        "role": "owner",
    },
    {
        "user": {
            "email": "youssef.el-amrani@example.com",
            "full_name": "Youssef El Amrani",
            "phone": "07 23 45 67 89",
        },
        "shop": {
            "name": "El Amrani Électronique",
            "currency": "EUR",
            "country": "FR",
        },
        "role": "owner",
    },
]

# Employé rattaché à la première boutique
STAFF_SEED = {
    "email": "sara.naji@example.com",
    "full_name": "Sara Naji",
    "phone": "06 55 44 33 22",
}


class Command(BaseCommand):
    help = "Insère des données fictives pour le développement local."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--flush",
            action="store_true",
            help="Supprime tous les utilisateurs et boutiques avant d'insérer.",
        )

    def handle(self, *args, **options) -> None:
        if options["flush"]:
            Shop.objects.all().delete()
            User.objects.filter(is_superuser=False).delete()
            self.stdout.write(self.style.WARNING("BDD vidée."))

        created_shops = []

        for entry in SEED_DATA:
            user = UserFactory(password="SeedPass123!", **entry["user"])
            shop = ShopFactory(**entry["shop"])
            ShopMemberFactory(shop=shop, user=user, role=entry["role"])
            created_shops.append(shop)
            self.stdout.write(
                self.style.SUCCESS(f"✓ {entry['user']['full_name']} → {shop.name}")
            )

        # Employé de la première boutique (accès produits + commandes + clients)
        staff_user = UserFactory(password="SeedPass123!", **STAFF_SEED)
        ShopMemberFactory(
            shop=created_shops[0],
            user=staff_user,
            role="staff",
            permissions=["products", "orders", "customers", "stock"],
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"✓ {STAFF_SEED['full_name']} (staff) → {created_shops[0].name}"
            )
        )

        self.stdout.write(self.style.SUCCESS("\nSeed terminé. Mot de passe : SeedPass123!"))
