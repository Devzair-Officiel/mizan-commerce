import uuid
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.shops.models import Shop


class UploadedDocument(models.Model):
    DOCUMENT_TYPE_SUPPLIER_INVOICE = 'supplier_invoice'
    DOCUMENT_TYPE_CUSTOMER_ADDRESS = 'customer_address'
    DOCUMENT_TYPE_OTHER = 'other'
    DOCUMENT_TYPE_CHOICES = [
        (DOCUMENT_TYPE_SUPPLIER_INVOICE, 'Facture fournisseur'),
        (DOCUMENT_TYPE_CUSTOMER_ADDRESS, 'Adresse client'),
        (DOCUMENT_TYPE_OTHER, 'Autre'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(
        Shop, on_delete=models.CASCADE, related_name='uploaded_documents'
    )
    uploaded_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='uploaded_documents',
    )
    document_type = models.CharField(max_length=30, choices=DOCUMENT_TYPE_CHOICES)
    object_key = models.CharField(max_length=500)
    original_filename = models.CharField(max_length=255, blank=True)
    mime_type = models.CharField(max_length=100, blank=True)
    size_bytes = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'uploaded_documents'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['shop', '-created_at']),
        ]

    def __str__(self) -> str:
        return f'{self.get_document_type_display()} — {self.original_filename or self.pk}'


class OcrResult(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_PROCESSING = 'processing'
    STATUS_DONE = 'done'
    STATUS_FAILED = 'failed'
    STATUS_VALIDATED = 'validated'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'En attente'),
        (STATUS_PROCESSING, 'En cours'),
        (STATUS_DONE, 'Terminé'),
        (STATUS_FAILED, 'Échec'),
        (STATUS_VALIDATED, 'Validé'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(
        Shop, on_delete=models.CASCADE, related_name='ocr_results'
    )
    uploaded_document = models.ForeignKey(
        UploadedDocument, on_delete=models.CASCADE, related_name='ocr_results'
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING
    )
    raw_text = models.TextField(blank=True)
    structured_data = models.JSONField(null=True, blank=True)
    confidence_score = models.DecimalField(
        max_digits=4, decimal_places=3,
        null=True, blank=True,
        validators=[
            MinValueValidator(Decimal('0.000')),
            MaxValueValidator(Decimal('1.000')),
        ],
    )
    validated_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='validated_ocr_results',
    )
    validated_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'ocr_results'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['shop', '-created_at']),
            models.Index(fields=['shop', 'status']),
        ]

    def __str__(self) -> str:
        return f'OcrResult {self.pk} ({self.get_status_display()})'
