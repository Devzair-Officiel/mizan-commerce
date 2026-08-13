from django.urls import path

from .views import (
    OcrResultDetailView,
    OcrResultValidateView,
    SupplierInvoiceUploadView,
)

urlpatterns = [
    path('invoices/', SupplierInvoiceUploadView.as_view(), name='ocr-invoice-upload'),
    path(
        'results/<uuid:ocr_result_id>/',
        OcrResultDetailView.as_view(),
        name='ocr-result-detail',
    ),
    path(
        'results/<uuid:ocr_result_id>/validate/',
        OcrResultValidateView.as_view(),
        name='ocr-result-validate',
    ),
]
