'use client';

import { useEffect } from 'react';
import type { FieldErrors, UseFormRegister, UseFormSetFocus } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/form/FormField';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { ProductFormValues } from '../productFormSchema';
import type { ReferenceTarget } from '../useProductFormats';

interface FormatReferenceSheetProps {
  target: ReferenceTarget | null;
  /** Nom affiché de la ligne, sous le titre. */
  label: string;
  register: UseFormRegister<ProductFormValues>;
  setFocus: UseFormSetFocus<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
  onClose: () => void;
}

/**
 * Référence et code-barres d'une ligne du tableau des formats (menu « ⋯ ») : champs du formulaire,
 * enregistrés avec lui. L'Entrée d'un lecteur de code-barres ne ferme rien et n'enregistre rien.
 */
export function FormatReferenceSheet({ target, label, register, setFocus, errors, onClose }: FormatReferenceSheetProps) {
  const t = useTranslations('articles.form');
  const tUi = useTranslations('ui.form');

  // Focus d'affichage (aucune action) : le champ choisi dans le menu, après le piège à focus de la fenêtre.
  useEffect(() => { if (target) setFocus(`formats.${target.index}.${target.field}`); }, [target, setFocus]);

  if (!target) return null;
  const { index } = target;
  const rowErrors = errors.formats?.[index];
  return (
    <BottomSheet open onClose={onClose} title={t('section_reference')} description={label}
      footer={(
        <button type="button" onClick={onClose}
          className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/30">
          {tUi('done')}
        </button>
      )}>
      <div className="flex flex-col gap-4">
        <FormField label={t('sku')} error={rowErrors?.sku?.message}>
          {(c) => <input {...c} {...register(`formats.${index}.sku`)} maxLength={64} dir="auto" autoComplete="off" className={FIELD_CONTROL} />}
        </FormField>
        <FormField label={t('barcode')} error={rowErrors?.barcode?.message}>
          {(c) => (
            <input {...c} {...register(`formats.${index}.barcode`)} maxLength={64} inputMode="numeric" autoComplete="off"
              className={`${FIELD_CONTROL} tabular-nums`} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
          )}
        </FormField>
      </div>
    </BottomSheet>
  );
}
