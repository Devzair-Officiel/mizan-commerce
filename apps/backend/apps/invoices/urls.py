from django.urls import path

from .views import (
    InvoiceDetailView,
    InvoiceListCreateView,
    InvoicePdfView,
    InvoiceStatusView,
    InvoiceSummaryView,
    InvoiceFacetsView,
)

urlpatterns = [
    path('', InvoiceListCreateView.as_view(), name='invoice-list'),
    path('summary/', InvoiceSummaryView.as_view(), name='invoice-summary'),
    path('facets/', InvoiceFacetsView.as_view(), name='invoice-facets'),
    path('<uuid:pk>/', InvoiceDetailView.as_view(), name='invoice-detail'),
    path('<uuid:pk>/status/', InvoiceStatusView.as_view(), name='invoice-status'),
    path('<uuid:pk>/pdf/', InvoicePdfView.as_view(), name='invoice-pdf'),
]
