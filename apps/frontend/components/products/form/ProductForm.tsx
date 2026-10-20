'use client';

import { useEffect } from 'react';
import { useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { FormActions } from '@/components/form/FormActions';
import { FORM_COLUMN, FORM_COLUMNS } from '@/components/form/fieldStyles';
import { useFormLeave } from '@/components/form/useFormLeave';
import type { ProductDetail, ProductType } from '@/lib/hooks/useProducts';
import { ProductScanCard } from '@/components/products/scan/ProductScanCard';
import { ProductFormatsSection } from './ProductFormatsSection';
import { ProductInfoSection } from './ProductInfoSection';
import { ProductPhotoSection } from './ProductPhotoSection';
import { ProductPriceSection } from './ProductPriceSection';
import { ProductReferenceSection } from './ProductReferenceSection';
import { ProductStockSection } from './ProductStockSection';
import { serviceFormatsCount, type ProductFormValues } from './productFormSchema';
import { useProductForm, type ProductSection } from './useProductForm';
import type { PhotoChanges } from './useProductPhotos';

interface ProductFormProps {
  mode: 'create' | 'edit';
  type: ProductType;
  /** Boutique mixte : le type se choisit à la création. */
  mixed: boolean;
  currencyCode: string;
  product?: ProductDetail;
  onSubmit: (values: ProductFormValues, photos: PhotoChanges | null) => Promise<boolean>;
  isSubmitting: boolean;
  /** Retour sans enregistrer (après la garde « quitter sans enregistrer »). */
  onLeave: () => void;
  /** Ouvert depuis « Gérer les photos » de la fiche : la carte Photo est ouverte et affichée. */
  focusPhotos?: boolean;
}

/**
 * Formulaire article au gabarit v3. Colonne principale : Informations (dont l'unité de vente, avant
 * les prix et le stock qui en dépendent), puis Prix et Stock (format unique) ou Formats et prix
 * (plusieurs formats) ; colonne latérale : Photo, Référence. Sur mobile, la photo facultative vient
 * après les champs obligatoires. Un service n'a ni stock ni unité ; s'il a plusieurs formats, ses
 * prix se règlent sur la fiche. En création d'un article, « Scanner l'emballage » vient en tête.
 */
export function ProductForm({ mode, type, mixed, currencyCode, product, onSubmit, isSubmitting, onLeave, focusPhotos }: ProductFormProps) {
  const t = useTranslations('articles.form');
  const { form, submit, sections, formats, photos, scan } = useProductForm({ mode, type, product, onSubmit, initialSection: focusPhotos ? 'photo' : undefined });
  const { register, control, setFocus, formState: { errors, isDirty } } = form;
  const [currentType, unit] = useWatch({ control, name: ['type', 'unit'] });
  const dirty = isDirty || photos.dirty;
  const cancel = useFormLeave(dirty && !isSubmitting, onLeave);
  const fields = { control, register, errors };
  const section = (name: ProductSection) => ({ open: sections.isOpen(name), onToggle: () => sections.toggle(name) });
  const serviceNote = product && currentType === 'service' && serviceFormatsCount(product) !== 1
    ? { count: serviceFormatsCount(product), href: `/products/${product.id}` } : undefined;
  const article = currentType === 'product';
  const multi = article && formats.multi;
  const single = product?.variants.find((v) => v.id === formats.rows[0]?.id);
  const currency = currencyCode === 'EUR' ? '€' : currencyCode;

  // Défilement d'affichage seulement (aucune action) : la carte Photo, à l'arrivée depuis la fiche.
  useEffect(() => { if (focusPhotos) document.getElementById('photos')?.scrollIntoView({ block: 'start' }); }, [focusPhotos]);

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5 px-4 pt-4 pb-28 lg:pt-0 lg:pb-8">
      {mode === 'create' && article && <ProductScanCard onScanned={scan.apply} />}
      <div className={FORM_COLUMNS}>
        <div className={FORM_COLUMN}>
          <ProductInfoSection {...fields} detected={scan.detected} mode={mode} mixed={mixed} type={currentType} multi={multi} formats={serviceNote} order="max-lg:order-1" />
          {multi ? (
            <ProductFormatsSection form={form} formats={formats} product={product} unit={unit} currency={currency} currencyCode={currencyCode} order="max-lg:order-2" />
          ) : !serviceNote && (
            <ProductPriceSection {...fields} currency={currency} currencyCode={currencyCode} onMultiple={formats.toMulti} order="max-lg:order-2" />
          )}
          {article && !multi && (
            <ProductStockSection {...fields} {...section('stock')} order="max-lg:order-3" current={single
              ? { quantity: single.stock_quantity, stockInHref: `/stock/entree?variant=${single.id}` } : undefined} />
          )}
        </div>
        <div className={FORM_COLUMN}>
          <ProductPhotoSection photos={photos} productId={product?.id} {...section('photo')} order="max-lg:order-4" />
          {article && <ProductReferenceSection {...fields} detected={scan.detected} setFocus={setFocus} multi={multi} {...section('reference')} order="max-lg:order-5" />}
        </div>
      </div>
      <FormActions dirty={dirty} submitting={isSubmitting}
        submitLabel={mode === 'edit' ? t('submit_edit') : multi ? t('submit_create_formats', { count: formats.rows.length }) : t('submit_create', { type: currentType })}
        submitDisabled={mode === 'edit' && !dirty} onCancel={cancel} />
    </form>
  );
}
