from django.urls import path

from .views import OcrResultDetailView, SupplierInvoiceUploadView

urlpatterns = [
    path('invoices/', SupplierInvoiceUploadView.as_view(), name='ocr-invoice-upload'),
    path(
        'results/<uuid:ocr_result_id>/',
        OcrResultDetailView.as_view(),
        name='ocr-result-detail',
    ),
]
