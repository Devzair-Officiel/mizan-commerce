from django.db import migrations, models


def convert_remaining_drafts(apps, schema_editor):
    Order = apps.get_model('orders', 'Order')
    Order.objects.filter(status='draft').update(status='to_prepare')


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('orders', '0007_remove_draft_status'),
    ]

    operations = [
        migrations.RunPython(convert_remaining_drafts, noop),
        migrations.AddConstraint(
            model_name='order',
            constraint=models.CheckConstraint(
                condition=models.Q(status__in=['to_prepare', 'prepared', 'shipped', 'cancelled']),
                name='orders_status_valid',
            ),
        ),
    ]
