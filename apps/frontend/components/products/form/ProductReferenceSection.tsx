'use client';

import { useState } from 'react';
import { useWatch, type Control, type FieldErrors, type UseFormRegister, type UseFormSetFocus } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Barcode, ScanBarcode } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import { FormSection } from '@/components/form/FormSection';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { DetectedBadge } from './DetectedBadge';
import type { ProductFormValues } from './productFormSchema';
import type { ScanProposals } from './productScanPrefill';

interface ProductReferenceSectionProps {
  control: Control<ProductFormValues>;
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
  setFocus: UseFormSetFocus<ProductFormValues>;
  /** Plusieurs formats : référence et code-barres se règlent par ligne, depuis le menu « ⋯ ». */
  multi: boolean;
  open: boolean;
  onToggle: () => void;
  order: string;
  /** Valeurs posées par le scan d'emballage : badge « Détecté, à vérifier ». */
  detected?: ScanProposals;
}

/**
 * Référence et code-barres (facultatifs) du format unique. « Scanner » place le curseur dans le
 * code-barres pour le lecteur physique ; l'Entrée qu'il envoie en fin de code n'enregistre pas le formulaire.
 * Avec plusieurs formats, la carte ne fait qu'expliquer le réglage par ligne.
 */
export function ProductReferenceSection({ control, register, errors, setFocus, multi, open, onToggle, order, detected = {} }: ProductReferenceSectionProps) {
  const t = useTranslations('articles.form');
  const [scanHelp, setScanHelp] = useState(false);
  const [sku, barcode] = useWatch({ control, name: ['formats.0.sku', 'formats.0.barcode'] });
  const summary = [sku.trim() && t('sku_summary', { sku: sku.trim() }), barcode.trim() && t('barcode_summary', { barcode: barcode.trim() })]
    .filter(Boolean).join(', ');

  if (multi) {
    return (
      <FormSection icon={Barcode} order={order} title={t('section_reference')} status="optional">
        <p className="text-[0.8125rem] leading-normal text-muted-foreground">{t('reference_formats_note')}</p>
      </FormSection>
    );
  }

  return (
    <FormSection icon={Barcode} order={order} title={t('section_reference')} status="optional" collapse={{ open, onToggle, summary }}>
      <FormField label={t('sku')} error={errors.formats?.[0]?.sku?.message}>
        {(c) => <input {...c} {...register('formats.0.sku')} dir="auto" autoComplete="off" className={FIELD_CONTROL} />}
      </FormField>
      <FormField label={t('barcode')} error={errors.formats?.[0]?.barcode?.message}
        badge={<DetectedBadge control={control} name="formats.0.barcode" value={detected['formats.0.barcode']} />}>
        {(c) => (
          <div className="flex gap-2">
            <input {...c} {...register('formats.0.barcode')} inputMode="numeric" autoComplete="off" className={`${FIELD_CONTROL} tabular-nums`}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
            <button type="button" aria-label={t('scan_barcode')} onClick={() => { setScanHelp(true); setFocus('formats.0.barcode', { shouldSelect: true }); }}
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30">
              <ScanBarcode size={18} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        )}
      </FormField>
      {scanHelp && <p role="status" className="-mt-2 text-xs text-muted-foreground">{t('scan_help')}</p>}
    </FormSection>
  );
}
