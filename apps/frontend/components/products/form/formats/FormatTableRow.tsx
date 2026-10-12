'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { FormatInput, type FormatInputField } from './FormatInput';
import { FormatMenu } from './FormatMenu';
import { FormatStock } from './FormatStock';
import { InactiveBadge } from './InactiveBadge';
import type { FormatRowProps } from './formatRow';

const ERROR_FIELDS = ['name', 'selling_price', 'purchase_price', 'initial_stock', 'low_stock_threshold'] as const;

/**
 * Ligne du tableau des formats (desktop) : nom, prix de vente, prix d'achat, stock initial (ou stock
 * actuel d'un format enregistré), seuil, « ⋯ ». Ses erreurs s'affichent sur une sous-ligne pleine largeur.
 */
export function FormatTableRow({ index, register, errors, formats, variant, currency, label, onEntry }: FormatRowProps) {
  const t = useTranslations('articles.form');
  const uid = useId();
  const active = formats.rows[index]?.is_active ?? true;
  const failed = ERROR_FIELDS.filter((f) => errors?.[f]?.message);
  const input = (field: FormatInputField, name: string, width: string, extra: { suffix?: string; placeholder?: string; required?: boolean } = {}) => (
    <td className={`p-2 align-top ${field === 'name' ? 'ps-4' : ''}`}>
      <div className={width}>
        <FormatInput register={register} index={index} field={field} suffix={extra.suffix} placeholder={extra.placeholder}
          a11y={{ 'aria-label': name, 'aria-required': extra.required || undefined, 'aria-invalid': errors?.[field] ? true : undefined,
            'aria-describedby': errors?.[field] ? `${uid}-${field}` : undefined }} />
      </div>
    </td>
  );

  return (
    <>
      <tr className="border-t border-border">
        {input('name', t('format_name'), 'flex min-w-36 items-center gap-2', { placeholder: t('format_placeholder'), required: true })}
        {input('selling_price', t('selling_price'), 'w-27.5', { suffix: currency, required: true })}
        {input('purchase_price', t('purchase_price'), 'w-25', { suffix: currency })}
        {variant
          ? <td className="p-2 align-top"><FormatStock variant={variant} label={label} onEntry={onEntry} /></td>
          : input('initial_stock', t('initial_stock'), 'w-18', { placeholder: '0' })}
        {input('low_stock_threshold', t('threshold'), 'w-16')}
        <td className="py-2 pe-2 align-top">
          <div className="flex h-10 items-center gap-1">
            {!active && <InactiveBadge />}
            <FormatMenu index={index} formats={formats} variant={variant} label={label} />
          </div>
        </td>
      </tr>
      {failed.length > 0 && (
        <tr>
          <td colSpan={6} className="px-4 pb-2.5">
            {failed.map((f) => (
              <p key={f} id={`${uid}-${f}`} className="text-xs font-medium text-red-700 dark:text-red-400">{errors?.[f]?.message}</p>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}
