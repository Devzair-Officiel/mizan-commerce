"""Rappels attribués à un membre : filtre « Pour », badge et accueil par membre,
droits d'attribution et réglages des rappels automatiques."""

from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.shops.models import ShopMember
from apps.subscriptions.models import SubscriptionPlan
from apps.subscriptions.test_utils import attach_subscription
from .models import Reminder
from .tests import setup


def add_member(shop, email: str, role: str = 'staff') -> ShopMember:
    user = User.objects.create_user(email=email, password='Pass123!Strong', full_name=email)  # noqa: E501
    return ShopMember.objects.create(shop=shop, user=user, role=role)


class AssignmentTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner, self.shop, _ = setup('owner@example.com')
        attach_subscription(self.shop, plan_code=SubscriptionPlan.CODE_BOUTIQUE_PLUS)
        self.owner_member = self.shop.members.get(user=self.owner)
        self.sara = add_member(self.shop, 'sara@example.com')
        self.ines = add_member(self.shop, 'ines@example.com')
        now = timezone.now()
        self.team = self.remind('Équipe', None, now)
        self.for_sara = self.remind('Sara', self.sara, now)
        self.for_ines = self.remind('Inès', self.ines, now)
        self.for_sara_later = self.remind('Sara plus tard', self.sara, now + timedelta(days=3))  # noqa: E501

    def remind(self, title, member, due_at):
        return Reminder.objects.create(
            shop=self.shop, author=self.owner, title=title, due_at=due_at, assigned_to=member,  # noqa: E501
        )

    def titles(self, user, query):
        self.client.force_authenticate(user=user)
        response = self.client.get(reverse('reminder-list') + query)
        return {r['title'] for r in response.data['results']}

    def test_for_me_includes_mine_and_team(self):
        self.assertEqual(
            self.titles(self.sara.user, '?for=me'),
            {'Équipe', 'Sara', 'Sara plus tard'},
        )

    def test_for_team_is_whole_team_only(self):
        self.assertEqual(self.titles(self.sara.user, '?for=team'), {'Équipe'})

    def test_for_member(self):
        self.assertEqual(self.titles(self.owner, f'?for={self.ines.pk}'), {'Inès'})

    def test_for_unknown_value_is_refused(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(reverse('reminder-list') + '?for=quelquun')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_badge_counts_per_member(self):
        expected = {self.sara.user: 2, self.ines.user: 2, self.owner: 1}
        for user, count in expected.items():
            self.client.force_authenticate(user=user)
            badges = self.client.get(reverse('dashboard-badges')).data
            self.assertEqual(badges['reminders_due'], count, user.email)

    def test_dashboard_counts_per_member(self):
        self.sara.permissions = ['dashboard']
        self.sara.save()
        self.client.force_authenticate(user=self.sara.user)
        block = self.client.get(reverse('dashboard-today')).data['today_reminders']
        self.assertEqual(block['count'], 2)
        self.assertEqual({r['title'] for r in block['items']}, {'Équipe', 'Sara'})

    def test_list_exposes_the_assignee(self):
        self.client.force_authenticate(user=self.owner)
        url = reverse('reminder-detail', kwargs={'pk': self.for_sara.pk})
        data = self.client.get(url).data
        self.assertEqual(
            (str(data['assigned_to']), data['assigned_to_name']),
            (str(self.sara.pk), 'sara@example.com'),
        )

    def test_assign_to_a_member(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(reverse('reminder-list'), {
            'title': 'Pour Inès', 'due_at': timezone.now().isoformat(),
            'category': 'free', 'assigned_to': str(self.ines.pk),
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Reminder.objects.get(title='Pour Inès').assigned_to, self.ines)

    def test_assign_to_member_of_another_shop_is_refused(self):
        _, shop_b, _ = setup('b@example.com')
        stranger = add_member(shop_b, 'stranger@example.com')
        self.client.force_authenticate(user=self.owner)
        url = reverse('reminder-detail', kwargs={'pk': self.team.pk})
        response = self.client.patch(url, {'assigned_to': str(stranger.pk)}, format='json')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_assign_to_member_without_access_is_refused(self):
        # Sans Boutique+, les employés sont suspendus : plus d'accès aux rappels.
        attach_subscription(self.shop, plan_code=SubscriptionPlan.CODE_PRO)
        self.client.force_authenticate(user=self.owner)
        url = reverse('reminder-detail', kwargs={'pk': self.team.pk})
        response = self.client.patch(url, {'assigned_to': str(self.sara.pk)}, format='json')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('assigned_to', response.data['errors'])
        own = self.client.patch(url, {'assigned_to': str(self.owner_member.pk)}, format='json')  # noqa: E501
        self.assertEqual(own.status_code, status.HTTP_200_OK)

    def test_assignees(self):
        self.client.force_authenticate(user=self.sara.user)
        data = self.client.get(reverse('reminder-assignees')).data
        self.assertEqual(len(data), 3)
        attach_subscription(self.shop, plan_code=SubscriptionPlan.CODE_PRO)
        self.client.force_authenticate(user=self.owner)
        data = self.client.get(reverse('reminder-assignees')).data
        self.assertEqual([m['id'] for m in data], [str(self.owner_member.pk)])

    def test_unassigned_when_member_leaves(self):
        self.sara.delete()
        self.for_sara.refresh_from_db()
        self.assertIsNone(self.for_sara.assigned_to)


class ReminderSettingsTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner, self.shop, _ = setup('settings@example.com')
        attach_subscription(self.shop, plan_code=SubscriptionPlan.CODE_BOUTIQUE_PLUS)
        self.url = reverse('reminder-settings')

    def test_defaults(self):
        self.client.force_authenticate(user=self.owner)
        data = self.client.get(self.url).data
        self.assertEqual(data, {
            'unpaid_followup_enabled': True, 'unpaid_followup_days': 3,
            'pending_orders_enabled': True, 'pending_orders_days': 2,
            'daily_summary_enabled': False, 'daily_summary_hour': 8,
        })

    def test_owner_and_admin_can_edit(self):
        admin = add_member(self.shop, 'admin@example.com', role='admin')
        for user, days in ((self.owner, 5), (admin.user, 7)):
            self.client.force_authenticate(user=user)
            response = self.client.patch(self.url, {'unpaid_followup_days': days}, format='json')  # noqa: E501
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.data['unpaid_followup_days'], days)

    def test_staff_reads_but_cannot_edit(self):
        staff = add_member(self.shop, 'staff@example.com')
        self.client.force_authenticate(user=staff.user)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_200_OK)
        response = self.client.patch(self.url, {'daily_summary_enabled': True}, format='json')  # noqa: E501
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(self.shop.reminder_settings.daily_summary_enabled)

    def test_values_are_validated(self):
        self.client.force_authenticate(user=self.owner)
        for field, value in (('unpaid_followup_days', 0), ('daily_summary_hour', 24)):
            response = self.client.patch(self.url, {field: value}, format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, field)

    def test_settings_are_per_shop(self):
        user_b, _, _ = setup('settings-b@example.com')
        self.client.force_authenticate(user=user_b)
        self.client.patch(self.url, {'pending_orders_enabled': False}, format='json')
        self.client.force_authenticate(user=self.owner)
        self.assertTrue(self.client.get(self.url).data['pending_orders_enabled'])
