'use client';

import { useTranslations } from 'next-intl';
import { FormField } from '@/components/form/FormField';
import { FormatInput, type FormatInputField } from './FormatInput';
import { FormatMenu } from './FormatMenu';
import { FormatStock } from './FormatStock';
import { InactiveBadge } from './InactiveBadge';
import type { FormatRowProps } from './formatRow';

/** Un format sur mobile : carte empilée avec les champs de la ligne du tableau, « ⋯ » en fenêtre du bas. */
export function FormatCard({ index, register, errors, formats, variant, currency, label, onEntry }: FormatRowProps) {
  const t = useTranslations('articles.form');
  const active = formats.rows[index]?.is_active ?? true;
  const field = (name: FormatInputField, title: string, extra: { suffix?: string; placeholder?: string; required?: boolean } = {}) => (
    <FormField label={title} required={extra.required} error={errors?.[name]?.message}>
      {(c) => <FormatInput register={register} index={index} field={name} a11y={c} suffix={extra.suffix} placeholder={extra.placeholder} />}
    </FormField>
  );

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border p-3.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{field('name', t('format_name'), { placeholder: t('format_placeholder'), required: true })}</div>
        <div className="mt-7 flex items-center gap-1">
          {!active && <InactiveBadge />}
          <FormatMenu index={index} formats={formats} variant={variant} label={label} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('selling_price', t('selling_price'), { suffix: currency, required: true })}
        {field('purchase_price', t('purchase_price'), { suffix: currency })}
        {variant ? (
          <FormField label={t('current_stock')}>
            {(c) => <FormatStock id={c.id} variant={variant} label={label} onEntry={onEntry} />}
          </FormField>
        ) : field('initial_stock', t('initial_stock'), { placeholder: '0' })}
        {field('low_stock_threshold', t('threshold'))}
      </div>
    </li>
  );
}
