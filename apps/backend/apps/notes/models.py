import uuid
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from apps.shops.models import Shop, ShopMember
from apps.customers.models import Customer
from apps.orders.models import Order


class Note(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='notes')
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='notes'
    )
    # Historique protégé (RESTRICT) : une note n'a de sens qu'avec son client
    # ou sa commande.
    customer = models.ForeignKey(
        Customer, on_delete=models.RESTRICT,
        null=True, blank=True, related_name='note_set'
    )
    order = models.ForeignKey(
        Order, on_delete=models.RESTRICT,
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
    # Vide : pour toute l'équipe. Un membre retiré de l'équipe rend ses rappels
    # à toute l'équipe plutôt que de les perdre.
    assigned_to = models.ForeignKey(
        ShopMember, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='assigned_reminders'
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    done_at = models.DateTimeField(null=True, blank=True)
    # Créé par la tâche horaire (relance d'un impayé, commandes en attente, zakat).
    is_automatic = models.BooleanField(default=False)
    # Clé d'un rappel automatique (`unpaid:<commande>`, `pending_orders:<jour>`),
    # unique par boutique. Un rappel automatique supprimé passe en `dismissed` :
    # sa clé reste, il n'est jamais recréé.
    auto_key = models.CharField(max_length=80, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'reminders'
        indexes = [models.Index(fields=['shop', 'status', 'due_at'])]
        ordering = ['due_at']
        constraints = [
            models.UniqueConstraint(
                fields=['shop', 'auto_key'],
                condition=~models.Q(auto_key=''),
                name='reminders_unique_auto_key',
            ),
        ]

    def __str__(self):
        return f'{self.title} ({self.get_status_display()})'


class ReminderSettings(models.Model):
    """Rappels automatiques d'une boutique (URS-055 à 057). Créés à la première
    lecture avec les valeurs par défaut ; modifiables par le propriétaire et les
    administrateurs."""

    shop = models.OneToOneField(
        Shop, on_delete=models.CASCADE, primary_key=True,
        related_name='reminder_settings',
    )
    unpaid_followup_enabled = models.BooleanField(default=True)
    unpaid_followup_days = models.PositiveSmallIntegerField(
        default=3, validators=[MinValueValidator(1), MaxValueValidator(60)]
    )
    pending_orders_enabled = models.BooleanField(default=True)
    pending_orders_days = models.PositiveSmallIntegerField(
        default=2, validators=[MinValueValidator(1), MaxValueValidator(60)]
    )
    daily_summary_enabled = models.BooleanField(default=False)
    # Heure locale (fuseau de la boutique) de l'e-mail du résumé du jour.
    daily_summary_hour = models.PositiveSmallIntegerField(
        default=8, validators=[MaxValueValidator(23)]
    )
    # Jour local du dernier résumé envoyé : jamais deux envois le même jour.
    daily_summary_sent_on = models.DateField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'reminder_settings'

    def __str__(self):
        return f'Rappels automatiques ({self.shop})'
