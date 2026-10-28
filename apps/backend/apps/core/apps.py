from django.apps import AppConfig
from django.contrib.admin import apps as admin_apps


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"
    label = "core"

    def ready(self) -> None:
        import apps.core.images  # noqa: F401  (plafond de pixels de Pillow)
        import apps.core.signals  # noqa: F401


class MizanAdminConfig(admin_apps.AdminConfig):
    """Remplace `django.contrib.admin` : `admin.site` devient le site interne."""

    # Hors détection automatique : `apps.core` reste chargé par CoreConfig.
    default = False
    default_site = "apps.core.admin_site.MizanAdminSite"
