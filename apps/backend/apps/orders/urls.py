from django.urls import path
from .views import (
    OrderListCreateView, OrderDetailView,
    OrderStatusView, OrderPaymentView, OrderActivityView,
    OrderItemCreateView, OrderItemUpdateView,
)

urlpatterns = [
    path('', OrderListCreateView.as_view(), name='order-list'),
    path('<uuid:pk>/', OrderDetailView.as_view(), name='order-detail'),
    path('<uuid:pk>/status/', OrderStatusView.as_view(), name='order-status'),
    path('<uuid:pk>/payment/', OrderPaymentView.as_view(), name='order-payment'),
    path('<uuid:pk>/activity/', OrderActivityView.as_view(), name='order-activity'),
    path('<uuid:pk>/items/', OrderItemCreateView.as_view(), name='order-item-create'),
    path('<uuid:pk>/items/<uuid:item_pk>/', OrderItemUpdateView.as_view(), name='order-item-detail'),
]
