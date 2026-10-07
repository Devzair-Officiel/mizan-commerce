from django.urls import path
from .views import DashboardBadgesView, DashboardTodayView, GlobalSearchView

urlpatterns = [
    path('dashboard/today/', DashboardTodayView.as_view(), name='dashboard-today'),
    path('dashboard/badges/', DashboardBadgesView.as_view(), name='dashboard-badges'),
    path('search/', GlobalSearchView.as_view(), name='global-search'),
]
