from django.urls import path
from .views import DashboardTodayView, GlobalSearchView

urlpatterns = [
    path('dashboard/today/', DashboardTodayView.as_view(), name='dashboard-today'),
    path('search/', GlobalSearchView.as_view(), name='global-search'),
]
