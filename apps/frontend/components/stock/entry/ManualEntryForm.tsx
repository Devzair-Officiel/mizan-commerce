'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FormActions } from '@/components/form/FormActions';
import { FormCard } from '@/components/form/FormCard';
import { useFormLeave } from '@/components/form/useFormLeave';
import { useStockEntry, type StockLevel } from '@/lib/hooks/useStock';
import { notify } from '@/lib/notify';
import { StockVariantSearch } from '../search/StockVariantSearch';
import { useStockFormat } from '../useStockFormat';
import { StockEntryFooter } from './StockEntryFooter';
import { StockEntryLines } from './StockEntryLines';
import { StockEntrySupplierSection } from './StockEntrySupplierSection';
import { EMPTY_ENTRY, entryPayload, lineFromLevel, useStockEntryForm } from './useStockEntryForm';

interface ManualEntryFormProps {
  currencyCode: string;
  /** Format prérempli (`?variant=`, « + Entrée » d'une ligne ou de la fiche article). */
  initial: StockLevel | null;
  onLeave: () => void;
  onSaved: () => void;
}

/** Saisie à la main : recherche ou douchette, lignes reçues, total, fournisseur et facture facultatifs. */
export function ManualEntryForm({ currencyCode, initial, onLeave, onSaved }: ManualEntryFormProps) {
  const t = useTranslations('stock.entry');
  const tc = useTranslations('stock.common');
  const f = useStockFormat();
  const entry = useStockEntry();
  const { form, lines, totals, addLevel } = useStockEntryForm(initial ? { ...EMPTY_ENTRY, lines: [lineFromLevel(initial)] } : EMPTY_ENTRY);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const dirty = form.formState.isDirty;
  const cancel = useFormLeave(dirty && !entry.isPending, onLeave);
  const units = f.quantity(totals.units);

  const submit = form.handleSubmit((values) => entry.mutate(entryPayload(values, null), {
    onSuccess: () => {
      form.reset(values);
      notify.success(t('success', { count: totals.count, units: totals.units, unitsLabel: units }));
      onSaved();
    },
    onError: () => notify.error(tc('save_error')),
  }));

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <FormCard>
        <div className="flex flex-col gap-3 px-4 py-4 lg:px-4.5">
          <StockVariantSearch onPick={addLevel} autoFocus={!initial} />
          {totals.count === 0 && <p className="px-1 text-sm text-muted-foreground">{t('empty_lines')}</p>}
        </div>
        {totals.count > 0 && (
          <div>
            <StockEntryLines form={form} lines={lines} currencyCode={currencyCode} />
            <StockEntryFooter totals={totals} currencyCode={currencyCode} invoice={false} />
          </div>
        )}
        <StockEntrySupplierSection form={form} open={supplierOpen} onToggle={() => setSupplierOpen((o) => !o)} />
      </FormCard>
      <FormActions dirty={dirty} submitting={entry.isPending} note={t('note_manual')} onCancel={cancel}
        submitDisabled={totals.count === 0}
        submitLabel={totals.count === 0 ? t('submit_empty') : t('submit', { units: totals.units, unitsLabel: units })} />
    </form>
  );
}
