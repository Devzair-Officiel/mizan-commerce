"""Justificatif PDF (Z2b) : contenu tiré de `compute_totals` et de la fiche, langues,
statuts, déterminisme, aucun mot lié à l'usure."""
import re
from decimal import Decimal

from django.test import TestCase

from apps.accounts.models import User
from apps.invoices.test_pdf import text_pages
from apps.shops.models import Shop, ShopMember
from .models import ZakatCalculation
from .pdf import build_zakat_pdf

CHOICES = {
    'calendar': 'hijri', 'nisab_method': 'gold', 'nisab_unit_price': '50.00',
    'nisab_price_updated_at': '2025-02-20T09:00:00+00:00',
    'stock_valuation': 'sale', 'receivables_mode': 'yearly', 'debts_mode': 'all',
    'ownership_share': '100.00',
}
# Riba et ce qui s'y rattache (référentiel § 1), en français, anglais et arabe.
USURY = re.compile(
    r'usur|riba|intér[eê]t|interest|épargne|savings|placement|investi|emprunt|'
    r'loan|borrow|ربا|فائدة|فوائد|قرض|ادخار|استثمار',
    re.IGNORECASE,
)


def _flat(content: bytes) -> str:
    """Texte du PDF sur une ligne : les retours à la ligne de la mise en page s'effacent."""  # noqa: E501
    return ' '.join(' '.join(text_pages(content)).split())


class ZakatPdfTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='pdf@example.com', password='Pass123!Strong', full_name='Salma Idrissi',  # noqa: E501
        )
        self.shop = Shop.objects.create(name='Épicerie Salma', currency='EUR')
        ShopMember.objects.create(shop=self.shop, user=self.user, role='owner')

    def _calc(self, **choices) -> ZakatCalculation:
        return ZakatCalculation.objects.create(
            shop=self.shop, user=self.user, reference_date='2025-03-01',
            hawl_calendar='hijri', hawl_year=1446, currency='EUR',
            cash_amount=Decimal('6000.00'), stock_sale_value=Decimal('5000.00'),
            stock_purchase_value=Decimal('3000.00'),
            receivable_items=[
                {'order_id': None, 'label': 'Atelier Nour', 'amount': '400.00', 'doubtful': False},  # noqa: E501
                {'order_id': None, 'label': 'Client parti', 'amount': '250.00', 'doubtful': True},  # noqa: E501
            ],
            other_assets=[
                {'category': 'gold_silver', 'label': 'Pièces', 'amount': '1000.00', 'counted': True},  # noqa: E501
                {'category': 'jewelry', 'label': 'Bijoux portés', 'amount': '700.00', 'counted': False},  # noqa: E501
            ],
            debt_items=[
                {'category': 'supplier', 'label': 'Grossiste', 'amount': '1400.00', 'amount_within_12_months': '900.00'},  # noqa: E501
            ],
            choices_snapshot={**CHOICES, **choices},
        )

    def _text(self, calc: ZakatCalculation) -> str:
        calc.refresh_from_db()
        return _flat(build_zakat_pdf(calc))

    def test_french_content_from_totals_and_sheet(self):
        text = self._text(self._calc())
        for expected in (
            'Justificatif de zakat 1446 H', 'Épicerie Salma', 'Établi pour Salma Idrissi',  # noqa: E501
            '1 mars 2025', '1 ramadan 1446', 'État au',
            'Trésorerie : caisse et banque', '6 000,00 €',
            'Stock au prix de vente au jour J', '5 000,00 €',
            'Créances sûres', '400,00 €', 'Autre bien : Pièces', '1 000,00 €',
            'Toutes les dettes', '1 400,00 €',
            # 6 000 + 5 000 + 400 + 1 000 − 1 400 = 11 000 ; × 2,5 % = 275.
            'Base', '11 000,00 €', "Seuil, 85 g d'or", '4 250,00 €',
            'Prix du gramme 50,00 €, saisi le 20 février 2025',
            'Votre part de la boutique', '100 %', 'Taux, année hégirienne', '2,5 %',
            'Zakat estimée', '275,00 €',
            'HORS BASE', 'Créance douteuse, Client parti', '250,00 €',
            'Bijoux portés', '700,00 €', "Biens d'usage",
            "VOS CHOIX D'AVIS", "Or, 85 g", "Ceux qui jugent que l'argent ne reflète plus la richesse",  # noqa: E501
            'Chaféites ; Malikites pour les ventes du commerçant régulier',
            "ancien avis d'al-Shâfi'î", 'LIMITES', 'Associés : chacun verse sur sa part.',  # noqa: E501
            "Estimation. Les choix d'avis sont les vôtres.",
        ):
            self.assertIn(expected, text)
        # Le verdict avant le montant ; « à l'encaissement » seulement dans ce mode.
        self.assertLess(text.index('Au-dessus du seuil'), text.index('Zakat à verser maintenant'))  # noqa: E501
        self.assertNotIn("Zakat à verser à l'encaissement", text)

    def test_on_collection_shows_both_amounts(self):
        text = self._text(self._calc(receivables_mode='on_collection'))
        self.assertIn("Zakat à verser à l'encaissement de vos créances", text)
        # Maintenant : (11 000 − 400) × 2,5 % = 265 ; à l'encaissement : 10.
        self.assertIn('265,00 €', text)
        self.assertIn('10,00 €', text)

    def test_english_account(self):
        self.user.language = 'en'
        self.user.save(update_fields=['language'])
        text = self._text(self._calc())
        for expected in (
            'Zakat statement 1446 AH', 'Prepared for Salma Idrissi', 'March 1, 2025',
            '1 Ramadan 1446', 'Above the threshold', '€11,000.00', '€275.00',
            'Hanafis, Malikis, Hanbalis', 'Estimate. The opinions chosen are yours.',
        ):
            self.assertIn(expected, text)

    def test_arabic_account_gets_french(self):
        self.user.language = 'ar'
        self.user.save(update_fields=['language'])
        self.assertIn('Justificatif de zakat 1446 H', self._text(self._calc()))

    def test_missing_choice_not_computed(self):
        text = self._text(self._calc(debts_mode=None))
        self.assertIn('Choix à faire', text)
        self.assertIn('Reste à choisir : dettes déduites.', text)
        self.assertIn('Non calculée', text)
        self.assertIn('Dettes, choix à faire', text)
        self.assertIn('À choisir', text)

    def test_unknown_threshold(self):
        text = self._text(self._calc(nisab_unit_price=None, nisab_price_updated_at=None))  # noqa: E501
        self.assertIn('Seuil inconnu', text)
        self.assertIn('Prix du gramme non saisi', text)
        self.assertIn('Non calculée', text)

    def test_below_threshold(self):
        text = self._text(self._calc(nisab_unit_price='500.00'))
        self.assertIn('Pas de zakat sur ce que vous avez déclaré', text)
        self.assertIn('Votre base de 11 000,00 € reste sous le seuil de 42 500,00 €.', text)  # noqa: E501
        self.assertIn('0,00 €', text)

    def test_share_applies_to_shop_amounts(self):
        text = self._text(self._calc(ownership_share='50.00'))
        # (6 000 + 5 000 + 400 − 1 400) × 50 % + 1 000 = 6 000.
        self.assertIn('50 %', text)
        self.assertIn('3 000,00 €', text)
        self.assertIn('6 000,00 €', text)

    def test_deterministic(self):
        calc = self._calc()
        calc.refresh_from_db()
        self.assertEqual(build_zakat_pdf(calc), build_zakat_pdf(calc))

    def test_no_usury_word(self):
        calc = self._calc(receivables_mode='on_collection')
        for language in ('fr', 'en'):
            self.user.language = language
            self.user.save(update_fields=['language'])
            self.assertIsNone(USURY.search(self._text(calc)), language)
