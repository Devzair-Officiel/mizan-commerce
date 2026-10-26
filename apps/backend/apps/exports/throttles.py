from apps.core.throttling import UserRateThrottle


class ExportRenderRateThrottle(UserRateThrottle):
    """PDF et message WhatsApp : rendus coûteux, générés côté serveur (URS-058)."""

    scope = 'exports_render'
