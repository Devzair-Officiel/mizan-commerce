from rest_framework.throttling import UserRateThrottle


class ProductScanRateThrottle(UserRateThrottle):
    """Scan d'emballage : OCR coûteux et secours vision payant (URS-109)."""

    scope = 'product_scan'
