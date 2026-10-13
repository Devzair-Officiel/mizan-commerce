'use client';

import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import type { ProductVariant } from '@/lib/hooks/useProducts';
import type { ProductFormValues } from '../productFormSchema';
import type { ProductFormats } from '../useProductFormats';
import { FormatTableRow } from './FormatTableRow';

interface FormatsTableProps {
  formats: ProductFormats;
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
  currency: string;
  /** Format enregistré de chaque ligne (modification). */
  variantOf: (index: number) => ProductVariant | undefined;
  labelOf: (index: number) => string;
  onEntry: (variant: ProductVariant) => void;
  /** Modification : la colonne montre le stock actuel des formats enregistrés. */
  editing: boolean;
}

const TH = 'px-2 py-2.5 text-start text-xs font-semibold whitespace-nowrap text-muted-foreground';

/** Tableau des formats (desktop) : une ligne par format, défilement horizontal si la carte est étroite. */
export function FormatsTable({ formats, register, errors, currency, variantOf, labelOf, onEntry, editing }: FormatsTableProps) {
  const t = useTranslations('articles.form');
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-155 border-collapse">
        <thead className="header-band">
          <tr>
            <th scope="col" className={`${TH} ps-4`}>{t('format_name')}<span className="text-red-700 dark:text-red-400" aria-hidden> *</span></th>
            <th scope="col" className={TH}>{t('selling_price')}<span className="text-red-700 dark:text-red-400" aria-hidden> *</span></th>
            <th scope="col" className={TH}>{t('purchase_price')}</th>
            <th scope="col" className={TH}>{t(editing ? 'current_stock' : 'initial_stock')}</th>
            <th scope="col" className={TH}>{t('threshold')}</th>
            <th scope="col" className={`${TH} pe-4`}><span className="sr-only">{t('format_actions')}</span></th>
          </tr>
        </thead>
        <tbody>
          {formats.keys.map((key, index) => (
            <FormatTableRow key={key} index={index} register={register} errors={errors.formats?.[index]} formats={formats}
              variant={variantOf(index)} currency={currency} label={labelOf(index)} onEntry={onEntry} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
