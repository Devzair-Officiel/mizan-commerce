"""Formule attribuée depuis l'admin Mizan (`set_plan_manually`), sa date de fin et
l'invariant sur lequel elle repose : sur un abonnement actif sans lien Stripe,
`current_period_end` n'est écrit que par une attribution."""

from __future__ import annotations

import threading
import time as time_module
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from django.contrib import admin
from django.db import connection, transaction
from django.test import Client, RequestFactory, TransactionTestCase
from django.urls import reverse
from django.utils import timezone

from apps.accounts.factories import UserFactory
from apps.accounts.models import User
from apps.core.models import AuditLog
from apps.shops.factories import ShopFactory, ShopMemberFactory
from apps.subscriptions.factories import SubscriptionFactory
from apps.subscriptions.models import Subscription, SubscriptionPlan
from apps.subscriptions.services import (
    PlanAssignmentError,
    downgrade_to_free,
    expire_trial,
    set_plan_manually,
    start_trial_or_default,
)
from apps.subscriptions.stripe_fakes import FakeStripeClient, subscription_data
from apps.subscriptions.stripe_sync import sync_subscription_from_stripe
from apps.subscriptions.tasks import expire_trials

pytestmark = pytest.mark.django_db

CHANGELIST = 'admin:subscriptions_subscription_changelist'


def _subscription(plan_code: str = 'free', **fields: Any) -> Subscription:
    plan = SubscriptionPlan.objects.get(code=plan_code)
    # Le fuseau de la boutique se déduit du pays (Shop.save).
    shop = ShopFactory(country=fields.pop('country', 'FR'))
    return SubscriptionFactory(shop=shop, plan=plan, **fields)


def _assign(subscription: Subscription, actor: User, **kwargs: Any) -> Subscription:
    kwargs.setdefault('reason', 'Geste commercial')
    plan = kwargs.pop('plan', 'boutique')
    return set_plan_manually(subscription, plan, actor=actor, **kwargs)


@pytest.fixture
def superuser() -> User:
    return UserFactory(is_staff=True, is_superuser=True)


@pytest.fixture
def root_client(superuser: User) -> Client:
    client = Client()
    client.force_login(superuser)
    return client


# --- Service ---------------------------------------------------------------


def test_assignment_without_stripe_changes_plan(superuser: User) -> None:
    sub = _subscription(
        status=Subscription.STATUS_CANCELLED,
        cancel_at_period_end=True,
        cancelled_at=timezone.now(),
    )
    _assign(sub, superuser)
    sub.refresh_from_db()
    assert (sub.plan.code, sub.status) == ('boutique', Subscription.STATUS_ACTIVE)
    assert sub.current_period_end is None
    assert (sub.cancel_at_period_end, sub.cancelled_at) == (False, None)
    assert sub.shop.effective_plan.code == 'boutique'


def test_assignment_ends_at_end_of_day_in_shop_timezone(superuser: User) -> None:
    sub = _subscription(country='SN')
    dakar = ZoneInfo('Africa/Dakar')
    until = timezone.localdate(timezone=dakar) + timedelta(days=3)
    _assign(sub, superuser, until=until)
    sub.refresh_from_db()
    expected = datetime.combine(until, time.max, tzinfo=dakar)
    assert sub.current_period_end == expected
    assert sub.assignment_ends_at == expected


def test_assignment_ending_today_is_accepted(superuser: User) -> None:
    sub = _subscription()
    _assign(sub, superuser, until=timezone.localdate(timezone=ZoneInfo('Europe/Paris')))
    sub.refresh_from_db()
    assert sub.plan.code == 'boutique'


def test_trial_becomes_assigned_plan(superuser: User) -> None:
    sub = _subscription(
        'boutique',
        status=Subscription.STATUS_TRIALING,
        current_period_end=timezone.now() + timedelta(days=3),
    )
    _assign(sub, superuser, plan='solo')
    sub.refresh_from_db()
    assert (sub.plan.code, sub.status, sub.current_period_end) == (
        'solo',
        Subscription.STATUS_ACTIVE,
        None,
    )


def test_assignment_is_audited_without_personal_data(superuser: User) -> None:
    sub = _subscription()
    until = date.today() + timedelta(days=30)
    _assign(sub, superuser, until=until, reason='  Partenariat salon  ')
    log = AuditLog.objects.get(action='subscription_plan_assigned')
    assert (log.shop_id, log.user, log.object_id) == (
        sub.shop_id,
        superuser,
        str(sub.pk),
    )
    assert log.changes == {
        'from': 'free',
        'to': 'boutique',
        'until': until.isoformat(),
        'reason': 'Partenariat salon',
        'actor_id': str(superuser.pk),
    }
    entry = f'{log.object_repr} {log.changes}'
    for personal in (superuser.email, superuser.full_name):
        assert personal not in entry


def test_stripe_subscription_is_refused(superuser: User) -> None:
    sub = _subscription('solo', stripe_subscription_id='sub_live')
    with pytest.raises(PlanAssignmentError, match='Stripe'):
        _assign(sub, superuser)
    sub.refresh_from_db()
    assert sub.plan.code == 'solo'
    assert not AuditLog.objects.exists()


@pytest.mark.parametrize('reason', ['', '   '])
def test_missing_reason_is_refused(superuser: User, reason: str) -> None:
    sub = _subscription()
    with pytest.raises(PlanAssignmentError, match='Motif'):
        _assign(sub, superuser, reason=reason)
    sub.refresh_from_db()
    assert sub.plan.code == 'free'


@pytest.mark.parametrize(
    ('kwargs', 'message'),
    [
        ({'plan': 'inconnue'}, 'Formule inconnue'),
        ({'plan': 'free', 'until': date.today() + timedelta(days=5)}, 'sans fin'),
        ({'until': date.today() - timedelta(days=2)}, 'passée'),
    ],
)
def test_invalid_assignment_is_refused(
    superuser: User, kwargs: dict[str, Any], message: str
) -> None:
    sub = _subscription()
    with pytest.raises(PlanAssignmentError, match=message):
        _assign(sub, superuser, **kwargs)
    assert not AuditLog.objects.exists()


def test_inactive_plan_is_refused(superuser: User) -> None:
    SubscriptionPlan.objects.filter(code='solo').update(is_active=False)
    with pytest.raises(PlanAssignmentError, match='désactivée'):
        _assign(_subscription(), superuser, plan='solo')


@pytest.mark.parametrize(
    'status', [Subscription.STATUS_PAST_DUE, Subscription.STATUS_PAUSED]
)
def test_guard_refuses_past_due_and_paused(superuser: User, status: str) -> None:
    sub = _subscription('solo', status=status)
    with pytest.raises(PlanAssignmentError, match='entre-temps'):
        _assign(sub, superuser)
    sub.refresh_from_db()
    assert (sub.plan.code, sub.status) == ('solo', status)


@pytest.mark.parametrize(
    'change',
    [{'stripe_subscription_id': 'sub_new'}, {'status': Subscription.STATUS_PAST_DUE}],
)
def test_guard_reads_database_not_stale_object(
    superuser: User, change: dict[str, str]
) -> None:
    """La page de l'admin a lu l'abonnement ; il change en base avant l'envoi."""
    sub = _subscription()
    Subscription.objects.filter(pk=sub.pk).update(**change)
    with pytest.raises(PlanAssignmentError, match='entre-temps'):
        _assign(sub, superuser)
    assert Subscription.objects.get(pk=sub.pk).plan.code == 'free'
    assert not AuditLog.objects.exists()


class AssignmentConcurrencyTest(TransactionTestCase):
    """Une liaison Stripe tient le verrou de la ligne pendant l'attribution :
    celle-ci attend la validation, puis la garde de l'UPDATE la refuse."""

    serialized_rollback = True

    def test_concurrent_stripe_link_wins(self) -> None:
        actor = UserFactory(is_staff=True, is_superuser=True)
        sub = _subscription()
        locked = threading.Event()

        def link_stripe() -> None:
            try:
                with transaction.atomic():
                    Subscription.objects.select_for_update().get(pk=sub.pk)
                    locked.set()
                    time_module.sleep(0.3)
                    Subscription.objects.filter(pk=sub.pk).update(
                        stripe_subscription_id='sub_race'
                    )
            finally:
                connection.close()

        thread = threading.Thread(target=link_stripe)
        thread.start()
        assert locked.wait(timeout=10)
        with pytest.raises(PlanAssignmentError, match='entre-temps'):
            _assign(sub, actor)
        thread.join(timeout=20)
        sub.refresh_from_db()
        assert (sub.plan.code, sub.stripe_subscription_id) == ('free', 'sub_race')
        assert not AuditLog.objects.filter(action='subscription_plan_assigned').exists()


# --- Date de fin ------------------------------------------------------------


def _expired_assignment(superuser: User) -> Subscription:
    sub = _subscription()
    _assign(sub, superuser, until=date.today() + timedelta(days=2))
    past = timezone.now() - timedelta(minutes=1)
    Subscription.objects.filter(pk=sub.pk).update(current_period_end=past)
    sub.refresh_from_db()
    return sub


def test_expired_assignment_falls_back_to_free_at_read(superuser: User) -> None:
    sub = _expired_assignment(superuser)
    assert sub.is_assignment_expired
    assert sub.plan.code == 'boutique'
    assert sub.shop.effective_plan.code == 'free'


def test_expire_trials_ends_assignment_and_audits(superuser: User) -> None:
    sub = _expired_assignment(superuser)
    ended_at = sub.current_period_end
    stats = expire_trials()
    assert stats['assignments_ended'] == 1
    sub.refresh_from_db()
    assert (sub.plan.code, sub.status, sub.current_period_end) == (
        'free',
        Subscription.STATUS_ACTIVE,
        None,
    )
    log = AuditLog.objects.get(action='subscription_assignment_ended')
    assert log.user is None
    assert log.changes == {
        'from': 'boutique',
        'to': 'free',
        'ended_at': ended_at.isoformat(),
    }
    assert expire_trials()['assignments_ended'] == 0


def test_running_assignment_and_stripe_period_are_left_alone(superuser: User) -> None:
    running = _subscription()
    _assign(running, superuser, until=date.today() + timedelta(days=2))
    # Abonnement Stripe dont la période est échue (webhook de renouvellement à venir).
    stripe_sub = _subscription(
        'solo',
        stripe_subscription_id='sub_live',
        current_period_end=timezone.now() - timedelta(hours=1),
    )
    assert expire_trials()['assignments_ended'] == 0
    assert stripe_sub.shop.effective_plan.code == 'solo'
    for sub, code in ((running, 'boutique'), (stripe_sub, 'solo')):
        sub.refresh_from_db()
        assert sub.plan.code == code


# --- Invariant : `current_period_end` sans lien Stripe = formule attribuée ---


def _assert_no_unassigned_period_end(sub: Subscription) -> None:
    sub.refresh_from_db()
    assert sub.assignment_ends_at is None, (
        "current_period_end posé sur un abonnement actif sans lien Stripe : "
        "il serait lu comme la fin d'une formule attribuée"
    )


def test_subscription_creation_writes_no_period_end() -> None:
    user = UserFactory(trial_consumed_at=timezone.now())
    member = ShopMemberFactory(user=user, role='owner')
    _assert_no_unassigned_period_end(start_trial_or_default(member.shop, user))


def test_trial_creation_stays_a_trial() -> None:
    user = UserFactory(trial_consumed_at=None)
    sub = start_trial_or_default(ShopFactory(), user)
    assert sub.status == Subscription.STATUS_TRIALING
    _assert_no_unassigned_period_end(sub)


def test_local_changes_write_no_period_end() -> None:
    trial = _subscription(
        'boutique',
        status=Subscription.STATUS_TRIALING,
        current_period_end=timezone.now() - timedelta(days=1),
    )
    _assert_no_unassigned_period_end(expire_trial(trial))
    paid = _subscription('solo', status=Subscription.STATUS_TRIALING)
    _assert_no_unassigned_period_end(downgrade_to_free(paid))


@pytest.mark.parametrize('status', ['active', 'trialing', 'past_due', 'canceled'])
def test_stripe_sync_writes_period_end_only_with_link(status: str) -> None:
    stripe = FakeStripeClient()
    sub = _subscription('solo', stripe_customer_id='cus_a')
    if status == 'canceled':
        Subscription.objects.filter(pk=sub.pk).update(stripe_subscription_id='sub_a')
    stripe.put_subscription(subscription_data('sub_a', 'cus_a', status=status))
    sync_subscription_from_stripe(stripe, 'sub_a')
    _assert_no_unassigned_period_end(sub)


# --- Admin ------------------------------------------------------------------


def _staff_request(user: User) -> Any:
    request = RequestFactory().get('/')
    request.user = user
    return request


def test_action_offered_to_superuser_only(superuser: User) -> None:
    model_admin = admin.site._registry[Subscription]
    staff = UserFactory(is_staff=True, is_superuser=False)
    assert 'change_plan' in model_admin.get_actions(_staff_request(superuser))
    assert 'change_plan' not in model_admin.get_actions(_staff_request(staff))
    assert not model_admin.has_change_permission(_staff_request(superuser))


def _post_action(client: Client, sub: Subscription, **data: Any) -> Any:
    payload = {'action': 'change_plan', '_selected_action': [str(sub.pk)], **data}
    return client.post(reverse(CHANGELIST), payload)


def test_admin_action_assigns_plan(root_client: Client, superuser: User) -> None:
    sub = _subscription()
    page = _post_action(root_client, sub)
    assert page.status_code == 200
    assert 'pas de donnée personnelle' in page.content.decode().lower()
    until = date.today() + timedelta(days=10)
    response = _post_action(
        root_client,
        sub,
        apply='1',
        plan='commerce_plus',
        until=until.isoformat(),
        reason='Partenaire',
    )
    assert response.status_code == 302
    sub.refresh_from_db()
    assert sub.plan.code == 'commerce_plus'
    log = AuditLog.objects.get(action='subscription_plan_assigned')
    assert (log.user, log.changes['until']) == (superuser, until.isoformat())


def test_admin_action_requires_reason(root_client: Client) -> None:
    sub = _subscription()
    response = _post_action(root_client, sub, apply='1', plan='solo', reason='')
    assert response.status_code == 200
    assert response.context['form'].errors['reason']
    assert Subscription.objects.get(pk=sub.pk).plan.code == 'free'


def test_admin_action_refuses_stripe_subscription(root_client: Client) -> None:
    sub = _subscription('solo', stripe_subscription_id='sub_live')
    response = _post_action(root_client, sub, apply='1', plan='boutique', reason='x')
    assert response.status_code == 302
    assert Subscription.objects.get(pk=sub.pk).plan.code == 'solo'
    assert not AuditLog.objects.exists()


def test_changelist_filters_assignments_ending_within_7_days(
    root_client: Client, superuser: User
) -> None:
    soon, later, endless = _subscription(), _subscription(), _subscription()
    _assign(soon, superuser, until=date.today() + timedelta(days=3))
    _assign(later, superuser, until=date.today() + timedelta(days=30))
    _assign(endless, superuser)
    response = root_client.get(reverse(CHANGELIST), {'assignment_end': '7d'})
    shown = {sub.pk for sub in response.context['cl'].result_list}
    assert shown == {soon.pk}
    assert 'Fin de la formule attribuée' in response.content.decode()
