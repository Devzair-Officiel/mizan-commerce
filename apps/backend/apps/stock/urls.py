from django.urls import path
from .views import StockMovementListView, StockInView, StockOutView

urlpatterns = [
    path('movements/', StockMovementListView.as_view(), name='stock-movements'),
    path('in/', StockInView.as_view(), name='stock-in'),
    path('out/', StockOutView.as_view(), name='stock-out'),
]
