from django.contrib import admin
from django.forms import ModelForm
from django.http import HttpRequest

from .models import User
from .services import set_user_active


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    """Modération des comptes : seuls `is_active`, le nom et le téléphone changent.

    Ni ajout, ni suppression, ni mot de passe (pas d'héritage du UserAdmin natif,
    dont la page « mot de passe » permettrait de le changer). La promotion
    staff/superuser se fait par `manage.py`, jamais ici.
    """

    list_display = (
        "email",
        "full_name",
        "phone",
        "is_active",
        "is_staff",
        "email_verified_at",
        "created_at",
    )
    list_filter = ("is_active", "is_staff", "is_superuser")
    search_fields = ("email", "full_name", "phone")
    ordering = ("-created_at",)
    fieldsets = (
        (None, {"fields": ("id", "email", "full_name", "phone")}),
        ("Accès", {"fields": ("is_active", "is_staff", "is_superuser")}),
        (
            "Dates",
            {
                "fields": (
                    "email_verified_at",
                    "trial_consumed_at",
                    "last_login",
                    "created_at",
                    "updated_at",
                )
            },
        ),
    )
    readonly_fields = (
        "id",
        "email",
        "is_staff",
        "is_superuser",
        "email_verified_at",
        "trial_consumed_at",
        "last_login",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_delete_permission(
        self, request: HttpRequest, obj: User | None = None
    ) -> bool:
        return False

    def save_model(
        self, request: HttpRequest, obj: User, form: ModelForm, change: bool
    ) -> None:
        # Avant l'enregistrement du formulaire : le service lit l'état en base.
        if "is_active" in form.changed_data:
            set_user_active(user=obj, is_active=obj.is_active, actor=request.user)
        super().save_model(request, obj, form, change)
