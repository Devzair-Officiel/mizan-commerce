from django.urls import path

from .views import (
    AdminShopListView,
    OnboardingView,
    ShopDetailView,
    ShopLogoView,
    ShopMemberDetailView,
    ShopMemberListView,
)

urlpatterns = [
    path('', ShopDetailView.as_view(), name='shop-detail'),
    path('logo/', ShopLogoView.as_view(), name='shop-logo'),
    path('onboarding/', OnboardingView.as_view(), name='shop-onboarding'),
    path('members/', ShopMemberListView.as_view(), name='shop-members'),
    path('members/<uuid:pk>/', ShopMemberDetailView.as_view(), name='shop-member-detail'),
    path('admin/all/', AdminShopListView.as_view(), name='admin-shop-list'),
]
