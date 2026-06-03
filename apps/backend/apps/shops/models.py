import uuid
from django.conf import settings
from django.db import models


class Shop(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    currency = models.CharField(max_length=3, default='EUR')
    country = models.CharField(max_length=2, blank=True)
    timezone = models.CharField(max_length=50, default='Europe/Paris')
    zakat_annual_date = models.DateField(null=True, blank=True)
    logo_object_key = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'shops'

    def save(self, *args, **kwargs):
        from .services import timezone_for_country
        self.timezone = timezone_for_country(self.country)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class ShopMember(models.Model):
    ROLE_CHOICES = [
        ('owner', 'Owner'),
        ('manager', 'Manager'),
        ('staff', 'Staff'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='shop_memberships')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='owner')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'shop_members'
        unique_together = ('shop', 'user')

    def __str__(self):
        return f'{self.user} — {self.shop} ({self.role})'
