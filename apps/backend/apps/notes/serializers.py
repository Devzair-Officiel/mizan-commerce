from rest_framework import serializers

from apps.customers.models import Customer
from apps.orders.models import Order
from apps.shops.models import ShopMember
from .models import Note, Reminder, ReminderSettings
from .services import assignable_members, moment_bounds, moment_of


class NoteSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.full_name', read_only=True)

    class Meta:
        model = Note
        fields = ('id', 'customer', 'order', 'content', 'author', 'author_name', 'created_at', 'updated_at')  # noqa: E501
        read_only_fields = ('id', 'author', 'created_at', 'updated_at')

    def validate(self, data):
        customer = data.get('customer')
        order = data.get('order')
        shop = self.context['shop']
        if customer and customer.shop != shop:
            raise serializers.ValidationError({'customer': 'Client introuvable.'})
        if order and order.shop != shop:
            raise serializers.ValidationError({'order': 'Commande introuvable.'})
        return data


class ReminderCustomerSerializer(serializers.ModelSerializer):
    """Client lié, affiché sur la ligne et utilisé pour la relance WhatsApp."""

    class Meta:
        model = Customer
        fields = ('id', 'display_name', 'phone')
        read_only_fields = fields


class ReminderOrderSerializer(serializers.ModelSerializer):
    """Commande liée : numéro, et reste dû pour une relance."""

    class Meta:
        model = Order
        fields = ('id', 'order_number', 'created_at', 'total_amount', 'amount_paid', 'payment_status')  # noqa: E501
        read_only_fields = fields


class ReminderSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)  # noqa: E501
    # Vide : pour toute l'équipe.
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=ShopMember.objects.all(), allow_null=True, required=False,
    )
    assigned_to_name = serializers.CharField(source='assigned_to.user.full_name', read_only=True)  # noqa: E501
    customer_info = ReminderCustomerSerializer(source='customer', read_only=True)
    order_info = ReminderOrderSerializer(source='order', read_only=True)
    # Groupe de la liste : overdue | today | tomorrow | week | later.
    moment = serializers.SerializerMethodField()

    class Meta:
        model = Reminder
        fields = (
            'id', 'title', 'description', 'due_at', 'category', 'category_display',
            'customer', 'customer_info', 'order', 'order_info', 'status', 'status_display',  # noqa: E501
            'assigned_to', 'assigned_to_name', 'is_automatic', 'moment',
            'author', 'author_name', 'done_at', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'author', 'is_automatic', 'done_at', 'created_at', 'updated_at')  # noqa: E501

    def get_moment(self, reminder: Reminder) -> str:
        # Bornes calculées une fois par réponse, dans le fuseau de la boutique.
        if 'moment_bounds' not in self.context:
            self.context['moment_bounds'] = moment_bounds(self.context['shop'])
        return moment_of(reminder.due_at, self.context['moment_bounds'])

    def validate_assigned_to(self, member: ShopMember | None) -> ShopMember | None:
        # Un membre d'une autre boutique, ou sans accès aux rappels, est refusé
        # avec le même message : rien ne révèle l'existence d'un membre ailleurs.
        if member is not None and not assignable_members(self.context['shop']).filter(pk=member.pk).exists():  # noqa: E501
            raise serializers.ValidationError("Ce membre n'a pas accès aux rappels.")
        return member

    def validate(self, data):
        shop = self.context['shop']
        # En modification partielle, le champ absent garde sa valeur enregistrée.
        customer = data['customer'] if 'customer' in data else getattr(self.instance, 'customer', None)  # noqa: E501
        order = data['order'] if 'order' in data else getattr(self.instance, 'order', None)  # noqa: E501
        if customer and customer.shop != shop:
            raise serializers.ValidationError({'customer': 'Client introuvable.'})
        if order and order.shop != shop:
            raise serializers.ValidationError({'order': 'Commande introuvable.'})
        # La commande liée est celle du client lié : jamais la commande d'un autre.
        if customer and order and order.customer_id not in (None, customer.pk):
            raise serializers.ValidationError({'order': "Cette commande n'est pas celle de ce client."})  # noqa: E501
        return data


class AssigneeSerializer(serializers.ModelSerializer):
    """Membre à qui attribuer un rappel (filtre « Pour », formulaire)."""
    full_name = serializers.CharField(source='user.full_name', read_only=True)
    # Le membre qui consulte : « Moi » dans le filtre et le formulaire.
    is_me = serializers.SerializerMethodField()

    class Meta:
        model = ShopMember
        fields = ('id', 'full_name', 'role', 'is_me')
        read_only_fields = fields

    def get_is_me(self, member: ShopMember) -> bool:
        return member.user_id == self.context['request'].user.pk


class ReminderSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReminderSettings
        fields = (
            'unpaid_followup_enabled', 'unpaid_followup_days',
            'pending_orders_enabled', 'pending_orders_days',
            'daily_summary_enabled', 'daily_summary_hour',
        )
