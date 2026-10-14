'use client';

import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { ListCreateButton } from '@/components/list/ListCreateButton';
import { AutomaticRemindersCard } from '@/components/reminders/list/AutomaticRemindersCard';
import { ReminderGroups } from '@/components/reminders/list/ReminderGroups';
import { RemindersDialogs } from '@/components/reminders/list/RemindersDialogs';
import { RemindersEmptyState } from '@/components/reminders/list/RemindersEmptyState';
import { RemindersFiltersMobile } from '@/components/reminders/list/RemindersFiltersMobile';
import { RemindersToolbar } from '@/components/reminders/list/RemindersToolbar';
import { RemindersUpcomingHint } from '@/components/reminders/list/RemindersUpcomingHint';
import { useReminderActions } from '@/components/reminders/list/useReminderActions';
import { useRemindersPageState } from '@/components/reminders/list/useRemindersPageState';
import { useReminderList, useReminderSummary } from '@/lib/hooks/useReminders';
import { useShop } from '@/lib/hooks/useShop';

function RemindersContent() {
  const t = useTranslations('reminders.list');
  const { data: shop } = useShop();
  const state = useRemindersPageState();
  const actions = useReminderActions();
  const list = useReminderList(state.tab, state.filters);
  // Sous-titre : toute la boutique, sans les filtres de la liste (même requête que la liste non filtrée).
  const { data: overall } = useReminderSummary({});
  const { data: summary } = useReminderSummary(state.filters);
  const empty = !list.isLoading && list.items.length === 0;

  return (
    <>
      <TopBar
        title={t('title')}
        subtitle={overall ? t('subtitle', { todo: overall.todo, overdue: overall.overdue }) : undefined}
        action={<ListCreateButton href="/reminders/new" label={t('new_cta')} />}
        hideSearch
      />
      <div className="flex flex-col gap-4 p-4 pb-28 lg:gap-5 lg:pt-0">
        <div className="lg:hidden"><RemindersFiltersMobile state={state} summary={summary} /></div>
        <div className="hidden lg:block"><RemindersToolbar state={state} summary={summary} /></div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-2">
            {empty
              ? <RemindersEmptyState tab={state.tab} filtered={state.isFiltered} onClear={state.clearFilters} />
              : <ReminderGroups tab={state.tab} list={list} currency={shop?.currency ?? 'EUR'} actions={actions} />}
            {state.tab === 'todo' && summary && !list.isLoading && (
              <RemindersUpcomingHint summary={summary} onShow={() => state.setTab('upcoming')} />
            )}
          </div>
          <div className="min-w-0 lg:max-w-90 lg:flex-1"><AutomaticRemindersCard /></div>
        </div>
      </div>
      <RemindersDialogs actions={actions} />
    </>
  );
}

export default function RemindersPage() {
  return (
    <Suspense>
      <RemindersContent />
    </Suspense>
  );
}
