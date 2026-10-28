import uuid
from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    ACTION_CHOICES = [
        ('stock_entry', 'Entrée stock'),
        ('stock_exit', 'Sortie stock'),
        ('stock_adjustment', 'Ajustement stock'),
        ('order_created', 'Création commande'),
        ('order_status_change', 'Changement statut commande'),
        ('order_payment_change', 'Changement paiement commande'),
        ('customer_delete', 'Suppression client'),
        ('product_delete', 'Suppression produit'),
        ('product_deactivate', 'Désactivation produit'),
        ('customer_activity_export', 'Export activité client'),
        ('orders_export', 'Export commandes'),
        ('stock_export', 'Export stock'),
        # Scan d'emballage : sources utilisées seulement, jamais l'image ni le texte lu.
        ('product_scan', "Scan d'emballage"),
        # Zakat : données personnelles, jamais affichées dans le journal de la boutique.
        ('zakat_created', 'Création calcul zakat'),
        ('zakat_deleted', 'Suppression calcul zakat'),
        ('zakat_pdf_download', 'Téléchargement justificatif zakat'),
        ('zakat_paid', 'Zakat marquée comme versée'),
        ('zakat_paid_changed', 'Versement zakat modifié'),
        ('zakat_paid_reverted', 'Versement zakat retiré'),
        ('zakat_followup_option', 'Choix créance douteuse encaissée'),
        ('zakat_followup_collected', 'Créance zakat encaissée'),
        ('zakat_followup_paid', 'Zakat de créance marquée comme versée'),
        ('zakat_followup_ignored', 'Créance zakat ignorée'),
        ('zakat_followup_reverted', 'Action sur créance zakat défaite'),
        # Abonnement Stripe : aucune donnée de paiement (carte, IBAN) dans les détails.
        ('subscription_started', 'Abonnement souscrit'),
        ('subscription_plan_changed', "Formule d'abonnement changée"),
        ('subscription_cancel_scheduled', 'Résiliation programmée'),
        ('subscription_cancel_reverted', 'Résiliation annulée'),
        ('subscription_payment_failed', "Échec de paiement de l'abonnement"),
        ('subscription_ended', 'Abonnement terminé'),
        ('subscription_dispute', "Contestation d'un paiement de l'abonnement"),
        # Admin interne (apps/core/admin_site.py) : seules écritures autorisées.
        ('user_deactivated', 'Compte désactivé (admin Mizan)'),
        ('user_reactivated', 'Compte réactivé (admin Mizan)'),
        ('public_page_moderated', 'Page publique modérée (admin Mizan)'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop_id = models.UUIDField(db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='audit_logs',
    )
    action = models.CharField(max_length=30, choices=ACTION_CHOICES)
    model_name = models.CharField(max_length=50)
    object_id = models.CharField(max_length=36, db_index=True)
    object_repr = models.CharField(max_length=200)
    changes = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['shop_id', 'created_at'])]

    def __str__(self) -> str:
        return f'{self.action} — {self.object_repr}'
