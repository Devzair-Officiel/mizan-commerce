from django.urls import path

from .draft_views import (
    DraftQuoteCreateView,
    DraftQuoteView,
    QuoteComplianceView,
    QuoteSendView,
)
from .views import QuoteConvertView, QuoteDetailView, QuoteListView, QuoteStatusView

urlpatterns = [
    path('', QuoteListView.as_view(), name='quote-list'),
    path('drafts/', DraftQuoteCreateView.as_view(), name='quote-draft-create'),
    path('<uuid:pk>/', QuoteDetailView.as_view(), name='quote-detail'),
    path('<uuid:pk>/draft/', DraftQuoteView.as_view(), name='quote-draft'),
    path(
        '<uuid:pk>/compliance/', QuoteComplianceView.as_view(), name='quote-compliance'
    ),
    path('<uuid:pk>/send/', QuoteSendView.as_view(), name='quote-send'),
    path('<uuid:pk>/status/', QuoteStatusView.as_view(), name='quote-status'),
    path('<uuid:pk>/convert/', QuoteConvertView.as_view(), name='quote-convert'),
]
