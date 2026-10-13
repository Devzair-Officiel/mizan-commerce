'use client';

import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { FormActions } from '@/components/form/FormActions';
import { FormCard } from '@/components/form/FormCard';
import { useFormLeave } from '@/components/form/useFormLeave';
import { useStockAdjustment, useStockExit, type StockLevel } from '@/lib/hooks/useStock';
import { notify } from '@/lib/notify';
import { StockVariantSearch } from '../search/StockVariantSearch';
import { rejectedLines } from '../stockApiErrors';
import { useStockFormat } from '../useStockFormat';
import { ExitNoteSection } from './ExitNoteSection';
import { ExitReasonSection } from './ExitReasonSection';
import { StockExitLines } from './StockExitLines';
import { adjustmentPayload, exitPayload, useStockExitForm, type StockExitMotive, type StockExitOutput } from './useStockExitForm';

interface StockExitFormProps {
  /** Motif prérempli (`?motif=correction` depuis « Corriger le stock » de la fiche article). */
  reason: StockExitMotive | '';
  initial: StockLevel | null;
  onLeave: () => void;
  onSaved: () => void;
}

/** Sortie de stock : motif obligatoire, lignes (quantité sortie, ou comptée en correction), note facultative. */
export function StockExitForm({ reason, initial, onLeave, onSaved }: StockExitFormProps) {
  const t = useTranslations('stock.exit');
  const tc = useTranslations('stock.common');
  const f = useStockFormat();
  const exit = useStockExit();
  const adjust = useStockAdjustment();
  const { form, lines, totals, addLevel, switchReason } = useStockExitForm(reason, initial);
  const [noteOpen, setNoteOpen] = useState(false);
  const counting = useWatch({ control: form.control, name: 'reason' }) === 'adjustment';
  const pending = exit.isPending || adjust.isPending;
  const dirty = form.formState.isDirty;
  const cancel = useFormLeave(dirty && !pending, onLeave);
  const units = { units: totals.units, unitsLabel: f.quantity(totals.units) };

  function done(values: StockExitOutput, message: string) {
    form.reset(values);
    notify.success(message);
    onSaved();
  }

  const submit = form.handleSubmit((values) => {
    if (values.reason === 'adjustment') {
      adjust.mutate(adjustmentPayload(values), {
        onSuccess: ({ movements }) => done(values, t('adjust_success', { count: movements.length })),
        onError: () => notify.error(tc('save_error')),
      });
      return;
    }
    exit.mutate(exitPayload(values, values.reason), {
      onSuccess: () => done(values, t('success', { count: totals.count, ...units })),
      onError: (error) => {
        // Le stock a changé depuis l'ouverture de la page : les lignes refusées sont signalées.
        const rejected = rejectedLines(error, 'quantity');
        rejected.forEach((index) => form.setError(`lines.${index}.quantity`, { message: t('rejected_line') }));
        notify.error(rejected.length ? t('rejected') : tc('save_error'));
      },
    });
  });

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <FormCard>
        <ExitReasonSection form={form} onChange={switchReason} />
        <div className="flex flex-col gap-3 px-4 py-4 lg:px-4.5">
          <StockVariantSearch onPick={addLevel} />
          {totals.count === 0 && <p className="px-1 text-sm text-muted-foreground">{t(counting ? 'empty_lines_count' : 'empty_lines')}</p>}
          {form.formState.errors.lines?.root?.message && totals.count === 0 && (
            <p className="px-1 text-xs font-medium text-red-700 dark:text-red-400">{form.formState.errors.lines.root.message}</p>
          )}
        </div>
        {totals.count > 0 && (
          <div>
            <StockExitLines form={form} lines={lines} />
            <p className="border-t border-border px-4 py-3.5 text-sm text-muted-foreground lg:px-4.5">
              {counting ? t('footer_count', { count: totals.count, changed: totals.changed }) : t('footer', { count: totals.count, ...units })}
            </p>
          </div>
        )}
        <ExitNoteSection form={form} open={noteOpen} onToggle={() => setNoteOpen((o) => !o)} />
      </FormCard>
      <FormActions dirty={dirty} submitting={pending} note={t(counting ? 'note_count' : 'note_exit')} onCancel={cancel}
        submitDisabled={totals.count === 0}
        submitLabel={totals.count === 0 ? t('submit_empty') : counting ? t('submit_count', { count: totals.changed }) : t('submit', units)} />
    </form>
  );
}
