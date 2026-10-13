'use client';

import { Controller, type Control } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Users } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import { FormSection } from '@/components/form/FormSection';
import { FormSelect } from '@/components/form/FormSelect';
import type { ReminderAssignee } from '@/lib/hooks/useReminders';
import type { ReminderFormValues } from './useReminderForm';

/** Valeur du menu pour « Toute l'équipe » (le formulaire garde une chaîne vide). */
const TEAM = 'team';

interface ReminderAssigneeSectionProps {
  control: Control<ReminderFormValues>;
  members: ReminderAssignee[];
  /** Membre choisi (vide : toute l'équipe), pour l'aide sous le champ et le résumé replié. */
  assignedTo: string;
  open: boolean;
  onToggle: () => void;
}

/** Carte « Pour qui » (facultative) : membre chargé du rappel, toute l'équipe par défaut. */
export function ReminderAssigneeSection({ control, members, assignedTo, open, onToggle }: ReminderAssigneeSectionProps) {
  const t = useTranslations('reminders.form');
  const name = (m: ReminderAssignee) => (m.is_me ? t('assignee_me', { name: m.full_name }) : m.full_name);
  const options = [{ value: TEAM, label: t('assignee_team') }, ...members.map((m) => ({ value: m.id, label: name(m) }))];
  const chosen = members.find((m) => m.id === assignedTo);
  const firstName = chosen?.full_name.trim().split(/\s+/)[0] ?? '';
  const help = !chosen ? t('assignee_team_help') : chosen.is_me ? t('assignee_me_help') : t('assignee_help', { name: firstName });

  return (
    <FormSection icon={Users} order="max-lg:order-4" title={t('section_assignee')} status="optional"
      collapse={{ open, onToggle, summary: chosen ? name(chosen) : '' }}>
      <FormField label={t('assignee')} help={help}>
        {(c) => (
          <Controller control={control} name="assigned_to" render={({ field }) => (
            <FormSelect control={c} value={field.value || TEAM} onChange={(v) => field.onChange(v === TEAM ? '' : v)}
              options={options} triggerRef={field.ref} />
          )} />
        )}
      </FormField>
    </FormSection>
  );
}
