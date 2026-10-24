"""Textes des messages de facturation au propriétaire, par langue du compte.

Écrits hors requête (tâches périodiques). Ni montant, ni carte, ni donnée de
paiement : la date limite et un lien vers la page de l'abonnement, construit
depuis `settings.FRONTEND_URL`. Dates et heures dans le fuseau de la boutique.

Français et anglais ; toute autre langue reçoit l'anglais (pas de texte arabe
validé à ce jour).
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from babel import Locale
from babel.dates import format_date, format_time
from django.conf import settings

from .services import PAST_DUE_GRACE_DAYS

FALLBACK_LANGUAGE = 'en'
SUBSCRIPTION_PATH = '/settings/subscription'
SECONDS_PER_DAY = 86_400

TEXTS: dict[str, dict[str, Any]] = {
    'fr': {
        'greeting': 'Bonjour {name},',
        'greeting_anonymous': 'Bonjour,',
        'moment': '{date} à {time} ({tz})',
        'free_plan': 'Découverte',
        'support': 'Une question ? Écrivez-nous à {email}.',
        'days': {'one': '{count} jour', 'other': '{count} jours'},
        'nouns': {
            'products': {
                'products': {'one': 'article actif', 'other': 'articles actifs'},
                'services': {'one': 'service actif', 'other': 'services actifs'},
                'both': {
                    'one': 'article ou service actif',
                    'other': 'articles et services actifs',
                },
            },
            'orders_this_month': {'one': 'vente', 'other': 'ventes'},
            'customers': {'one': 'client actif', 'other': 'clients actifs'},
            'members': {'one': 'membre', 'other': 'membres'},
        },
        'limit_line': {
            'products': '- {count} {noun}',
            'orders_this_month': '- {count} {noun} par mois',
            'customers': '- {count} {noun}',
            'members': '- {count} {noun}, propriétaire compris',
        },
        'reached_line': {
            'products': (
                '- Vous avez {count} {noun}, la limite est {limit} : '
                'vous ne pourrez plus en créer.'
            ),
            'orders_this_month': (
                '- Vous avez enregistré {count} {noun} ce mois-ci, la limite est '
                '{limit} : vous ne pourrez plus en enregistrer avant le mois prochain.'
            ),
            'customers': (
                '- Vous avez {count} {noun}, la limite est {limit} : '
                'vous ne pourrez plus en ajouter.'
            ),
            'members': (
                '- Votre boutique compte {count} {noun}, la limite est {limit} : '
                'vous ne pourrez plus en inviter.'
            ),
        },
        'trial_subject': 'Votre essai gratuit Mizan se termine dans moins de 24 heures',
        'trial_intro': 'Votre essai gratuit se termine le {moment}.',
        'trial_after': (
            'Votre boutique passera ensuite sur la formule {free}. Toutes vos données '
            'sont conservées ; ces limites s’appliqueront :'
        ),
        'trial_reached': 'Votre boutique atteint déjà certaines de ces limites :',
        'trial_keep': (
            'Pour garder toutes vos possibilités, choisissez une formule avant la fin '
            'de l’essai : {url}'
        ),
        'past_due_subject': {
            1: 'Le paiement de votre abonnement Mizan n’a pas abouti',
            2: 'Rappel : le paiement de votre abonnement Mizan est en attente',
            3: 'Dernier rappel : votre abonnement Mizan sera résilié dans {days}',
        },
        'past_due_intro': {
            1: (
                'Le dernier paiement de votre abonnement {plan} n’a pas abouti. '
                'Votre accès est conservé jusqu’au {moment}.'
            ),
            2: (
                'Le paiement de votre abonnement {plan} n’a toujours pas abouti. '
                'Il vous reste {days} pour le régler : votre accès est conservé '
                'jusqu’au {moment}.'
            ),
            3: (
                'Dernier rappel : le paiement de votre abonnement {plan} n’a '
                'toujours pas abouti. Il vous reste {days}, jusqu’au {moment}.'
            ),
        },
        'past_due_after': (
            'Sans paiement d’ici là, votre abonnement sera résilié et votre boutique '
            'passera sur la formule {free}. Toutes vos données seront conservées.'
        ),
        'past_due_how': (
            'Pour régler ou mettre à jour votre moyen de paiement, ouvrez la page de '
            'votre abonnement, d’où s’ouvre l’espace de paiement sécurisé : {url}'
        ),
        'past_due_paid': 'Si vous avez déjà réglé, ne tenez pas compte de ce message.',
        'ended_subject': 'Votre abonnement Mizan est résilié',
        'ended_intro': (
            'Le paiement de votre abonnement {plan} n’a pas abouti dans le délai de '
            '{grace} jours : votre abonnement est résilié depuis le {moment}.'
        ),
        'ended_after': (
            'Votre boutique est passée sur la formule {free}. Toutes vos données sont '
            'conservées ; les limites de cette formule s’appliquent désormais.'
        ),
        'ended_resubscribe': (
            'Pour vous réabonner, choisissez une formule depuis la page de votre '
            'abonnement : {url}'
        ),
    },
    'en': {
        'greeting': 'Hello {name},',
        'greeting_anonymous': 'Hello,',
        'moment': '{date} at {time} ({tz})',
        'free_plan': 'Discovery',
        'support': 'Any questions? Write to us at {email}.',
        'days': {'one': '{count} day', 'other': '{count} days'},
        'nouns': {
            'products': {
                'products': {'one': 'active item', 'other': 'active items'},
                'services': {'one': 'active service', 'other': 'active services'},
                'both': {
                    'one': 'active item or service',
                    'other': 'active items and services',
                },
            },
            'orders_this_month': {'one': 'sale', 'other': 'sales'},
            'customers': {'one': 'active customer', 'other': 'active customers'},
            'members': {'one': 'member', 'other': 'members'},
        },
        'limit_line': {
            'products': '- {count} {noun}',
            'orders_this_month': '- {count} {noun} per month',
            'customers': '- {count} {noun}',
            'members': '- {count} {noun}, owner included',
        },
        'reached_line': {
            'products': (
                '- You have {count} {noun}, the limit is {limit}: '
                'you will not be able to create more.'
            ),
            'orders_this_month': (
                '- You have recorded {count} {noun} this month, the limit is {limit}: '
                'you will not be able to record more until next month.'
            ),
            'customers': (
                '- You have {count} {noun}, the limit is {limit}: '
                'you will not be able to add more.'
            ),
            'members': (
                '- Your shop has {count} {noun}, the limit is {limit}: '
                'you will not be able to invite more.'
            ),
        },
        'trial_subject': 'Your Mizan free trial ends in less than 24 hours',
        'trial_intro': 'Your free trial ends on {moment}.',
        'trial_after': (
            'Your shop will then move to the {free} plan. All your data is kept; '
            'these limits will apply:'
        ),
        'trial_reached': 'Your shop already reaches some of these limits:',
        'trial_keep': (
            'To keep everything you can do now, choose a plan before your trial '
            'ends: {url}'
        ),
        'past_due_subject': {
            1: 'Your Mizan subscription payment did not go through',
            2: 'Reminder: your Mizan subscription payment is pending',
            3: 'Final reminder: your Mizan subscription will end in {days}',
        },
        'past_due_intro': {
            1: (
                'The latest payment for your {plan} subscription did not go through. '
                'You keep your access until {moment}.'
            ),
            2: (
                'The payment for your {plan} subscription still has not gone through. '
                'You have {days} left to pay: you keep your access until {moment}.'
            ),
            3: (
                'Final reminder: the payment for your {plan} subscription still has '
                'not gone through. You have {days} left, until {moment}.'
            ),
        },
        'past_due_after': (
            'Without payment by then, your subscription will end and your shop will '
            'move to the {free} plan. All your data will be kept.'
        ),
        'past_due_how': (
            'To pay or update your payment method, open your subscription page, from '
            'which the secure payment area opens: {url}'
        ),
        'past_due_paid': 'If you have already paid, please disregard this message.',
        'ended_subject': 'Your Mizan subscription has ended',
        'ended_intro': (
            'The payment for your {plan} subscription did not go through within '
            '{grace} days: your subscription ended on {moment}.'
        ),
        'ended_after': (
            'Your shop has moved to the {free} plan. All your data is kept; this '
            'plan’s limits now apply.'
        ),
        'ended_resubscribe': (
            'To subscribe again, choose a plan from your subscription page: {url}'
        ),
    },
}


def language_of(user: Any) -> str:
    """Langue du compte si elle a des textes, l'anglais sinon (arabe compris)."""
    return user.language if user.language in TEXTS else FALLBACK_LANGUAGE


def subscription_url() -> str:
    return settings.FRONTEND_URL.rstrip('/') + SUBSCRIPTION_PATH


def trial_ending_email(
    user: Any,
    shop: Any,
    ends_at: datetime,
    limits: Sequence[tuple[str, int]],
    reached: Sequence[tuple[str, int, int]],
) -> tuple[str, str]:
    """(objet, corps) du rappel de fin d'essai.

    `limits` : (compteur, limite de Découverte) ; `reached` : (compteur, usage,
    limite) pour chaque limite déjà atteinte ou dépassée.
    """
    language = language_of(user)
    texts = TEXTS[language]
    free = texts['free_plan']
    lines = [
        _greeting(user, texts),
        '',
        texts['trial_intro'].format(moment=_moment(ends_at, shop, language)),
        '',
        texts['trial_after'].format(free=free),
        *(_counter_line(language, shop, 'limit_line', key, n) for key, n in limits),
    ]
    if reached:
        lines += ['', texts['trial_reached']]
        lines += [
            _counter_line(language, shop, 'reached_line', key, count, limit=limit)
            for key, count, limit in reached
        ]
    lines += ['', texts['trial_keep'].format(url=subscription_url())]
    return texts['trial_subject'], _with_footer(lines, texts)


def past_due_email(
    user: Any, shop: Any, stage: int, plan_name: str, deadline: datetime, now: datetime,
) -> tuple[str, str]:
    """(objet, corps) d'un rappel de paiement en retard (étapes 1 à 3)."""
    language = language_of(user)
    texts = TEXTS[language]
    days = _days_text(language, deadline, now)
    moment = _moment(deadline, shop, language)
    lines = [
        _greeting(user, texts),
        '',
        texts['past_due_intro'][stage].format(plan=plan_name, days=days, moment=moment),
        '',
        texts['past_due_after'].format(free=texts['free_plan']),
        '',
        texts['past_due_how'].format(url=subscription_url()),
        '',
        texts['past_due_paid'],
    ]
    subject = texts['past_due_subject'][stage].format(days=days)
    return subject, _with_footer(lines, texts)


def subscription_ended_email(
    user: Any, shop: Any, plan_name: str, ended_at: datetime,
) -> tuple[str, str]:
    """(objet, corps) de la fin d'abonnement faute de paiement."""
    language = language_of(user)
    texts = TEXTS[language]
    lines = [
        _greeting(user, texts),
        '',
        texts['ended_intro'].format(
            plan=plan_name, grace=PAST_DUE_GRACE_DAYS,
            moment=_moment(ended_at, shop, language),
        ),
        '',
        texts['ended_after'].format(free=texts['free_plan']),
        '',
        texts['ended_resubscribe'].format(url=subscription_url()),
    ]
    return texts['ended_subject'], _with_footer(lines, texts)


def _greeting(user: Any, texts: dict[str, Any]) -> str:
    """Salue le propriétaire par son nom complet, jamais par celui de la boutique."""
    name = ' '.join((user.full_name or '').split())
    if name:
        return texts['greeting'].format(name=name)
    return texts['greeting_anonymous']


def _with_footer(lines: list[str], texts: dict[str, Any]) -> str:
    support = texts['support'].format(email=settings.SUPPORT_EMAIL)
    return '\n'.join([*lines, '', support])


def _moment(moment: datetime, shop: Any, language: str) -> str:
    """« 24 octobre 2026 à 14:30 (Europe/Paris) », dans le fuseau de la boutique."""
    zone = ZoneInfo(shop.timezone)
    local = moment.astimezone(zone)
    return TEXTS[language]['moment'].format(
        date=format_date(local.date(), format='long', locale=language),
        time=format_time(local, format='short', tzinfo=zone, locale=language),
        tz=shop.timezone,
    )


def _plural(language: str, forms: dict[str, str], count: int) -> str:
    form = Locale.parse(language).plural_form(count)
    return forms.get(form, forms['other'])


def _days_text(language: str, deadline: datetime, now: datetime) -> str:
    """Jours restants, arrondis au jour supérieur (au moins un)."""
    seconds = (deadline - now).total_seconds()
    count = max(1, math.ceil(seconds / SECONDS_PER_DAY))
    return _plural(language, TEXTS[language]['days'], count).format(count=count)


def _counter_line(
    language: str, shop: Any, template: str, key: str, count: int, **params: int,
) -> str:
    texts = TEXTS[language]
    nouns = texts['nouns'][key]
    if key == 'products':
        nouns = nouns.get(shop.catalog_kind, nouns['both'])
    noun = _plural(language, nouns, count)
    return texts[template][key].format(count=count, noun=noun, **params)
