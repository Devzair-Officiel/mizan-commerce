import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email requis')
        email = self.normalize_email(email)
        # Les comptes créés après l'ajout de la synchronisation partent des
        # valeurs applicatives. Les lignes historiques restent nulles via la
        # migration et peuvent ainsi importer leur ancien thème local.
        extra_fields.setdefault('theme_mode', 'system')
        extra_fields.setdefault('primary_color', 'mint')
        extra_fields.setdefault('background_theme', 'default')
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Le superuser doit avoir is_staff=True.')

        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Le superuser doit avoir is_superuser=True.')

        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    THEME_MODE_SYSTEM = 'system'
    THEME_MODE_LIGHT = 'light'
    THEME_MODE_DARK = 'dark'
    THEME_MODE_CHOICES = [
        (THEME_MODE_SYSTEM, 'Système'),
        (THEME_MODE_LIGHT, 'Clair'),
        (THEME_MODE_DARK, 'Sombre'),
    ]

    PRIMARY_COLOR_CHOICES = [
        (value, label) for value, label in (
            ('default', 'Défaut'),
            ('blue', 'Bleu'),
            ('purple', 'Violet'),
            ('indigo', 'Indigo'),
            ('magenta', 'Fuchsia'),
            ('rose', 'Rose'),
            ('red', 'Rouge'),
            ('orange', 'Orange'),
            ('amber', 'Ambre'),
            ('forest', 'Forêt'),
            ('mint', 'Menthe'),
            ('cyan', 'Cyan'),
            ('slate', 'Ardoise'),
            ('taupe', 'Taupe'),
            ('charcoal', 'Anthracite'),
        )
    ]

    BACKGROUND_THEME_CHOICES = [
        (value, label) for value, label in (
            ('default', 'Défaut'),
            ('warm', 'Chaud'),
            ('sky', 'Ciel'),
            ('blush', 'Blush'),
            ('rosé', 'Rosé'),
            ('mint', 'Menthe'),
            ('straw', 'Paille'),
            ('lavender', 'Lavande'),
            ('steel', 'Acier'),
            ('sage', 'Sauge'),
            ('peach', 'Pêche'),
            ('lilac', 'Lilas'),
        )
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(max_length=254, unique=True)
    full_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    # URS-100 — Posé une seule fois quand le compte consomme son essai 14j Boutique+.
    # Toute boutique créée ensuite par ce user démarre directement sur le plan Gratuit.
    trial_consumed_at = models.DateTimeField(null=True, blank=True)
    # Préférences d'apparence propres au compte. Elles restent nulles jusqu'à
    # la première synchronisation afin de pouvoir importer le thème local des
    # utilisateurs existants sans l'écraser au déploiement.
    theme_mode = models.CharField(
        max_length=10, choices=THEME_MODE_CHOICES, null=True, blank=True,
    )
    primary_color = models.CharField(
        max_length=20, choices=PRIMARY_COLOR_CHOICES, null=True, blank=True,
    )
    background_theme = models.CharField(
        max_length=20, choices=BACKGROUND_THEME_CHOICES, null=True, blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    class Meta:
        db_table = 'users'

    def __str__(self):
        return self.email
