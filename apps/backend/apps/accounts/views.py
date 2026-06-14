from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import (
    RegisterSerializer, UserSerializer, MeSerializer, ChangePasswordSerializer,
    PasswordResetRequestSerializer, PasswordResetConfirmSerializer,
)
from .throttles import AuthRateThrottle

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (AllowAny,)
    serializer_class = RegisterSerializer
    throttle_classes = [AuthRateThrottle]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save(is_active=False)

        from apps.shops.models import Shop, ShopMember
        from apps.subscriptions.services import start_trial_or_default

        # Shop + ShopMember + Subscription liés logiquement : si l'un échoue,
        # rien n'est commité (sinon on se retrouve avec une boutique sans owner
        # ou sans souscription, ce qui casserait le gating ensuite).
        shop_name = request.data.get('shop_name') or f"Boutique de {user.full_name or user.email}"
        with transaction.atomic():
            shop = Shop.objects.create(name=shop_name)
            ShopMember.objects.create(shop=shop, user=user, role='owner')
            start_trial_or_default(shop, user)

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        verify_url = f"{settings.FRONTEND_URL}/verify-email?uid={uid}&token={token}"
        send_mail(
            subject='Confirmez votre email — Mizan',
            message=f"Bienvenue sur Mizan !\n\nCliquez sur ce lien pour activer votre compte :\n\n{verify_url}\n\nCe lien est valable 24 heures.",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )

        return Response(
            {'detail': 'Compte créé. Vérifiez votre email pour activer votre compte.'},
            status=status.HTTP_201_CREATED,
        )


class MeView(generics.RetrieveUpdateAPIView):
    permission_classes = (IsAuthenticated,)

    def get_serializer_class(self):
        # PATCH/PUT : UserSerializer (édition du profil uniquement)
        # GET : MeSerializer (profil + appartenance boutique)
        if self.request.method == 'GET':
            return MeSerializer
        return UserSerializer

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(serializer.validated_data['old_password']):
            return Response({'old_password': 'Mot de passe incorrect.'}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        return Response({'detail': 'Mot de passe modifié.'})


class PasswordResetRequestView(APIView):
    permission_classes = (AllowAny,)
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        try:
            user = User.objects.get(email=email, is_active=True)
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            reset_url = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
            send_mail(
                subject='Réinitialisation de votre mot de passe — Mizan',
                message=f"Cliquez sur ce lien pour réinitialiser votre mot de passe :\n\n{reset_url}\n\nCe lien est valable 24 heures.",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=False,
            )
        except User.DoesNotExist:
            pass  # Ne pas révéler si l'email existe

        # Toujours retourner 200 pour éviter l'énumération d'emails
        return Response({'detail': "Si un compte existe pour cet email, un lien de réinitialisation a été envoyé."})


class PasswordResetConfirmView(APIView):
    permission_classes = (AllowAny,)
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            uid = force_str(urlsafe_base64_decode(serializer.validated_data['uid']))
            user = User.objects.get(pk=uid, is_active=True)
        except (User.DoesNotExist, ValueError, TypeError):
            return Response({'detail': 'Lien invalide.'}, status=status.HTTP_400_BAD_REQUEST)

        if not default_token_generator.check_token(user, serializer.validated_data['token']):
            return Response({'detail': 'Lien expiré ou invalide.'}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(serializer.validated_data['new_password'])
        user.save()
        return Response({'detail': 'Mot de passe réinitialisé.'})


class EmailVerificationView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request) -> Response:
        uid_b64 = request.query_params.get('uid', '')
        token = request.query_params.get('token', '')

        try:
            uid = force_str(urlsafe_base64_decode(uid_b64))
            user = User.objects.get(pk=uid, is_active=False)
        except (User.DoesNotExist, ValueError, TypeError):
            return Response({'detail': 'Lien invalide.'}, status=status.HTTP_400_BAD_REQUEST)

        if not default_token_generator.check_token(user, token):
            return Response({'detail': 'Lien expiré ou invalide.'}, status=status.HTTP_400_BAD_REQUEST)

        user.is_active = True
        user.email_verified_at = timezone.now()
        user.save(update_fields=['is_active', 'email_verified_at'])
        return Response({'detail': 'Email vérifié. Vous pouvez maintenant vous connecter.'})
