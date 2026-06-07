import uuid
from django.core.validators import RegexValidator
from django.db import models

from apps.products.models import Product
from apps.shops.models import Shop


# Slugs qu'on ne peut pas réserver pour une boutique : conflit avec les routes
# Next.js (/api, /dashboard…) ou ambiguïté pour le visiteur (/boutique).
RESERVED_SLUGS = frozenset({
    'api',
    'admin',
    'app',
    'auth',
    'boutique',
    'dashboard',
    'login',
    'logout',
    'register',
    'settings',
    'shop',
    'signup',
    'static',
    'media',
    'public',
    'www',
})

slug_validator = RegexValidator(
    regex=r'^[a-z0-9]+(?:-[a-z0-9]+)*$',
    message="Slug invalide : minuscules, chiffres et tirets uniquement (pas en début ni fin).",
)


class PublicPage(models.Model):
    """Vitrine publique d'une boutique (URS-070 à URS-077).

    Une page par boutique. Le slug est défini par l'utilisateur (pré-rempli
    via slugify(shop.name) à la création) et sert d'URL publique
    `/boutique/{slug}`. La séparation `is_active` / `is_published` permet de
    désactiver complètement la page (URS-070) ou simplement de garder un
    brouillon non publié (URS-077) : la page ne devient accessible
    publiquement que si les deux flags sont à True.
    """

    THEME_CLASSIC = 'classic'
    THEME_MODERN = 'modern'
    THEME_MINIMAL = 'minimal'
    THEME_CHOICES = [
        (THEME_CLASSIC, 'Classique'),
        (THEME_MODERN, 'Moderne'),
        (THEME_MINIMAL, 'Minimaliste'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.OneToOneField(Shop, on_delete=models.CASCADE, related_name='public_page')

    slug = models.CharField(max_length=50, unique=True, validators=[slug_validator])
    is_active = models.BooleanField(default=False)
    is_published = models.BooleanField(default=False)

    display_name = models.CharField(max_length=120, blank=True)
    tagline = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)

    logo_object_key = models.CharField(max_length=500, blank=True)
    cover_object_key = models.CharField(max_length=500, blank=True)

    theme = models.CharField(max_length=20, choices=THEME_CHOICES, default=THEME_CLASSIC)
    primary_color = models.CharField(
        max_length=7,
        default='#0ea5e9',
        validators=[RegexValidator(r'^#[0-9a-fA-F]{6}$', 'Couleur hex attendue, ex. #0ea5e9.')],
    )

    # URS-078 : message pré-rempli envoyé au commerçant quand un visiteur clique
    # sur « Commander ». Placeholders supportés : {shop_name}, {item_name}, {price}.
    order_message_template = models.TextField(
        blank=True,
        max_length=500,
        default='Bonjour {shop_name}, je suis intéressé(e) par : {item_name}{price}.',
    )

    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'public_pages'

    def __str__(self) -> str:
        return f'/boutique/{self.slug} ({self.shop.name})'

    @property
    def is_live(self) -> bool:
        """Vrai si la page est accessible publiquement (active ET publiée)."""
        return self.is_active and self.is_published


class PublicPageSection(models.Model):
    """Sections affichées sur la page publique (URS-073).

    Une section par type max et par page. L'ordre est contrôlé par `position`,
    la visibilité par `is_visible`. Les sections `products` et `services`
    listent les `PublicCatalogVisibility` rattachées à la page filtrées par
    `product.type`.
    """

    class Type(models.TextChoices):
        HEADER = 'header', 'En-tête'
        DESCRIPTION = 'description', 'Description'
        PRODUCTS = 'products', 'Produits'
        SERVICES = 'services', 'Services'
        CONTACT = 'contact', 'Contact'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    page = models.ForeignKey(PublicPage, on_delete=models.CASCADE, related_name='sections')
    type = models.CharField(max_length=20, choices=Type.choices)
    position = models.PositiveIntegerField(default=0)
    is_visible = models.BooleanField(default=True)
    title = models.CharField(max_length=120, blank=True)
    content = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'public_page_sections'
        ordering = ['position']
        constraints = [
            models.UniqueConstraint(fields=['page', 'type'], name='unique_section_type_per_page'),
        ]

    def __str__(self) -> str:
        return f'{self.get_type_display()} — {self.page.slug}'


class PublicCatalogVisibility(models.Model):
    """Référence un Product (produit ou service) à afficher sur la page publique.

    Le catalogue interne est la source de vérité (nom, photo, description,
    prix via la variante). Ce modèle stocke uniquement les choix d'affichage
    propres à la vitrine : visibilité, ordre, masquage du prix, badges promo
    et nouveauté. Le badge rupture est dérivé du stock côté lecture, jamais
    stocké ici.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    page = models.ForeignKey(PublicPage, on_delete=models.CASCADE, related_name='catalog_items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='public_visibilities')
    position = models.PositiveIntegerField(default=0)
    show_price = models.BooleanField(default=True)
    badge_promo = models.BooleanField(default=False)
    badge_new = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'public_catalog_visibilities'
        ordering = ['position']
        constraints = [
            models.UniqueConstraint(fields=['page', 'product'], name='unique_visibility_per_page_product'),
        ]
        indexes = [
            models.Index(fields=['page', 'position']),
        ]

    def __str__(self) -> str:
        return f'{self.product.name} sur {self.page.slug}'


class ContactButton(models.Model):
    """Boutons de contact configurés pour la page publique (URS-076).

    Pour V3, on liste les canaux disponibles côté commerçant (WhatsApp,
    Telegram, Instagram, téléphone). L'unicité de `is_primary` par page est
    garantie côté service (au plus un bouton principal). `value` contient
    le numéro de téléphone (format E.164 recommandé), le handle Instagram
    sans @ ou le chat_id Telegram — la normalisation est faite côté service.
    """

    class Type(models.TextChoices):
        WHATSAPP = 'whatsapp', 'WhatsApp'
        TELEGRAM = 'telegram', 'Telegram'
        INSTAGRAM = 'instagram', 'Instagram'
        PHONE = 'phone', 'Téléphone'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    page = models.ForeignKey(PublicPage, on_delete=models.CASCADE, related_name='contact_buttons')
    type = models.CharField(max_length=20, choices=Type.choices)
    value = models.CharField(max_length=200)
    label = models.CharField(max_length=60, blank=True)
    is_primary = models.BooleanField(default=False)
    is_visible = models.BooleanField(default=True)
    position = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'public_page_contact_buttons'
        ordering = ['position']
        constraints = [
            models.UniqueConstraint(fields=['page', 'type'], name='unique_contact_type_per_page'),
        ]

    def __str__(self) -> str:
        return f'{self.get_type_display()} — {self.page.slug}'
