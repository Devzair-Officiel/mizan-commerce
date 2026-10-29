'use client';

import { useFieldArray, type UseFormReturn } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { ListChecks, Plus } from 'lucide-react';
import { FormSection } from '@/components/form/FormSection';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';
import { EMPTY_LINE, type EditorValues } from './editorSchema';
import { EditorLine } from './EditorLine';

interface EditorLinesCardProps {
  form: UseFormReturn<EditorValues>;
  currency: string;
  schedule: () => void;
}

/**
 * Carte « Lignes » : une ligne par prestation ou article. Ajouter place le curseur sur la nouvelle
 * désignation (aussi Ctrl + Entrée depuis une ligne) ; supprimer s'annule depuis la notification.
 */
export function EditorLinesCard({ form, currency, schedule }: EditorLinesCardProps) {
  const t = useTranslations('invoices.editor.lines');
  const { control, getValues } = form;
  const { fields, append, insert, move, remove } = useFieldArray({ control, name: 'lines' });

  const add = () => {
    append(EMPTY_LINE, { focusName: `lines.${fields.length}.description` });
    schedule();
  };
  const actionsFor = (index: number) => ({
    duplicate: () => { insert(index + 1, { ...getValues(`lines.${index}`) }, { shouldFocus: false }); schedule(); },
    moveUp: index > 0 ? () => { move(index, index - 1); schedule(); } : undefined,
    remove: () => {
      const line = getValues(`lines.${index}`);
      remove(index);
      schedule();
      notify.success(t('removed'), { label: t('undo'), onClick: () => { insert(index, line, { shouldFocus: false }); schedule(); } });
    },
  });

  return <FormSection icon={ListChecks} order="max-lg:order-2" title={t('title')} status="required" description={t('description')}>
    <ol className="flex flex-col divide-y divide-border"
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); } }}>
      {fields.map((field, index) => <EditorLine key={field.id} index={index} form={form} currency={currency} schedule={schedule} actions={actionsFor(index)} />)}
    </ol>
    {fields.length === 0 && <p className="text-sm text-muted-foreground">{t('empty')}</p>}
    <Button type="button" variant="outline" onClick={add} className="h-11 w-full rounded-full lg:w-auto lg:self-start">
      <Plus size={16} aria-hidden />{t('add')}
      <kbd className="ms-2 hidden rounded border border-border px-1.5 text-[0.6875rem] font-medium text-muted-foreground lg:inline">{t('add_shortcut')}</kbd>
    </Button>
  </FormSection>;
}
