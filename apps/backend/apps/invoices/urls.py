from django.urls import path

from .credit_note_views import InvoiceCreditNotesView
from .draft_views import (
    DraftInvoiceCreateView,
    DraftInvoiceView,
    InvoiceComplianceView,
    InvoiceIssueDraftView,
    LineSuggestionsView,
)
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
    path('drafts/', DraftInvoiceCreateView.as_view(), name='invoice-draft-create'),
    path(
        'line-suggestions/',
        LineSuggestionsView.as_view(),
        name='invoice-line-suggestions',
    ),
    path('<uuid:pk>/', InvoiceDetailView.as_view(), name='invoice-detail'),
    path('<uuid:pk>/status/', InvoiceStatusView.as_view(), name='invoice-status'),
    path('<uuid:pk>/pdf/', InvoicePdfView.as_view(), name='invoice-pdf'),
    path('<uuid:pk>/draft/', DraftInvoiceView.as_view(), name='invoice-draft'),
    path(
        '<uuid:pk>/compliance/',
        InvoiceComplianceView.as_view(),
        name='invoice-compliance',
    ),
    path('<uuid:pk>/issue/', InvoiceIssueDraftView.as_view(), name='invoice-issue'),
    path(
        '<uuid:pk>/credit-notes/',
        InvoiceCreditNotesView.as_view(),
        name='invoice-credit-notes',
    ),
]
