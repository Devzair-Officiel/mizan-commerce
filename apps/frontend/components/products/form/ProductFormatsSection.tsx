'use client';

import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Tag } from 'lucide-react';
import { FormSection } from '@/components/form/FormSection';
import { HEADER_LINK } from '@/components/form/fieldStyles';
import { quickEntryOf } from '@/components/products/detail/productFormats';
import { QuickEntrySheet } from '@/components/stock/quick-entry/QuickEntrySheet';
import type { QuickEntryVariant } from '@/components/stock/quick-entry/QuickEntryForm';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import type { ProductDetail, ProductVariant } from '@/lib/hooks/useProducts';
import { FormatCard } from './formats/FormatCard';
import { FormatReferenceSheet } from './formats/FormatReferenceSheet';
import { FormatsFooter } from './formats/FormatsFooter';
import { FormatsMargin } from './formats/FormatsMargin';
import { FormatsTable } from './formats/FormatsTable';
import type { ProductFormValues } from './productFormSchema';
import type { ProductFormats } from './useProductFormats';

interface ProductFormatsSectionProps {
  form: UseFormReturn<ProductFormValues>;
  formats: ProductFormats;
  product?: ProductDetail;
  unit: string;
  currency: string;
  currencyCode: string;
  order: string;
}

const SHORTCUT = 'inline-flex h-8.5 items-center rounded-full border border-border bg-card px-3 text-[0.8125rem] font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30';

/**
 * Formats et prix (article à plusieurs formats) : remplace les cartes Prix et Stock. Tableau sur
 * desktop, cartes empilées sur mobile (jamais les deux : les champs ne s'enregistrent qu'une fois).
 */
export function ProductFormatsSection({ form, formats, product, unit, currency, currencyCode, order }: ProductFormatsSectionProps) {
  const t = useTranslations('articles.form');
  const isDesktop = useIsDesktop();
  const [entry, setEntry] = useState<QuickEntryVariant | null>(null);
  const { register, setFocus, formState: { errors } } = form;
  const variantOf = (i: number) => product?.variants.find((v) => v.id === formats.rows[i]?.id);
  const labelOf = (i: number) => formats.rows[i]?.name.trim() || t('format_number', { index: i + 1 });
  const onEntry = (variant: ProductVariant) => { if (product) setEntry(quickEntryOf(product, variant)); };
  const row = { register, formats, currency, onEntry };

  return (
    <FormSection icon={Tag} order={order} title={t('section_formats')} description={t('formats_help')}
      action={formats.rows.length === 1 && <button type="button" onClick={formats.toSingle} className={HEADER_LINK}>{t('formats_single')}</button>}>
      {isDesktop ? (
        <div className="-mx-5 -mt-5 border-b border-border">
          <FormatsTable {...row} errors={errors} variantOf={variantOf} labelOf={labelOf} editing={Boolean(product)} />
          <FormatsFooter formats={formats} unit={unit} mode={product ? 'edit' : 'create'} className="border-t border-border px-4 py-3" />
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {formats.keys.map((key, i) => (
              <FormatCard key={key} index={i} {...row} errors={errors.formats?.[i]} variant={variantOf(i)} label={labelOf(i)} />
            ))}
          </ul>
          <FormatsFooter formats={formats} unit={unit} mode={product ? 'edit' : 'create'} />
        </>
      )}
      <FormatsMargin rows={formats.rows} />
      {formats.rows.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={formats.samePrice} className={SHORTCUT}>{t('formats_same_price')}</button>
          <button type="button" onClick={formats.sameThreshold} className={SHORTCUT}>{t('formats_same_threshold')}</button>
        </div>
      )}
      <FormatReferenceSheet target={formats.references} label={formats.references ? labelOf(formats.references.index) : ''}
        register={register} setFocus={setFocus} errors={errors} onClose={() => formats.setReferences(null)} />
      <QuickEntrySheet variant={entry} currencyCode={currencyCode} onClose={() => setEntry(null)} />
    </FormSection>
  );
}
