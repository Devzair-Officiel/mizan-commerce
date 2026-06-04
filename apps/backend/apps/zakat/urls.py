from django.urls import path
from .views import (
    ZakatStockEstimateView,
    ZakatCalculationListCreateView,
    ZakatCalculationDetailView,
    ZakatDraftCurrentView,
    ZakatCalculationFinalizeView,
    ZakatCalculationReopenView,
    ZakatCalculationPdfView,
)

urlpatterns = [
    path('zakat/stock-estimate/', ZakatStockEstimateView.as_view(), name='zakat-stock-estimate'),
    path('zakat/calculations/', ZakatCalculationListCreateView.as_view(), name='zakat-calculation-list'),
    path('zakat/calculations/draft/', ZakatDraftCurrentView.as_view(), name='zakat-draft-current'),
    path('zakat/calculations/<uuid:pk>/', ZakatCalculationDetailView.as_view(), name='zakat-calculation-detail'),
    path('zakat/calculations/<uuid:pk>/finalize/', ZakatCalculationFinalizeView.as_view(), name='zakat-calculation-finalize'),
    path('zakat/calculations/<uuid:pk>/reopen/', ZakatCalculationReopenView.as_view(), name='zakat-calculation-reopen'),
    path('zakat/calculations/<uuid:pk>/pdf/', ZakatCalculationPdfView.as_view(), name='zakat-calculation-pdf'),
]
