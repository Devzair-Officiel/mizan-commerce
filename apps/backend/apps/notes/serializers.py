from rest_framework import serializers

from apps.shops.models import ShopMember
from .models import Note, Reminder, ReminderSettings
from .services import assignable_members


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


class ReminderSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)  # noqa: E501
    # Vide : pour toute l'équipe.
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=ShopMember.objects.all(), allow_null=True, required=False,
    )
    assigned_to_name = serializers.CharField(source='assigned_to.user.full_name', read_only=True)  # noqa: E501

    class Meta:
        model = Reminder
        fields = (
            'id', 'title', 'description', 'due_at', 'category', 'category_display',
            'customer', 'order', 'status', 'status_display',
            'assigned_to', 'assigned_to_name', 'is_automatic',
            'author', 'author_name', 'done_at', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'author', 'is_automatic', 'done_at', 'created_at', 'updated_at')  # noqa: E501

    def validate_assigned_to(self, member: ShopMember | None) -> ShopMember | None:
        # Un membre d'une autre boutique, ou sans accès aux rappels, est refusé
        # avec le même message : rien ne révèle l'existence d'un membre ailleurs.
        if member is not None and not assignable_members(self.context['shop']).filter(pk=member.pk).exists():  # noqa: E501
            raise serializers.ValidationError("Ce membre n'a pas accès aux rappels.")
        return member

    def validate(self, data):
        shop = self.context['shop']
        customer = data.get('customer')
        order = data.get('order')
        if customer and customer.shop != shop:
            raise serializers.ValidationError({'customer': 'Client introuvable.'})
        if order and order.shop != shop:
            raise serializers.ValidationError({'order': 'Commande introuvable.'})
        return data


class AssigneeSerializer(serializers.ModelSerializer):
    """Membre à qui attribuer un rappel (filtre « Pour », formulaire)."""
    full_name = serializers.CharField(source='user.full_name', read_only=True)

    class Meta:
        model = ShopMember
        fields = ('id', 'full_name', 'role')
        read_only_fields = fields


class ReminderSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReminderSettings
        fields = (
            'unpaid_followup_enabled', 'unpaid_followup_days',
            'pending_orders_enabled', 'pending_orders_days',
            'daily_summary_enabled', 'daily_summary_hour',
        )
