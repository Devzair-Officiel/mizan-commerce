'use client';

import { useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { NotebookText } from 'lucide-react';
import { FormActions } from '@/components/form/FormActions';
import { FormCard } from '@/components/form/FormCard';
import { FormCollapsibleSection } from '@/components/form/FormCollapsibleSection';
import { FormField } from '@/components/form/FormField';
import { FIELD_TEXTAREA } from '@/components/form/fieldStyles';
import { useFormLeave } from '@/components/form/useFormLeave';
import type { ProductDetail, ProductType, ProductVariant } from '@/lib/hooks/useProducts';
import { ProductIdentitySection } from './ProductIdentitySection';
import { ProductPhotoSection } from './ProductPhotoSection';
import { ProductPurchaseSection } from './ProductPurchaseSection';
import { ProductReferenceSection } from './ProductReferenceSection';
import { ProductStockSection } from './ProductStockSection';
import { useProductForm, type ProductFormValues } from './useProductForm';

interface ProductFormProps {
  mode: 'create' | 'edit';
  type: ProductType;
  /** Boutique mixte : le type se choisit à la création. */
  mixed: boolean;
  currencyCode: string;
  product?: ProductDetail;
  /** Format réglé par le formulaire ; `null` en modification d'un article à plusieurs formats. */
  variant: ProductVariant | null;
  onSubmit: (values: ProductFormValues, photo: File | null) => Promise<boolean>;
  isSubmitting: boolean;
  /** Retour sans enregistrer (après la garde « quitter sans enregistrer »). */
  onLeave: () => void;
}

/**
 * Formulaire article au gabarit des formulaires : Identité (toujours ouverte), puis Photo, Prix
 * d'achat, Stock, Référence et Description, repliables. Un service n'a ni stock ni unité ; un
 * article à plusieurs formats ne règle ici que ses informations communes.
 */
export function ProductForm({ mode, type, mixed, currencyCode, product, variant, onSubmit, isSubmitting, onLeave }: ProductFormProps) {
  const t = useTranslations('articles.form');
  const { form, submit, sections, photo, setPhoto } = useProductForm({ mode, type, product, variant, onSubmit });
  const { register, control, formState: { errors, isDirty } } = form;
  const [currentType, description] = useWatch({ control, name: ['type', 'description'] });
  const dirty = isDirty || photo !== null;
  const cancel = useFormLeave(dirty && !isSubmitting, onLeave);
  const fields = { control, register, errors };
  const section = (name: Parameters<typeof sections.isOpen>[0]) => ({ open: sections.isOpen(name), onToggle: () => sections.toggle(name) });
  const formats = product && !variant ? { count: product.variants.filter((v) => v.is_active).length, href: `/products/${product.id}` } : undefined;
  const article = currentType === 'product' && !formats;
  const currency = currencyCode === 'EUR' ? '€' : currencyCode;

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5 px-4 pt-4 pb-28 lg:pt-0 lg:pb-8">
      <FormCard>
        <ProductIdentitySection {...fields} mode={mode} mixed={mixed} currency={currency} formats={formats} />
        <ProductPhotoSection file={photo} onChange={setPhoto} currentUrl={product?.primary_image ?? null} {...section('photo')} />
        {article && <ProductPurchaseSection {...fields} currency={currency} currencyCode={currencyCode} {...section('purchase')} />}
        {article && (
          <ProductStockSection {...fields} {...section('stock')} current={product && variant
            ? { quantity: variant.stock_quantity, stockInHref: `/stock/add?product=${product.id}&variant=${variant.id}` } : undefined} />
        )}
        {article && <ProductReferenceSection {...fields} {...section('reference')} />}
        <FormCollapsibleSection title={t('section_description')} description={t('section_description_help', { type: currentType })}
          summary={description.replace(/\s+/g, ' ').trim()} icon={<NotebookText size={19} strokeWidth={1.75} />} {...section('description')}>
          <FormField label={t('description')} error={errors.description?.message} wide>
            {(c) => <textarea {...c} {...register('description')} dir="auto" rows={4} className={FIELD_TEXTAREA} />}
          </FormField>
        </FormCollapsibleSection>
      </FormCard>
      <FormActions dirty={dirty} submitting={isSubmitting}
        submitLabel={mode === 'edit' ? t('submit_edit') : t('submit_create', { type: currentType })}
        submitDisabled={mode === 'edit' && !dirty} onCancel={cancel} />
    </form>
  );
}
