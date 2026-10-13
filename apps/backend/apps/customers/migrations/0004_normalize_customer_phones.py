import phonenumbers
from django.db import migrations


def normalize_customer_phones(apps, schema_editor):
    """Passe les numéros existants au format E.164, avec le pays de la boutique.

    Sans effet si on la relance : un numéro déjà en E.164 se réécrit à l'identique.
    Les numéros impossibles à normaliser restent tels quels et sont listés.
    """
    Customer = apps.get_model('customers', 'Customer')
    rows = Customer.objects.exclude(phone='').values_list('id', 'phone', 'shop__country')
    left_as_is: list[str] = []
    for pk, phone, country in rows.iterator():
        try:
            number = phonenumbers.parse(phone, (country or '').upper() or None)
        except phonenumbers.NumberParseException:
            number = None
        if number is None or not phonenumbers.is_valid_number(number):
            left_as_is.append(f'  client {pk} : {phone!r}')
            continue
        e164 = phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)
        if e164 != phone:
            Customer.objects.filter(pk=pk).update(phone=e164)
    if left_as_is:
        print('\nNuméros laissés tels quels (impossibles à normaliser) :')
        print('\n'.join(left_as_is))


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0003_customer_unique_customer_name_per_shop'),
        ('shops', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(normalize_customer_phones, migrations.RunPython.noop),
    ]
