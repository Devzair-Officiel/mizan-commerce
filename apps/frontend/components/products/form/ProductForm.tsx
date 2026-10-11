'use client';

import { useEffect } from 'react';
import { useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { FormActions } from '@/components/form/FormActions';
import { FORM_COLUMN, FORM_COLUMNS } from '@/components/form/fieldStyles';
import { useFormLeave } from '@/components/form/useFormLeave';
import type { ProductDetail, ProductType, ProductVariant } from '@/lib/hooks/useProducts';
import { ProductInfoSection } from './ProductInfoSection';
import { ProductPhotoSection } from './ProductPhotoSection';
import { ProductPriceSection } from './ProductPriceSection';
import { ProductReferenceSection } from './ProductReferenceSection';
import { ProductSaleSection } from './ProductSaleSection';
import { ProductStockSection } from './ProductStockSection';
import { useProductForm, type ProductFormValues, type ProductSection } from './useProductForm';
import type { PhotoChanges } from './useProductPhotos';

interface ProductFormProps {
  mode: 'create' | 'edit';
  type: ProductType;
  /** Boutique mixte : le type se choisit à la création. */
  mixed: boolean;
  currencyCode: string;
  product?: ProductDetail;
  /** Format réglé par le formulaire ; `null` en modification d'un article à plusieurs formats. */
  variant: ProductVariant | null;
  onSubmit: (values: ProductFormValues, photos: PhotoChanges | null) => Promise<boolean>;
  isSubmitting: boolean;
  /** Retour sans enregistrer (après la garde « quitter sans enregistrer »). */
  onLeave: () => void;
  /** Ouvert depuis « Gérer les photos » de la fiche : la carte Photo est ouverte et affichée. */
  focusPhotos?: boolean;
}

/**
 * Formulaire article au gabarit v3. Colonne principale : Informations, Prix, Stock ; colonne
 * latérale : Photo, Vente, Référence. Un service n'a ni stock ni unité ; un article à plusieurs
 * formats ne règle ici que ses informations communes et ses photos.
 */
export function ProductForm({ mode, type, mixed, currencyCode, product, variant, onSubmit, isSubmitting, onLeave, focusPhotos }: ProductFormProps) {
  const t = useTranslations('articles.form');
  const { form, submit, sections, photos } = useProductForm({ mode, type, product, variant, onSubmit, initialSection: focusPhotos ? 'photo' : undefined });
  const { register, control, setFocus, formState: { errors, isDirty } } = form;
  const currentType = useWatch({ control, name: 'type' });
  const dirty = isDirty || photos.dirty;
  const cancel = useFormLeave(dirty && !isSubmitting, onLeave);
  const fields = { control, register, errors };
  const section = (name: ProductSection) => ({ open: sections.isOpen(name), onToggle: () => sections.toggle(name) });
  const formats = product && !variant ? { count: product.variants.filter((v) => v.is_active).length, href: `/products/${product.id}` } : undefined;
  const article = currentType === 'product' && !formats;
  const currency = currencyCode === 'EUR' ? '€' : currencyCode;

  // Défilement d'affichage seulement (aucune action) : la carte Photo, à l'arrivée depuis la fiche.
  useEffect(() => { if (focusPhotos) document.getElementById('photos')?.scrollIntoView({ block: 'start' }); }, [focusPhotos]);

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5 px-4 pt-4 pb-28 lg:pt-0 lg:pb-8">
      <div className={FORM_COLUMNS}>
        <div className={FORM_COLUMN}>
          <ProductInfoSection register={register} errors={errors} mode={mode} mixed={mixed} type={currentType} formats={formats} order="max-lg:order-1" />
          {!formats && <ProductPriceSection {...fields} currency={currency} currencyCode={currencyCode} order="max-lg:order-3" />}
          {article && (
            <ProductStockSection {...fields} {...section('stock')} order="max-lg:order-4" current={product && variant
              ? { quantity: variant.stock_quantity, stockInHref: `/stock/entree?variant=${variant.id}` } : undefined} />
          )}
        </div>
        <div className={FORM_COLUMN}>
          <ProductPhotoSection photos={photos} productId={product?.id} {...section('photo')} order="max-lg:order-2" />
          {article && <ProductSaleSection control={control} mode={mode} order="max-lg:order-5" />}
          {article && <ProductReferenceSection {...fields} setFocus={setFocus} {...section('reference')} order="max-lg:order-6" />}
        </div>
      </div>
      <FormActions dirty={dirty} submitting={isSubmitting}
        submitLabel={mode === 'edit' ? t('submit_edit') : t('submit_create', { type: currentType })}
        submitDisabled={mode === 'edit' && !dirty} onCancel={cancel} />
    </form>
  );
}
