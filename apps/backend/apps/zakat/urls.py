from django.urls import path
from .views import ZakatStockEstimateView, ZakatCalculationListCreateView, ZakatCalculationDetailView

urlpatterns = [
    path('zakat/stock-estimate/', ZakatStockEstimateView.as_view(), name='zakat-stock-estimate'),
    path('zakat/calculations/', ZakatCalculationListCreateView.as_view(), name='zakat-calculation-list'),
    path('zakat/calculations/<uuid:pk>/', ZakatCalculationDetailView.as_view(), name='zakat-calculation-detail'),
]
