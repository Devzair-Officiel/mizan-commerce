'use client';

import { useState } from 'react';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { ChevronDown, Copy, Plus } from 'lucide-react';
import { FloatingInput, FloatingTextarea } from '@/components/ui/floating-fields';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { LineSuggestion } from '@/lib/hooks/useInvoiceDrafts';
import { lineCents, MAX_LENGTH, type EditorLine as Line, type EditorValues } from './editorSchema';
import { LineDescriptionField } from './LineDescriptionField';
import { LineMenu, type LineActions } from './LineMenu';
import { QuantityStepper } from './QuantityStepper';
import { UnitSheet } from './UnitSheet';

interface EditorLineProps {
  index: number;
  form: UseFormReturn<EditorValues>;
  currency: string;
  /** Enregistrement automatique après chaque saisie. */
  schedule: () => void;
  actions: LineActions;
}

const ICON_BUTTON = 'grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

/**
 * Une ligne de la facture : désignation avec suggestions, quantité, unité, prix unitaire HT et
 * total en puce ; « + Description » ouvre le détail multiligne. Mobile : deux colonnes, total sous
 * le prix ; desktop : trois colonnes, total et « Dupliquer » dans l'en-tête de la ligne.
 */
export function EditorLine({ index, form, currency, schedule, actions }: EditorLineProps) {
  const t = useTranslations('invoices.editor.line');
  const money = useFormatMoney();
  const { register, setValue, control, formState: { errors } } = form;
  const line = useWatch({ control, name: `lines.${index}` });
  const [details, setDetails] = useState(line.details !== '');
  const [unitOpen, setUnitOpen] = useState(false);
  const set = (field: keyof Line, value: string) => {
    setValue(`lines.${index}.${field}`, value, { shouldDirty: true, shouldValidate: true });
    schedule();
  };
  const pick = (s: LineSuggestion) => {
    (['description', 'details', 'unit', 'unit_price_ht'] as const).forEach((f) => setValue(`lines.${index}.${f}`, s[f], { shouldDirty: true, shouldValidate: true }));
    if (s.details) setDetails(true);
    schedule();
  };
  const id = `invoice-line-${index}`;
  const error = errors.lines?.[index];
  const total = <span className="tabular-nums">{money(lineCents(line) / 100, currency)}</span>;
  return <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
    <div className="flex items-center gap-2">
      <span className="flex-1 text-[0.8125rem] font-semibold text-muted-foreground">{t('title', { number: index + 1 })}</span>
      <span className="hidden text-sm font-semibold lg:inline">{total}</span>
      <button type="button" onClick={actions.duplicate} aria-label={t('duplicate')} className={`${ICON_BUTTON} hidden lg:grid`}><Copy size={16} aria-hidden /></button>
      <LineMenu index={index} line={line} actions={actions} />
    </div>
    <LineDescriptionField id={`${id}-description`} field={register(`lines.${index}.description`, { onChange: schedule })}
      value={line.description} currency={currency} onPick={pick} />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <QuantityStepper id={`${id}-quantity`} label={t('quantity')} value={line.quantity} onChange={(v) => set('quantity', v)} aria-invalid={!!error?.quantity} />
      <button type="button" onClick={() => setUnitOpen(true)} aria-haspopup="dialog"
        className="relative flex h-full min-h-13 flex-col justify-center rounded-2xl border border-border bg-card px-4 pe-9 text-start">
        <span className="text-[11px] text-muted-foreground">{t('unit')}</span>
        <span dir="auto" className="truncate text-sm">{line.unit || '—'}</span>
        <ChevronDown size={14} aria-hidden className="absolute inset-e-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      </button>
      <FloatingInput id={`${id}-price`} label={t('unit_price')} suffix={currency} inputMode="decimal" autoComplete="off" className="tabular-nums"
        aria-invalid={!!error?.unit_price_ht} {...register(`lines.${index}.unit_price_ht`, { onChange: schedule })} />
      <div className="flex flex-col justify-center rounded-2xl bg-primary/8 px-4 text-primary lg:hidden">
        <span className="text-[11px]">{t('total')}</span>
        <span className="text-sm font-semibold">{total}</span>
      </div>
    </div>
    {(error?.quantity || error?.unit_price_ht) && <p role="alert" className="text-xs text-destructive">{error.quantity?.message ?? error.unit_price_ht?.message}</p>}
    {details
      ? <FloatingTextarea id={`${id}-details`} label={t('details')} rows={3} maxLength={MAX_LENGTH.details} dir="auto" {...register(`lines.${index}.details`, { onChange: schedule })} />
      : <button type="button" onClick={() => setDetails(true)} className="inline-flex min-h-9 items-center gap-1 self-start text-[0.8125rem] font-semibold text-primary">
        <Plus size={14} aria-hidden />{t('add_details')}
      </button>}
    {unitOpen && <UnitSheet value={line.unit} onClose={() => setUnitOpen(false)} onPick={(unit) => set('unit', unit)} />}
  </li>;
}
