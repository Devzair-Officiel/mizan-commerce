from django.urls import path

from .views import SupplierInvoiceUploadView

urlpatterns = [
    path('invoices/', SupplierInvoiceUploadView.as_view(), name='ocr-invoice-upload'),
]
