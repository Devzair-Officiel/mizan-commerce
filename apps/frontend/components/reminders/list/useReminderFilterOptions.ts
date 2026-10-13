'use client';

import { useTranslations } from 'next-intl';
import type { FilterOption } from '@/components/list/FilterMenuButton';
import { useReminderAssignees } from '@/lib/hooks/useReminders';
import { CATEGORIES } from './useRemindersPageState';

/**
 * Déclaration unique des filtres Pour et Catégorie, pour le menu desktop comme pour la
 * fenêtre mobile. Sans équipe (un seul membre), le filtre Pour n'existe pas.
 */
export function useReminderFilterOptions() {
  const t = useTranslations('reminders.list');
  const tCategory = useTranslations('reminders');
  const { data: assignees } = useReminderAssignees();
  const hasTeam = (assignees?.length ?? 0) > 1;

  const assigneeOptions: FilterOption<string>[] = [
    { value: 'all', label: t('for_all') },
    { value: 'me', label: t('for_me') },
    ...(assignees ?? []).filter((m) => !m.is_me).map((m) => ({ value: m.id, label: m.full_name })),
  ];
  const categoryOptions: FilterOption<string>[] = [
    { value: 'all', label: t('category_all') },
    ...CATEGORIES.map((value) => ({ value, label: tCategory('category', { value }) })),
  ];

  return { hasTeam, assigneeOptions, categoryOptions };
}
