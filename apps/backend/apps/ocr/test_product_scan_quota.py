"""Lectures avancées du scan d'emballage (URS-109) : plafond mensuel de la
structuration du texte, par boutique et par formule.

- réservation avant l'appel à ai-service, `structure` envoyé seulement avec
  une place ; remboursement si la structuration n'aboutit pas ;
- plafond atteint : règles locales et avertissement, jamais une erreur ;
- face puis dos d'un même scan : une seule place ;
- multi-tenant, formule effective (essai Boutique), concurrence réelle.
"""
from __future__ import annotations

import threading
from unittest.mock import patch

from django.core.cache import caches
from django.db import connection
from django.test import SimpleTestCase, TestCase, TransactionTestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.models import AuditLog
from apps.shops.models import Shop
from apps.subscriptions.models import SubscriptionPlan
from config.settings.base import ai_provider_enabled

from .ai_client import AiServiceUnavailableError, ScanPhoto
from .models import ProductScanUsage
from .services import (
    release_text_scan,
    reserve_text_scan,
    scan_product_image,
    scan_quota_month,
)
from .test_product_scan import (
    _CACHES,
    JPEG_BYTES,
    URL,
    field,
    jpeg,
    local_result,
    make_user_shop,
    ziyada_result,
)


def text_count(shop: Shop) -> int:
    usage = ProductScanUsage.objects.filter(shop=shop, month=scan_quota_month(shop)).first()  # noqa: E501
    return usage.text_count if usage else 0


def set_free_text_limit(limit: int | None) -> None:
    SubscriptionPlan.objects.filter(code=SubscriptionPlan.CODE_FREE).update(
        max_text_scans_per_month=limit,
    )


@override_settings(CACHES=_CACHES, PRODUCT_SCAN_AI_ENABLED=True)
class TextQuotaViewTest(TestCase):
    def setUp(self) -> None:
        caches['product_scans'].clear()
        self.user, self.shop = make_user_shop('text-quota@example.com')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.local = patch('apps.ocr.services.scan_product_locally_with_ai_service').start()  # noqa: E501
        patch('apps.ocr.services.scan_product_vision_with_ai_service').start()
        patch('apps.ocr.services.lookup_barcode', return_value=None).start()
        self.addCleanup(patch.stopall)

    def _post(self, face: bytes = JPEG_BYTES, back: bytes | None = None) -> object:
        data = {'image': jpeg(face)}
        if back is not None:
            data['image_back'] = jpeg(back)
        return self.client.post(URL, data, format='multipart')

    def _audit_text(self) -> str:
        log = AuditLog.objects.filter(shop_id=self.shop.pk, action='product_scan').latest('created_at')  # noqa: E501
        return log.changes['text']

    def test_structured_scan_takes_one_place(self) -> None:
        self.local.return_value = ziyada_result()
        response = self._post()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIs(self.local.call_args.kwargs['structure'], True)
        self.assertEqual(text_count(self.shop), 1)
        self.assertEqual(response.data['warnings'], [])
        self.assertEqual(self._audit_text(), 'done')

    def test_place_refunded_when_structuring_does_not_happen(self) -> None:
        for structuring in ('disabled', 'failed'):
            with self.subTest(structuring=structuring):
                self.local.return_value = local_result(
                    product_name=field('ZIYADA', 0.8), structuring=structuring,
                )
                response = self._post()
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(text_count(self.shop), 0)
                self.assertEqual(response.data['warnings'], [])

    def test_place_refunded_when_ai_service_unreachable(self) -> None:
        self.local.side_effect = AiServiceUnavailableError('down')
        response = self._post()
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(text_count(self.shop), 0)

    def test_quota_reached_falls_back_to_rules_with_warning(self) -> None:
        ProductScanUsage.objects.create(
            shop=self.shop, month=scan_quota_month(self.shop), text_count=10,
        )
        self.local.return_value = local_result(
            product_name=field('ZIYADA', 0.8), structuring='skipped',
        )
        response = self._post()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIs(self.local.call_args.kwargs['structure'], False)
        self.assertEqual(response.data['warnings'], ['text_quota_reached'])
        self.assertEqual(response.data['fields']['product_name']['value'], 'ZIYADA')
        self.assertEqual(text_count(self.shop), 10)
        self.assertEqual(self._audit_text(), 'quota_reached')

    @override_settings(PRODUCT_SCAN_AI_ENABLED=False)
    def test_no_provider_asks_nothing_and_counts_nothing(self) -> None:
        self.local.return_value = local_result(product_name=field('ZIYADA', 0.8))
        response = self._post()
        self.assertIs(self.local.call_args.kwargs['structure'], False)
        self.assertEqual(response.data['warnings'], [])
        self.assertFalse(ProductScanUsage.objects.exists())

    def test_face_then_back_takes_one_place(self) -> None:
        self.local.return_value = ziyada_result()
        self._post()
        self._post(back=JPEG_BYTES + b'back')
        self.assertIs(self.local.call_args.kwargs['structure'], True)
        self.assertEqual(text_count(self.shop), 1)
        # Le dos ne reprend la place de la face qu'une fois.
        self._post(back=JPEG_BYTES + b'other back')
        self.assertEqual(text_count(self.shop), 2)

    def test_back_of_another_face_takes_its_own_place(self) -> None:
        self.local.return_value = ziyada_result()
        self._post()
        self._post(face=JPEG_BYTES + b'other face', back=JPEG_BYTES + b'back')
        self.assertEqual(text_count(self.shop), 2)

    def test_back_still_free_after_a_failed_back(self) -> None:
        self.local.return_value = ziyada_result()
        self._post()
        self.local.return_value = local_result(structuring='failed')
        self._post(back=JPEG_BYTES + b'back')
        self.local.return_value = ziyada_result()
        self._post(back=JPEG_BYTES + b'back')
        self.assertEqual(text_count(self.shop), 1)

    def test_back_place_of_another_shop_is_not_shared(self) -> None:
        self.local.return_value = ziyada_result()
        self._post()
        other_user, other = make_user_shop('text-quota-other@example.com')
        client = APIClient()
        client.force_authenticate(user=other_user)
        client.post(URL, {'image': jpeg(), 'image_back': jpeg(JPEG_BYTES + b'back')}, format='multipart')  # noqa: E501
        self.assertEqual(text_count(other), 1)
        self.assertEqual(text_count(self.shop), 1)

    def test_full_counter_of_another_shop_is_invisible(self) -> None:
        _, other = make_user_shop('text-quota-full@example.com')
        ProductScanUsage.objects.create(shop=other, month=scan_quota_month(other), text_count=10)  # noqa: E501
        self.local.return_value = ziyada_result()
        response = self._post()
        self.assertEqual(response.data['warnings'], [])
        self.assertEqual(text_count(self.shop), 1)
        self.assertEqual(text_count(other), 10)

    def test_redis_down_still_counts_the_back(self) -> None:
        self.local.return_value = ziyada_result()
        with patch.object(caches['product_scans'], 'set', side_effect=ConnectionError()), \
                patch.object(caches['product_scans'], 'delete', side_effect=ConnectionError()):  # noqa: E501
            self._post()
            response = self._post(back=JPEG_BYTES + b'back')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(text_count(self.shop), 2)


class TextQuotaTest(TestCase):
    def test_trial_counts_as_boutique(self) -> None:
        from apps.accounts.models import User
        from apps.shops.models import ShopMember
        from apps.subscriptions.services import start_trial_or_default

        user = User.objects.create_user(email='trial-text@example.com', password='Pass123!Strong')  # noqa: E501
        shop = Shop.objects.create(name='Essai')
        ShopMember.objects.create(shop=shop, user=user, role='owner')
        start_trial_or_default(shop=shop, user=user)
        month = scan_quota_month(shop)
        ProductScanUsage.objects.create(shop=shop, month=month, text_count=59)
        self.assertTrue(reserve_text_scan(shop, month))
        self.assertFalse(reserve_text_scan(shop, month))

    def test_unlimited_plan_still_counts(self) -> None:
        set_free_text_limit(None)
        _, shop = make_user_shop('unlimited-text@example.com')
        month = scan_quota_month(shop)
        ProductScanUsage.objects.create(shop=shop, month=month, text_count=10_000)
        self.assertTrue(reserve_text_scan(shop, month))
        self.assertEqual(text_count(shop), 10_001)

    def test_zero_quota_creates_nothing(self) -> None:
        set_free_text_limit(0)
        _, shop = make_user_shop('no-text@example.com')
        self.assertFalse(reserve_text_scan(shop, scan_quota_month(shop)))
        self.assertFalse(ProductScanUsage.objects.exists())

    def test_release_never_goes_below_zero_nor_touches_vision(self) -> None:
        _, shop = make_user_shop('release-text@example.com')
        month = scan_quota_month(shop)
        ProductScanUsage.objects.create(shop=shop, month=month, vision_count=2)
        release_text_scan(shop, month)
        usage = ProductScanUsage.objects.get(shop=shop)
        self.assertEqual((usage.text_count, usage.vision_count), (0, 2))


class AiProviderSettingTest(SimpleTestCase):
    """`PRODUCT_SCAN_AI_ENABLED` dérive de `VISION_PROVIDER`, comme ai-service."""

    def test_none_or_empty_disables(self) -> None:
        for value in (None, '', '  ', 'none', 'NONE', ' None '):
            with self.subTest(value=value):
                self.assertFalse(ai_provider_enabled(value))

    def test_a_provider_enables(self) -> None:
        self.assertTrue(ai_provider_enabled('openai'))


@override_settings(CACHES=_CACHES, PRODUCT_SCAN_AI_ENABLED=True)
class TextQuotaConcurrencyTest(TransactionTestCase):
    """Six scans simultanés pour trois places : trois structurés, trois en règles
    locales avec l'avertissement, jamais plus que le plafond."""

    serialized_rollback = True

    def test_simultaneous_scans_never_exceed_the_cap(self) -> None:
        set_free_text_limit(3)
        user, shop = make_user_shop('race-text@example.com')
        barrier = threading.Barrier(6)
        warnings: list[list[str]] = []

        def fake_local(*, face: ScanPhoto, back: ScanPhoto | None, structure: bool) -> object:  # noqa: E501
            return ziyada_result() if structure else local_result(structuring='skipped')

        def worker(index: int) -> None:
            try:
                barrier.wait()
                result = scan_product_image(
                    shop=Shop.objects.get(pk=shop.pk), user=user,
                    face=ScanPhoto(JPEG_BYTES + bytes([index]), 'image/jpeg'),
                )
                warnings.append(result.warnings)
            finally:
                connection.close()

        with patch('apps.ocr.services.scan_product_locally_with_ai_service', side_effect=fake_local), \
                patch('apps.ocr.services.lookup_barcode', return_value=None):  # noqa: E501
            threads = [threading.Thread(target=worker, args=(i,)) for i in range(6)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=20)

        self.assertEqual(len(warnings), 6)
        self.assertEqual(sorted(len(w) for w in warnings), [0, 0, 0, 1, 1, 1])
        self.assertEqual(ProductScanUsage.objects.get(shop=shop).text_count, 3)
