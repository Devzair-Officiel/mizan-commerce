"""Recopie les réglages zakat de la boutique dans le profil de son propriétaire.

Jour J et prix du gramme recopiés tels quels. La méthode du seuil n'est recopiée
que si un prix est renseigné : sans prix, « argent » n'est que la valeur par
défaut du champ, pas un choix. Les champs de Shop restent en place (retirés en Z3).
"""
from django.db import migrations


def copy_shop_settings(apps, schema_editor):
    ShopMember = apps.get_model('shops', 'ShopMember')
    ZakatProfile = apps.get_model('zakat', 'ZakatProfile')

    owners = ShopMember.objects.filter(role='owner').select_related('shop')
    for member in owners:
        shop = member.shop
        if shop.zakat_annual_date is None and shop.nisab_unit_price is None:
            continue  # rien à recopier : profil créé vide à la première lecture
        has_price = shop.nisab_unit_price is not None
        ZakatProfile.objects.get_or_create(
            shop_id=shop.pk,
            user_id=member.user_id,
            defaults={
                'hawl_date': shop.zakat_annual_date,
                'nisab_unit_price': shop.nisab_unit_price,
                'nisab_method': shop.nisab_method if has_price else None,
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ('zakat', '0008_zakatprofile'),
    ]

    operations = [
        migrations.RunPython(copy_shop_settings, migrations.RunPython.noop),
    ]
