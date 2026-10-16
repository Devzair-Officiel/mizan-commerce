from django.urls import path

from .views import (
    SubscriptionChangeView,
    SubscriptionCurrentView,
    SubscriptionPlanListView,
)

urlpatterns = [
    path('current/', SubscriptionCurrentView.as_view(), name='subscription-current'),
    path('plans/', SubscriptionPlanListView.as_view(), name='subscription-plans'),
    path('change/', SubscriptionChangeView.as_view(), name='subscription-change'),
]
