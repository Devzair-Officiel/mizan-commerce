'use client';

import { useTranslations } from 'next-intl';
import { ListToolbar } from '@/components/list/ListToolbar';
import { FilterMenuButton } from '@/components/list/FilterMenuButton';
import type { ReminderSummary } from '@/lib/hooks/useReminders';
import { ReminderTabs } from './ReminderTabs';
import { useReminderFilterOptions } from './useReminderFilterOptions';
import type { RemindersPageState } from './useRemindersPageState';

/** Barre d'outils desktop de Rappels : onglets, recherche, Pour (s'il y a une équipe), Catégorie. */
export function RemindersToolbar({ state, summary }: { state: RemindersPageState; summary?: ReminderSummary }) {
  const t = useTranslations('reminders.list');
  const { hasTeam, assigneeOptions, categoryOptions } = useReminderFilterOptions();

  return (
    <ListToolbar
      leading={<ReminderTabs value={state.tab} onChange={state.setTab} summary={summary} />}
      searchValue={state.searchInput}
      onSearchChange={state.setSearchInput}
      searchLabel={t('search_label')}
      searchPlaceholder={t('search_placeholder')}
      filters={
        <>
          {hasTeam && (
            <FilterMenuButton label={t('for_title')} value={state.selection.assignee} allValue="all"
              options={assigneeOptions} onChange={state.setAssignee} />
          )}
          <FilterMenuButton label={t('category_title')} value={state.selection.category} allValue="all"
            options={categoryOptions} onChange={state.setCategory} />
        </>
      }
      clearLabel={t('clear_filters')}
      onClear={state.isFiltered ? state.clearFilters : undefined}
    />
  );
}
