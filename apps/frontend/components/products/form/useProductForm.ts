'use client';

import { useMemo } from 'react';
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useFormSections } from '@/components/form/useFormSections';
import type { ProductDetail, ProductType } from '@/lib/hooks/useProducts';
import { notify } from '@/lib/notify';
import { firstError, serverErrors, type ProductFieldPath } from './productFormErrors';
import { defaultValues, productSchema, type ProductFormValues } from './productFormSchema';
import { useProductFormats } from './useProductFormats';
import { useProductPhotos, type PhotoChanges } from './useProductPhotos';
import { useProductScanPrefill } from './useProductScanPrefill';

export type ProductSection = 'photo' | 'stock' | 'reference';

/** Format unique : ses champs facultatifs vivent dans les cartes repliables Stock et Référence. */
const SECTION_OF: Partial<Record<ProductFieldPath, ProductSection>> = {
  'formats.0.initial_stock': 'stock', 'formats.0.low_stock_threshold': 'stock', 'formats.0.sku': 'reference', 'formats.0.barcode': 'reference',
};

const REFERENCE_FIELD = /^formats\.(\d+)\.(sku|barcode)$/;

interface ProductFormOptions {
  mode: 'create' | 'edit';
  type: ProductType;
  product?: ProductDetail;
  /** Résout `false` si l'article est enregistré mais que ses photos ne l'ont pas toutes été. */
  onSubmit: (values: ProductFormValues, photos: PhotoChanges | null) => Promise<boolean>;
  /** Carte ouverte à l'arrivée (« Gérer les photos » depuis la fiche). */
  initialSection?: ProductSection;
}

/**
 * Valeurs, formats, photos, sections et soumission du formulaire article. Une erreur (schéma ou
 * serveur) ouvre la section de son champ, ou la fenêtre des références de sa ligne, et y place le
 * focus ; succès et échec global sont notifiés. `scan` pré-remplit ce qui est vide (scan d'emballage).
 */
export function useProductForm({ mode, type, product, onSubmit, initialSection }: ProductFormOptions) {
  const t = useTranslations('articles.form');
  const resolver = useMemo<Resolver<ProductFormValues>>(() => (values, context, options) => {
    const article = values.type === 'product';
    return zodResolver(productSchema(t, { article, multi: article && values.multi }))(values, context, options);
  }, [t]);
  const form = useForm<ProductFormValues>({ resolver, shouldFocusError: false, defaultValues: defaultValues(type, product) });
  const sections = useFormSections(SECTION_OF, form.setFocus, initialSection ? [initialSection] : []);
  const formats = useProductFormats(form);
  const photos = useProductPhotos(product?.images);
  const scan = useProductScanPrefill(form, () => { if (!sections.isOpen('reference')) sections.toggle('reference'); });

  // Avec plusieurs formats, référence et code-barres se saisissent dans la fenêtre de leur ligne.
  const reveal = (path: ProductFieldPath) => {
    const reference = REFERENCE_FIELD.exec(path);
    const multi = form.getValues('multi') && form.getValues('type') === 'product';
    if (multi && reference) formats.setReferences({ index: Number(reference[1]), field: reference[2] as 'sku' | 'barcode' });
    else sections.reveal(path);
  };

  const onInvalid = (errors: FieldErrors<ProductFormValues>) => {
    const first = firstError(errors);
    if (first) reveal(first);
  };

  const submit = form.handleSubmit(async (values) => {
    try {
      const complete = await onSubmit(values, photos.dirty ? photos.changes() : null);
      if (complete) notify.success(t(mode === 'edit' ? 'toast_saved' : 'toast_created', { type: values.type }));
      else notify.error(t('extras_failed', { type: values.type }));
    } catch (err) {
      const found = serverErrors(err);
      for (const { path, message } of found) form.setError(path, { type: 'server', message: t(message) });
      const [first] = found;
      if (first) reveal(first.path);
      else notify.error(t('save_failed'));
    }
  }, onInvalid);

  return { form, submit, sections, formats, photos, scan };
}
