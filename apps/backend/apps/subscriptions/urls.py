from django.urls import path

from .views import SubscriptionChangeView, SubscriptionCurrentView

urlpatterns = [
    path('current/', SubscriptionCurrentView.as_view(), name='subscription-current'),
    path('change/', SubscriptionChangeView.as_view(), name='subscription-change'),
]
