from rest_framework import serializers

from apps.customers.models import Customer
from apps.orders.models import Order

from .texts import LANGUAGES


class OrdersExportQuerySerializer(serializers.Serializer):
    """Filtres de la page Commandes, période de création et langue de l'export.

    La recherche et le tri sont appliqués par les filtres DRF de la vue ; la
    recherche est validée ici pour l'en-tête du PDF et du message.
    """

    status = serializers.ChoiceField(choices=Order.STATUS_CHOICES, required=False)
    payment_status = serializers.ChoiceField(
        choices=Order.PAYMENT_STATUS_CHOICES, required=False,
    )
    due = serializers.BooleanField(required=False, default=False)
    customer = serializers.UUIDField(required=False)
    search = serializers.CharField(required=False, allow_blank=True, max_length=100)
    # Langue de l'interface : en-têtes, libellés, dates et montants.
    lang = serializers.ChoiceField(choices=LANGUAGES, required=False)

    def get_fields(self):
        # `from` est un mot réservé : les dates arrivent en `from`/`to`.
        fields = super().get_fields()
        fields['from'] = serializers.DateField(required=False, source='date_from')
        fields['to'] = serializers.DateField(required=False, source='date_to')
        return fields

    def validate_customer(self, value) -> Customer:
        # Client d'une autre boutique : même réponse qu'un identifiant inconnu.
        customer = Customer.objects.filter(pk=value, shop=self.context['shop']).first()
        if customer is None:
            raise serializers.ValidationError('Client introuvable.')
        return customer

    def validate_search(self, value: str) -> str:
        return value.strip()

    def validate(self, attrs: dict) -> dict:
        start, end = attrs.get('date_from'), attrs.get('date_to')
        if start and end and start > end:
            raise serializers.ValidationError({'to': 'La fin précède le début.'})
        return attrs
