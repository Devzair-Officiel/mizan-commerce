'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ListMobileToolbar, type ActiveFilter } from '@/components/list/ListMobileToolbar';
import { ListFilterSheet } from '@/components/list/ListFilterSheet';
import { FilterSheetSection } from '@/components/list/FilterSheetSection';
import { useReminderSummary, type ReminderSummary } from '@/lib/hooks/useReminders';
import { ReminderTabs } from './ReminderTabs';
import { useReminderFilterOptions } from './useReminderFilterOptions';
import { EMPTY_SELECTION, selectionFilters, type RemindersPageState, type RemindersSelection } from './useRemindersPageState';

/** Mobile : onglets, recherche, bouton Filtres et sa fenêtre (validation explicite). */
export function RemindersFiltersMobile({ state, summary }: { state: RemindersPageState; summary?: ReminderSummary }) {
  const t = useTranslations('reminders.list');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RemindersSelection>(state.selection);
  const { hasTeam, assigneeOptions, categoryOptions } = useReminderFilterOptions();
  // Nombre de rappels de l'onglet avec le brouillon, pour « Voir les N rappels ».
  const { data: draftSummary } = useReminderSummary(selectionFilters(draft, state.search));
  const set = (patch: Partial<RemindersSelection>) => setDraft({ ...draft, ...patch });

  const assignee = assigneeOptions.find((o) => o.value === state.selection.assignee);
  const category = categoryOptions.find((o) => o.value === state.selection.category);
  const activeFilters = [
    state.selection.assignee !== 'all' && assignee && { name: t('for_title'), option: assignee, onRemove: () => state.setAssignee('all') },
    state.selection.category !== 'all' && category && { name: t('category_title'), option: category, onRemove: () => state.setCategory('all') },
  ].filter((f): f is ActiveFilter => !!f);

  const openSheet = () => {
    setDraft(state.selection);
    setOpen(true);
  };
  const apply = () => {
    state.applySelection(draft);
    setOpen(false);
  };
  const isEmpty = draft.assignee === 'all' && draft.category === 'all';

  return (
    <div className="flex flex-col gap-3">
      <ReminderTabs value={state.tab} onChange={state.setTab} summary={summary} />
      <ListMobileToolbar
        searchValue={state.searchInput}
        onSearchChange={state.setSearchInput}
        searchLabel={t('search_label')}
        searchPlaceholder={t('search_placeholder')}
        activeFilters={activeFilters}
        onOpenFilters={openSheet}
      />
      <ListFilterSheet open={open} onClose={() => setOpen(false)} onReset={() => setDraft(EMPTY_SELECTION)}
        resetDisabled={isEmpty} onApply={apply}
        applyLabel={draftSummary ? t('show_results', { count: draftSummary[state.tab] }) : t('apply')}>
        {hasTeam && (
          <FilterSheetSection title={t('for_title')} value={draft.assignee} options={assigneeOptions}
            onChange={(value) => set({ assignee: value })} />
        )}
        <FilterSheetSection title={t('category_title')} value={draft.category} options={categoryOptions}
          onChange={(value) => set({ category: value })} />
      </ListFilterSheet>
    </div>
  );
}
