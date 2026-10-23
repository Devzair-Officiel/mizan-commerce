from django.urls import path

from .views import (
    SubscriptionCancelView,
    SubscriptionChangeView,
    SubscriptionCheckoutView,
    SubscriptionCurrentView,
    SubscriptionPlanListView,
    SubscriptionPortalView,
    SubscriptionRefreshView,
    SubscriptionResumeView,
)

urlpatterns = [
    path('current/', SubscriptionCurrentView.as_view(), name='subscription-current'),
    path('plans/', SubscriptionPlanListView.as_view(), name='subscription-plans'),
    path('change/', SubscriptionChangeView.as_view(), name='subscription-change'),
    path('checkout/', SubscriptionCheckoutView.as_view(), name='subscription-checkout'),
    path('portal/', SubscriptionPortalView.as_view(), name='subscription-portal'),
    path('cancel/', SubscriptionCancelView.as_view(), name='subscription-cancel'),
    path('resume/', SubscriptionResumeView.as_view(), name='subscription-resume'),
    path('refresh/', SubscriptionRefreshView.as_view(), name='subscription-refresh'),
]
