from django.urls import path
from .views import (
    LoyaltyProgramView,
    LoyaltyCardListView,
    LoyaltyCardDetailView,
    LoyaltyCardTransactionListView,
    LoyaltyCardEarnView,
    LoyaltyCardRedeemView,
    LoyaltyCardAdjustView,
)

urlpatterns = [
    path('program/', LoyaltyProgramView.as_view(), name='loyalty-program'),
    path('cards/', LoyaltyCardListView.as_view(), name='loyalty-card-list'),
    path('cards/<uuid:pk>/', LoyaltyCardDetailView.as_view(), name='loyalty-card-detail'),  # noqa: E501
    path('cards/<uuid:pk>/transactions/', LoyaltyCardTransactionListView.as_view(), name='loyalty-card-transactions'),  # noqa: E501
    path('cards/<uuid:pk>/earn/', LoyaltyCardEarnView.as_view(), name='loyalty-card-earn'),  # noqa: E501
    path('cards/<uuid:pk>/redeem/', LoyaltyCardRedeemView.as_view(), name='loyalty-card-redeem'),  # noqa: E501
    path('cards/<uuid:pk>/adjust/', LoyaltyCardAdjustView.as_view(), name='loyalty-card-adjust'),  # noqa: E501
]
