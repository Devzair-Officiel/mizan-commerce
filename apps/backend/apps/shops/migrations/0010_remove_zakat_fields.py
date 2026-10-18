"""Lot Z3 : retrait des réglages zakat de la boutique.

`zakat_annual_date`, `nisab_method` et `nisab_unit_price` sont remplacés par le profil
zakat de chaque personne (`zakat_profiles`), où la migration zakat 0009 les a recopiés.

Retour arrière : les colonnes sont recréées avec leurs valeurs par défaut (NULL,
`silver` pour la méthode) ; aucune donnée n'est restaurée.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('shops', '0009_shop_invoice_auto_color_shop_invoice_bic_and_more'),
        # La copie vers le profil lit ces champs : elle passe avant leur retrait.
        ('zakat', '0009_copy_shop_settings_to_owner_profile'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='shop',
            name='nisab_method',
        ),
        migrations.RemoveField(
            model_name='shop',
            name='nisab_unit_price',
        ),
        migrations.RemoveField(
            model_name='shop',
            name='zakat_annual_date',
        ),
    ]
