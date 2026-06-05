from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .throttles import AuthRateThrottle
from .views import (
    RegisterView, MeView, ChangePasswordView,
    PasswordResetRequestView, PasswordResetConfirmView, EmailVerificationView,
)


class ThrottledTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [AuthRateThrottle]


class ThrottledTokenRefreshView(TokenRefreshView):
    throttle_classes = [AuthRateThrottle]


urlpatterns = [
    path('register/', RegisterView.as_view(), name='auth-register'),
    path('login/', ThrottledTokenObtainPairView.as_view(), name='auth-login'),
    path('token/refresh/', ThrottledTokenRefreshView.as_view(), name='auth-token-refresh'),
    path('me/', MeView.as_view(), name='auth-me'),
    path('change-password/', ChangePasswordView.as_view(), name='auth-change-password'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='auth-password-reset'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='auth-password-reset-confirm'),
    path('verify-email/', EmailVerificationView.as_view(), name='auth-verify-email'),
]
