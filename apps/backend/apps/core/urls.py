from django.urls import path
from .views import (
    DashboardBadgesView, DashboardSalesView, DashboardTodayView, GlobalSearchView,
)

urlpatterns = [
    path('dashboard/today/', DashboardTodayView.as_view(), name='dashboard-today'),
    path('dashboard/sales/', DashboardSalesView.as_view(), name='dashboard-sales'),
    path('dashboard/badges/', DashboardBadgesView.as_view(), name='dashboard-badges'),
    path('search/', GlobalSearchView.as_view(), name='global-search'),
]
