from django.urls import path
from rest_framework_simplejwt.views import TokenBlacklistView, TokenRefreshView

from .throttles import AuthRateThrottle
from .views import (
    RegisterView, LoginView, MeView, ChangePasswordView,
    PasswordResetRequestView, PasswordResetConfirmView, EmailVerificationView,
    ResendEmailVerificationView,
)


class ThrottledTokenRefreshView(TokenRefreshView):
    throttle_classes = [AuthRateThrottle]


class ThrottledTokenBlacklistView(TokenBlacklistView):
    """Déconnexion : le jeton de rafraîchissement transmis passe sur liste noire."""
    throttle_classes = [AuthRateThrottle]


urlpatterns = [
    path('register/', RegisterView.as_view(), name='auth-register'),
    path('login/', LoginView.as_view(), name='auth-login'),
    path('token/refresh/', ThrottledTokenRefreshView.as_view(), name='auth-token-refresh'),  # noqa: E501
    path('logout/', ThrottledTokenBlacklistView.as_view(), name='auth-logout'),
    path('me/', MeView.as_view(), name='auth-me'),
    path('change-password/', ChangePasswordView.as_view(), name='auth-change-password'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='auth-password-reset'),  # noqa: E501
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='auth-password-reset-confirm'),  # noqa: E501
    path('verify-email/', EmailVerificationView.as_view(), name='auth-verify-email'),
    path('verify-email/resend/', ResendEmailVerificationView.as_view(), name='auth-verify-email-resend'),  # noqa: E501
]
