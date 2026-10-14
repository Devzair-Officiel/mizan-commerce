"""Textes des rappels automatiques et de l'e-mail du résumé du jour, par langue.

Écrits hors requête (tâche horaire) : la langue est celle du compte du
propriétaire (`User.language`). Les pluriels suivent les formes de chaque langue :
`one`/`other` en français et en anglais, `one`/`two`/`few`/`other` en arabe.
"""

from decimal import Decimal

PluralForms = dict[str, str]

TEXTS: dict[str, dict[str, str | PluralForms]] = {
    'fr': {
        'unpaid_title': 'Relancer {name}',
        'pending_title': {
            'one': '{count} commande à préparer depuis plus de {days}',
            'other': '{count} commandes à préparer depuis plus de {days}',
        },
        'days': {'one': '{count} jour', 'other': '{count} jours'},
        'subject': 'Votre résumé du jour, {shop}',
        'greeting': 'Bonjour {name},',
        'intro': "Voici ce qui vous attend aujourd'hui.",
        'to_prepare': {
            'one': '{count} commande à préparer',
            'other': '{count} commandes à préparer',
        },
        'unpaid': {
            'one': '{count} commande impayée, {amount} à encaisser',
            'other': '{count} commandes impayées, {amount} à encaisser',
        },
        'reminders': {
            'one': "{count} rappel aujourd'hui",
            'other': "{count} rappels aujourd'hui",
        },
        'overdue': 'en retard',
        'open_app': 'Ouvrir vos rappels : {url}',
        'footer': (
            'Vous recevez cet e-mail car le résumé du jour est activé dans vos '
            'rappels automatiques. Pour ne plus le recevoir, désactivez-le dans '
            'Rappels.'
        ),
    },
    'en': {
        'unpaid_title': 'Follow up with {name}',
        'pending_title': {
            'one': '{count} order to prepare for more than {days}',
            'other': '{count} orders to prepare for more than {days}',
        },
        'days': {'one': '{count} day', 'other': '{count} days'},
        'subject': 'Your daily summary, {shop}',
        'greeting': 'Hello {name},',
        'intro': "Here is what's waiting for you today.",
        'to_prepare': {
            'one': '{count} order to prepare',
            'other': '{count} orders to prepare',
        },
        'unpaid': {
            'one': '{count} unpaid order, {amount} to collect',
            'other': '{count} unpaid orders, {amount} to collect',
        },
        'reminders': {
            'one': '{count} reminder today',
            'other': '{count} reminders today',
        },
        'overdue': 'overdue',
        'open_app': 'Open your reminders: {url}',
        'footer': (
            'You receive this email because the daily summary is turned on in your '
            'automatic reminders. To stop it, turn it off in Reminders.'
        ),
    },
    'ar': {
        'unpaid_title': 'متابعة {name}',
        'pending_title': {
            'one': 'طلب واحد بانتظار التحضير منذ أكثر من {days}',
            'two': 'طلبان بانتظار التحضير منذ أكثر من {days}',
            'few': '{count} طلبات بانتظار التحضير منذ أكثر من {days}',
            'other': '{count} طلبًا بانتظار التحضير منذ أكثر من {days}',
        },
        'days': {
            'one': 'يوم واحد', 'two': 'يومين',
            'few': '{count} أيام', 'other': '{count} يومًا',
        },
        'subject': 'ملخص يومك، {shop}',
        'greeting': 'مرحبًا {name}،',
        'intro': 'إليك ما ينتظرك اليوم.',
        'to_prepare': {
            'one': 'طلب واحد للتحضير',
            'two': 'طلبان للتحضير',
            'few': '{count} طلبات للتحضير',
            'other': '{count} طلبًا للتحضير',
        },
        'unpaid': {
            'one': 'طلب واحد غير مدفوع، {amount} للتحصيل',
            'two': 'طلبان غير مدفوعين، {amount} للتحصيل',
            'few': '{count} طلبات غير مدفوعة، {amount} للتحصيل',
            'other': '{count} طلبًا غير مدفوع، {amount} للتحصيل',
        },
        'reminders': {
            'one': 'تذكير واحد اليوم',
            'two': 'تذكيران اليوم',
            'few': '{count} تذكيرات اليوم',
            'other': '{count} تذكيرًا اليوم',
        },
        'overdue': 'متأخر',
        'open_app': 'افتح تذكيراتك: {url}',
        'footer': (
            'تصلك هذه الرسالة لأن ملخص اليوم مفعّل في التذكيرات التلقائية. '
            'لإيقافه، عطّله من صفحة التذكيرات.'
        ),
    },
}


def _plural_form(language: str, count: int) -> str:
    if language == 'ar':
        if count == 1:
            return 'one'
        if count == 2:
            return 'two'
        return 'few' if 3 <= count % 100 <= 10 else 'other'
    if language == 'fr':
        return 'one' if count in (0, 1) else 'other'
    return 'one' if count == 1 else 'other'


def text(language: str, key: str, count: int | None = None, **params: object) -> str:
    """Texte `key` dans `language` (français par défaut), pluriel selon `count`."""
    entry = TEXTS.get(language, TEXTS['fr'])[key]
    if isinstance(entry, dict):
        entry = entry[_plural_form(language, count or 0)]
    return entry.format(count=count, **params)


def money(amount: Decimal, currency: str, language: str) -> str:
    """« 1 234,50 EUR » (français, arabe) ou « 1,234.50 EUR » (anglais)."""
    formatted = f'{amount:,.2f}'
    if language != 'en':
        formatted = formatted.replace(',', ' ').replace('.', ',')
    return f'{formatted} {currency}'
