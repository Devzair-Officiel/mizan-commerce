"""E-mail de rappel du jour J (7 jours avant), par langue du compte.

Écrit hors requête (tâche quotidienne). Aucun montant, ni dans l'objet ni dans le
corps : l'e-mail donne la date et renvoie vers Mizan.
"""
from datetime import date
from typing import Any

from django.conf import settings

from . import date_texts

TEXTS: dict[str, dict[str, str]] = {
    'fr': {
        'subject': 'Votre jour J de zakat approche : {date}',
        'greeting': 'Bonjour {name},',
        'greeting_anonymous': 'Bonjour,',
        'intro': 'Votre jour J de zakat tombe le {date}.',
        'prepare': (
            'Ce jour-là, faites vos comptes dans Mizan : votre trésorerie, vos dettes, '
            'puis vos choix d’avis. Le justificatif se télécharge depuis le résultat.'
        ),
        'open': 'Ouvrir la zakat : {url}',
        'footer': (
            'Vous recevez cet e-mail car « Me prévenir par e-mail 7 jours avant » est '
            'activé dans vos réglages de la zakat. Pour ne plus le recevoir : {url}'
        ),
    },
    'en': {
        'subject': 'Your zakat day is coming up: {date}',
        'greeting': 'Hello {name},',
        'greeting_anonymous': 'Hello,',
        'intro': 'Your zakat day falls on {date}.',
        'prepare': (
            'On that day, do your accounts in Mizan: your cash, your debts, then your '
            'opinion choices. The statement can be downloaded from the result.'
        ),
        'open': 'Open zakat: {url}',
        'footer': (
            'You are receiving this email because "Email me 7 days before" is on in '
            'your zakat settings. To stop receiving it: {url}'
        ),
    },
    'ar': {
        'subject': 'يقترب يوم حساب زكاتك: {date}',
        'greeting': 'مرحبًا {name}،',
        'greeting_anonymous': 'مرحبًا،',
        'intro': 'يوافق يوم حساب زكاتك {date}.',
        'prepare': (
            'في ذلك اليوم، احسب زكاتك في ميزان: نقدك وديونك، ثم اختياراتك بين الآراء. '
            'ويمكن تنزيل البيان من صفحة النتيجة.'
        ),
        'open': 'فتح الزكاة: {url}',
        'footer': (
            'تصلك هذه الرسالة لأن «نبّهني بالبريد الإلكتروني قبل 7 أيام» مفعّل في '
            'إعدادات الزكاة. لإيقافها: {url}'
        ),
    },
}


def _dates(day: date, language: str) -> str:
    """« 22 février 2027 (15 ramadan 1448) » ; sans l'hégirien hors de sa plage."""
    gregorian = date_texts.gregorian_text(day, language)
    hijri = date_texts.hijri_text(day, language)
    return f'{gregorian} ({hijri})' if hijri else gregorian


def build_email(user: Any, day: date) -> tuple[str, str]:
    """(objet, corps) dans la langue du compte (français par défaut)."""
    language = user.language if user.language in TEXTS else 'fr'
    texts = TEXTS[language]
    dates = _dates(day, language)
    greeting = (
        texts['greeting'].format(name=user.full_name)
        if user.full_name
        else texts['greeting_anonymous']
    )
    lines = [
        greeting,
        '',
        texts['intro'].format(date=dates),
        texts['prepare'],
        '',
        texts['open'].format(url=f'{settings.FRONTEND_URL}/zakat'),
        '',
        texts['footer'].format(url=f'{settings.FRONTEND_URL}/zakat/reglages'),
    ]
    return texts['subject'].format(date=dates), '\n'.join(lines)
