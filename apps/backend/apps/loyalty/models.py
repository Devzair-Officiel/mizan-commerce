import uuid
from django.db import models
from apps.shops.models import Shop
from apps.customers.models import Customer


class LoyaltyProgram(models.Model):
    """Configuration du programme de fidélité par boutique (1-to-1)."""
    shop = models.OneToOneField(Shop, on_delete=models.CASCADE, related_name='loyalty_program')  # noqa: E501
    is_active = models.BooleanField(default=False)
    points_per_unit = models.PositiveIntegerField(default=1)
    redemption_threshold = models.PositiveIntegerField(default=100)
    redemption_value = models.DecimalField(max_digits=8, decimal_places=2, default='5.00')  # noqa: E501
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'loyalty_programs'

    def __str__(self) -> str:
        return f'LoyaltyProgram({self.shop})'


class LoyaltyCard(models.Model):
    """Solde de points d'un client dans une boutique."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='loyalty_cards')  # noqa: E501
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='loyalty_cards')  # noqa: E501
    points_balance = models.IntegerField(default=0)
    total_points_earned = models.IntegerField(default=0)
    total_points_redeemed = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'loyalty_cards'
        unique_together = (('shop', 'customer'),)
        indexes = [
            models.Index(fields=['shop', 'customer']),
            models.Index(fields=['shop', 'points_balance']),
        ]
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'LoyaltyCard({self.customer}, {self.points_balance}pts)'


class LoyaltyTransaction(models.Model):
    TYPE_EARN = 'earn'
    TYPE_REDEEM = 'redeem'
    TYPE_ADJUST = 'adjust'
    TYPE_EXPIRE = 'expire'
    TRANSACTION_TYPES = (
        (TYPE_EARN, 'Gain'),
        (TYPE_REDEEM, 'Remboursement'),
        (TYPE_ADJUST, 'Ajustement manuel'),
        (TYPE_EXPIRE, 'Expiration'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='loyalty_transactions')  # noqa: E501
    card = models.ForeignKey(LoyaltyCard, on_delete=models.CASCADE, related_name='transactions')  # noqa: E501
    transaction_type = models.CharField(max_length=10, choices=TRANSACTION_TYPES)
    points = models.IntegerField()
    order = models.ForeignKey(
        'orders.Order', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='loyalty_transactions',
    )
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='loyalty_transactions_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'loyalty_transactions'
        indexes = [
            models.Index(fields=['shop', 'card']),
            models.Index(fields=['shop', 'created_at']),
        ]
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'LoyaltyTransaction({self.transaction_type}, {self.points:+}pts)'
