from django.urls import path

from .views import ShopDetailView, ShopLogoView, ShopMemberListView, AdminShopListView

urlpatterns = [
    path('', ShopDetailView.as_view(), name='shop-detail'),
    path('logo/', ShopLogoView.as_view(), name='shop-logo'),
    path('members/', ShopMemberListView.as_view(), name='shop-members'),
    path('admin/all/', AdminShopListView.as_view(), name='admin-shop-list'),
]
