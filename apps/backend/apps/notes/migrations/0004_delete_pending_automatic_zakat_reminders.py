"""Lot Z3 : suppression des rappels zakat automatiques encore en attente.

Depuis le lot Z2b, le rappel du jour J part par e-mail à la seule personne concernée ;
la tâche ne crée plus de rappel. Ceux qu'elle avait créés restaient visibles par toute
l'équipe. Les rappels terminés ou ignorés, et ceux créés à la main, sont conservés.

Retour arrière sans effet : les rappels supprimés ne sont pas restaurés.
"""
from django.db import migrations


def delete_pending_automatic_zakat_reminders(apps, schema_editor):
    Reminder = apps.get_model('notes', 'Reminder')
    Reminder.objects.filter(category='zakat', is_automatic=True, status='pending').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('notes', '0003_reminder_assignment_automatic'),
    ]

    operations = [
        migrations.RunPython(delete_pending_automatic_zakat_reminders, migrations.RunPython.noop),  # noqa: E501
    ]
