'use client';

import { useListUrlState } from '@/lib/hooks/useListUrlState';
import type { ReminderFilters, ReminderScope } from '@/lib/query-keys';

export const TABS: readonly ReminderScope[] = ['todo', 'upcoming', 'done'];
export const CATEGORIES = ['customer_followup', 'order_prep', 'unpaid', 'zakat', 'free'] as const;

/** Filtres d'une sélection : appliquée (URL) ou en brouillon (fenêtre mobile). `all` = filtre inactif. */
export interface RemindersSelection {
  /** all | me | identifiant d'un membre. */
  assignee: string;
  category: string;
}

export const EMPTY_SELECTION: RemindersSelection = { assignee: 'all', category: 'all' };

export function selectionFilters(s: RemindersSelection, search: string): ReminderFilters {
  return {
    search: search || undefined,
    for: s.assignee === 'all' ? undefined : s.assignee,
    category: s.category === 'all' ? undefined : s.category,
  };
}

function asTab(value: string): ReminderScope {
  return TABS.includes(value as ReminderScope) ? (value as ReminderScope) : 'todo';
}

/** Onglet, recherche et filtres de la page Rappels, portés par l'URL. */
export function useRemindersPageState() {
  // L'onglet survit à « Effacer les filtres ».
  const list = useListUrlState('due_at', ['tab']);
  const tab = asTab(list.param('tab'));
  const selection: RemindersSelection = {
    assignee: list.param('for') || 'all',
    category: list.param('category') || 'all',
  };
  const applySelection = (s: RemindersSelection) => list.setParams({
    for: s.assignee === 'all' ? null : s.assignee,
    category: s.category === 'all' ? null : s.category,
  });

  return {
    tab,
    setTab: (next: ReminderScope) => list.setParams({ tab: next === 'todo' ? null : next }),
    selection,
    filters: selectionFilters(selection, list.search),
    isFiltered: selection.assignee !== 'all' || selection.category !== 'all' || !!list.search,
    search: list.search,
    searchInput: list.searchInput,
    setSearchInput: list.setSearch,
    setAssignee: (assignee: string) => applySelection({ ...selection, assignee }),
    setCategory: (category: string) => applySelection({ ...selection, category }),
    applySelection,
    clearFilters: list.clearFilters,
  };
}

export type RemindersPageState = ReturnType<typeof useRemindersPageState>;
