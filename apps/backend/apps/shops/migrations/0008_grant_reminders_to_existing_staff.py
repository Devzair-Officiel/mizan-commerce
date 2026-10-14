"""Les employés créés avant le module « reminders » voyaient les rappels sans permission
explicite : on leur ajoute le module pour qu'ils gardent cet accès. Sans effet si on la relance."""

from django.db import migrations

MODULE = 'reminders'


def grant_reminders(apps, schema_editor) -> None:
    ShopMember = apps.get_model('shops', 'ShopMember')
    for member in ShopMember.objects.filter(role='staff').only('id', 'permissions'):
        permissions = list(member.permissions or [])
        if MODULE not in permissions:
            member.permissions = [*permissions, MODULE]
            member.save(update_fields=['permissions'])


class Migration(migrations.Migration):

    dependencies = [
        ('shops', '0007_remove_dashboard_mode_add_fulfillment_mode'),
    ]

    operations = [
        migrations.RunPython(grant_reminders, migrations.RunPython.noop),
    ]
