from django.urls import path

from .views import ShopDetailView, ShopMemberListView, AdminShopListView

urlpatterns = [
    path('', ShopDetailView.as_view(), name='shop-detail'),
    path('members/', ShopMemberListView.as_view(), name='shop-members'),
    path('admin/all/', AdminShopListView.as_view(), name='admin-shop-list'),
]
