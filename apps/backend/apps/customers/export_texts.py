"""Libellés de l'export CSV de l'activité d'un client, dans la langue de l'interface.

En-têtes de colonnes, types d'événement, statuts et descriptions ; le nom du fichier
(`activite-…`) reste le même dans toutes les langues.
"""

from __future__ import annotations

EXPORT_TEXTS: dict[str, dict[str, dict[str, str]]] = {
    'fr': {
        'columns': {
            'date': 'Date', 'type': 'Type', 'reference': 'Référence',
            'description': 'Description', 'amount': 'Montant', 'status': 'Statut',
            'author': 'Auteur',
        },
        'types': {
            'order': 'Commande', 'payment': 'Paiement', 'shipment': 'Expédition',
            'note': 'Note',
        },
        'status': {
            'to_prepare': 'À préparer', 'prepared': 'Prête', 'shipped': 'Expédiée',
            'cancelled': 'Annulée', 'unpaid': 'Non payée', 'partial': 'Partiel',
            'paid': 'Payée',
        },
        'description': {
            'order': 'Commande créée', 'payment_unpaid': 'Paiement en attente',
            'payment_partial': 'Paiement partiel', 'payment_paid': 'Paiement reçu',
            'shipment': 'Expédition mise à jour',
        },
    },
    'en': {
        'columns': {
            'date': 'Date', 'type': 'Type', 'reference': 'Reference',
            'description': 'Description', 'amount': 'Amount', 'status': 'Status',
            'author': 'Author',
        },
        'types': {
            'order': 'Order', 'payment': 'Payment', 'shipment': 'Shipment',
            'note': 'Note',
        },
        'status': {
            'to_prepare': 'To prepare', 'prepared': 'Ready', 'shipped': 'Shipped',
            'cancelled': 'Cancelled', 'unpaid': 'Unpaid', 'partial': 'Partial',
            'paid': 'Paid',
        },
        'description': {
            'order': 'Order created', 'payment_unpaid': 'Pending payment',
            'payment_partial': 'Partial payment', 'payment_paid': 'Payment received',
            'shipment': 'Shipment updated',
        },
    },
    'ar': {
        'columns': {
            'date': 'التاريخ', 'type': 'النوع', 'reference': 'المرجع',
            'description': 'الوصف', 'amount': 'المبلغ', 'status': 'الحالة',
            'author': 'الكاتب',
        },
        'types': {
            'order': 'طلب', 'payment': 'دفعة', 'shipment': 'شحن', 'note': 'ملاحظة',
        },
        'status': {
            'to_prepare': 'قيد التحضير', 'prepared': 'جاهز', 'shipped': 'تم الشحن',
            'cancelled': 'ملغى', 'unpaid': 'غير مدفوع', 'partial': 'جزئي',
            'paid': 'مدفوع',
        },
        'description': {
            'order': 'تم إنشاء الطلب', 'payment_unpaid': 'دفعة معلقة',
            'payment_partial': 'دفعة جزئية', 'payment_paid': 'تم استلام الدفعة',
            'shipment': 'تحديث الشحنة',
        },
    },
}

# Colonnes du fichier, dans l'ordre.
EXPORT_COLUMNS = (
    'date', 'type', 'reference', 'description', 'amount', 'status', 'author',
)
