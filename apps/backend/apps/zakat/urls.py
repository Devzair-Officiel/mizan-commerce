from django.urls import path
from .views import (
    ZakatStockEstimateView,
    ZakatProfileView,
    ZakatSourcesView,
    ZakatCalculationListCreateView,
    ZakatCalculationDetailView,
    ZakatDraftCurrentView,
    ZakatCalculationFinalizeView,
    ZakatCalculationReopenView,
    ZakatCalculationPdfView,
)

urlpatterns = [
    path('zakat/stock-estimate/', ZakatStockEstimateView.as_view(), name='zakat-stock-estimate'),  # noqa: E501
    path('zakat/profile/', ZakatProfileView.as_view(), name='zakat-profile'),
    path('zakat/sources/', ZakatSourcesView.as_view(), name='zakat-sources'),
    path('zakat/calculations/', ZakatCalculationListCreateView.as_view(), name='zakat-calculation-list'),  # noqa: E501
    path('zakat/calculations/draft/', ZakatDraftCurrentView.as_view(), name='zakat-draft-current'),  # noqa: E501
    path('zakat/calculations/<uuid:pk>/', ZakatCalculationDetailView.as_view(), name='zakat-calculation-detail'),  # noqa: E501
    path('zakat/calculations/<uuid:pk>/finalize/', ZakatCalculationFinalizeView.as_view(), name='zakat-calculation-finalize'),  # noqa: E501
    path('zakat/calculations/<uuid:pk>/reopen/', ZakatCalculationReopenView.as_view(), name='zakat-calculation-reopen'),  # noqa: E501
    path('zakat/calculations/<uuid:pk>/pdf/', ZakatCalculationPdfView.as_view(), name='zakat-calculation-pdf'),  # noqa: E501
]
