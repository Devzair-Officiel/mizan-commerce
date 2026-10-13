'use client';

import { useWatch } from 'react-hook-form';
import { StickyNote } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormCollapsibleSection } from '@/components/form/FormCollapsibleSection';
import { FormField } from '@/components/form/FormField';
import { FIELD_TEXTAREA } from '@/components/form/fieldStyles';
import type { StockExitForm } from './useStockExitForm';

interface ExitNoteSectionProps {
  form: StockExitForm;
  open: boolean;
  onToggle: () => void;
}

/** « Note » (facultative), reprise dans l'historique des mouvements ; repliée, la section en montre le début. */
export function ExitNoteSection({ form, open, onToggle }: ExitNoteSectionProps) {
  const t = useTranslations('stock.exit');
  const note = useWatch({ control: form.control, name: 'note' });
  return (
    <FormCollapsibleSection title={t('note_title')} description={t('note_help')} summary={note.trim()}
      icon={<StickyNote size={19} strokeWidth={1.75} />} open={open} onToggle={onToggle}>
      <FormField label={t('note_label')} wide error={form.formState.errors.note?.message}>
        {(c) => <textarea {...c} {...form.register('note')} dir="auto" maxLength={500} className={FIELD_TEXTAREA} />}
      </FormField>
    </FormCollapsibleSection>
  );
}
