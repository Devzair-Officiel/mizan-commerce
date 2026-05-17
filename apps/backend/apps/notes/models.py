import uuid
from django.conf import settings
from django.db import models
from apps.shops.models import Shop
from apps.customers.models import Customer
from apps.orders.models import Order


class Note(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='notes')
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='notes'
    )
    customer = models.ForeignKey(
        Customer, on_delete=models.CASCADE,
        null=True, blank=True, related_name='note_set'
    )
    order = models.ForeignKey(
        Order, on_delete=models.CASCADE,
        null=True, blank=True, related_name='note_set'
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'notes'
        ordering = ['-created_at']

    def __str__(self):
        return f'Note {self.pk} ({self.shop})'


class Reminder(models.Model):
    CATEGORY_CHOICES = [
        ('unpaid', 'Impayé'),
        ('customer_followup', 'Relance client'),
        ('zakat', 'Zakat'),
        ('order_prep', 'Préparation commande'),
        ('free', 'Libre'),
    ]
    STATUS_CHOICES = [
        ('pending', 'En attente'),
        ('done', 'Terminé'),
        ('dismissed', 'Ignoré'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='reminders')
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='reminders'
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    due_at = models.DateTimeField()
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='free')
    customer = models.ForeignKey(
        Customer, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='reminder_set'
    )
    order = models.ForeignKey(
        Order, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='reminder_set'
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    done_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'reminders'
        indexes = [models.Index(fields=['shop', 'status', 'due_at'])]
        ordering = ['due_at']

    def __str__(self):
        return f'{self.title} ({self.get_status_display()})'
