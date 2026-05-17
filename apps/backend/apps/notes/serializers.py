from rest_framework import serializers
from .models import Note, Reminder


class NoteSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.full_name', read_only=True)

    class Meta:
        model = Note
        fields = ('id', 'customer', 'order', 'content', 'author', 'author_name', 'created_at', 'updated_at')
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
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = Reminder
        fields = (
            'id', 'title', 'description', 'due_at', 'category', 'category_display',
            'customer', 'order', 'status', 'status_display',
            'author', 'author_name', 'done_at', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'author', 'done_at', 'created_at', 'updated_at')

    def validate(self, data):
        shop = self.context['shop']
        customer = data.get('customer')
        order = data.get('order')
        if customer and customer.shop != shop:
            raise serializers.ValidationError({'customer': 'Client introuvable.'})
        if order and order.shop != shop:
            raise serializers.ValidationError({'order': 'Commande introuvable.'})
        return data
