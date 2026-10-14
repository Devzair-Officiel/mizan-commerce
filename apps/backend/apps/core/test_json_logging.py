import json
import logging

from django.test import SimpleTestCase

from apps.core.json_logging import JsonFormatter
from apps.core.redaction import FILTERED


def _format(message: str, *args: object, exc: bool = False) -> dict[str, str]:
    record = logging.LogRecord(
        "apps.test", logging.ERROR, __file__, 1, message, args, None
    )
    if exc:
        try:
            raise ValueError("client awa@example.com")
        except ValueError:
            import sys

            record.exc_info = sys.exc_info()
    return json.loads(JsonFormatter().format(record))


class JsonFormatterTest(SimpleTestCase):
    def test_one_json_object_per_record(self) -> None:
        entry = _format("commande %s créée", 42)
        self.assertEqual(entry["level"], "ERROR")
        self.assertEqual(entry["logger"], "apps.test")
        self.assertEqual(entry["message"], "commande 42 créée")
        self.assertTrue(entry["time"].endswith("+00:00"))
        self.assertNotIn("exc", entry)

    def test_message_is_masked(self) -> None:
        entry = _format(
            "GET /api/x?token=abc&page=2 par %s, %s",
            "awa@example.com",
            "+221 77 123 45 67",
        )
        self.assertEqual(
            entry["message"],
            f"GET /api/x?token={FILTERED}&page=2 par [email], [phone]",
        )

    def test_exception_is_kept_and_masked(self) -> None:
        entry = _format("échec", exc=True)
        self.assertIn("ValueError: client [email]", entry["exc"])
        self.assertNotIn("awa@example.com", json.dumps(entry))
