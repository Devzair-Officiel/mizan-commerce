from django.urls import path

from .views import (
    InvoiceDetailView,
    InvoiceListCreateView,
    InvoicePdfView,
    InvoiceStatusView,
)

urlpatterns = [
    path('', InvoiceListCreateView.as_view(), name='invoice-list'),
    path('<uuid:pk>/', InvoiceDetailView.as_view(), name='invoice-detail'),
    path('<uuid:pk>/status/', InvoiceStatusView.as_view(), name='invoice-status'),
    path('<uuid:pk>/pdf/', InvoicePdfView.as_view(), name='invoice-pdf'),
]
