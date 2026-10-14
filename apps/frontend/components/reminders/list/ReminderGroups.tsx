'use client';

import { useTranslations } from 'next-intl';
import { ShowMoreList } from '@/components/ui/ShowMoreList';
import { SkeletonRows } from '@/components/ui/SkeletonRows';
import type { Reminder, ReminderMoment, useReminderList } from '@/lib/hooks/useReminders';
import type { ReminderScope } from '@/lib/query-keys';
import { ReminderGroupCard } from './ReminderGroupCard';
import { ReminderRow } from './ReminderRow';
import type { ReminderActions } from './useReminderActions';

const GROUPS: Record<Exclude<ReminderScope, 'done'>, readonly ReminderMoment[]> = {
  todo: ['overdue', 'today'],
  upcoming: ['tomorrow', 'week', 'later'],
};
const DOTS: Partial<Record<ReminderMoment, 'red' | 'amber'>> = { overdue: 'red', today: 'amber' };

interface ReminderGroupsProps {
  tab: ReminderScope;
  list: ReturnType<typeof useReminderList>;
  currency: string;
  actions: ReminderActions;
}

/** Rappels de l'onglet, groupés par moment ; les terminés, des plus récents aux plus anciens. */
export function ReminderGroups({ tab, list, currency, actions }: ReminderGroupsProps) {
  const t = useTranslations('reminders.list');
  const rows = (items: Reminder[]) => (
    <ul>{items.map((r) => <ReminderRow key={r.id} reminder={r} currency={currency} actions={actions} />)}</ul>
  );

  if (list.isLoading) {
    return <div className="rounded-2xl border border-border bg-card"><SkeletonRows count={4} rowClassName="px-4.5 py-4" /></div>;
  }
  if (tab === 'done') {
    return (
      <ReminderGroupCard title={t('group.done')} count={list.count}>
        <ShowMoreList list={list} kind="reminders">{rows(list.items)}</ShowMoreList>
      </ReminderGroupCard>
    );
  }
  return GROUPS[tab].map((moment) => {
    const items = list.items.filter((r) => r.moment === moment);
    if (items.length === 0) return null;
    return (
      <ReminderGroupCard key={moment} title={t(`group.${moment}`)} count={items.length} dot={DOTS[moment]}>
        {rows(items)}
      </ReminderGroupCard>
    );
  });
}
