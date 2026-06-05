'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { AlertCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingSelect, FloatingTextarea } from '@/components/ui/floating-fields';
import { ApiError } from '@/lib/api-client';
import {
  UNIT_LABELS,
  type ProductDetail,
  type ProductFormData,
  type ProductType,
  type ProductUnit,
  type ProductVariantFormData,
} from '@/lib/hooks/useProducts';
import { useShop } from '@/lib/hooks/useShop';
import { PhotoPicker } from './form/PhotoPicker';
import { FieldError, SectionHeading } from './form/FieldError';
import { TypeHero } from './form/TypeHero';
import { CollapsibleSection } from './form/CollapsibleSection';

const UNIT_KEYS: { value: ProductUnit; tKey: 'piece' | 'gram' | 'kilogram' | 'milliliter' | 'liter' | 'meter' }[] = [
  { value: 'piece', tKey: 'piece' },
  { value: 'g',     tKey: 'gram' },
  { value: 'kg',    tKey: 'kilogram' },
  { value: 'mL',    tKey: 'milliliter' },
  { value: 'L',     tKey: 'liter' },
  { value: 'm',     tKey: 'meter' },
];

const DESCRIPTION_MAX = 1000;

export interface ProductFormExtras {
  image?: File | null;
  initialStock?: string | null;
}

export interface ProductFormSubmission {
  product: ProductFormData;
  variant: ProductVariantFormData | null;
}

interface ProductFormProps {
  type: ProductType;
  defaultValues?: Partial<ProductDetail>;
  isEditing?: boolean;
  onSubmit: (submission: ProductFormSubmission, extras: ProductFormExtras) => Promise<void>;
  isSubmitting: boolean;
}

export function ProductForm({ type, defaultValues, isEditing = false, onSubmit, isSubmitting }: ProductFormProps) {
  const t = useTranslations('articles.form');
  const tUnits = useTranslations('articles.units');
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';
  const currencySymbol = currency === 'EUR' ? '€' : currency;
  const isProduct = type === 'product';

  const firstVariant = defaultValues?.variants?.[0];

  const schema = useMemo(() => z.object({
    name: z.string().min(1, t('name_required')),
    reference: z.string().optional(),
    description: z.string().max(DESCRIPTION_MAX, t('description_max', { max: DESCRIPTION_MAX })).optional(),
    purchase_price: z.string().optional(),
    selling_price: z.string().optional(),
    unit: z.enum(['piece', 'g', 'kg', 'mL', 'L', 'm']).optional(),
    low_stock_threshold: z.string().optional(),
    initial_stock: z.string().optional(),
  }), [t]);
  type FormValues = z.infer<typeof schema>;

  const { register, handleSubmit, control, setError, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      reference: firstVariant?.sku ?? '',
      description: defaultValues?.description ?? '',
      purchase_price: firstVariant?.purchase_price ?? '',
      selling_price: firstVariant?.selling_price ?? '',
      unit: firstVariant?.unit ?? 'piece',
      low_stock_threshold: firstVariant?.low_stock_threshold != null
        ? String(firstVariant.low_stock_threshold)
        : '',
      initial_stock: '',
    },
  });

  const [showDescription, setShowDescription] = useState(() => Boolean(defaultValues?.description));
  const [image, setImage] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const apiErrorRef = useRef<HTMLDivElement>(null);

  const nameValue = useWatch({ control, name: 'name' }) ?? '';
  const sellingPriceValue = useWatch({ control, name: 'selling_price' }) ?? '';
  const descriptionValue = useWatch({ control, name: 'description' }) ?? '';
  const unitValue: ProductUnit = useWatch({ control, name: 'unit' }) ?? 'piece';
  const unitShort = UNIT_LABELS[unitValue];
  const stockUnitLabel = unitShort;
  const priceSuffix = `${currencySymbol}/${unitShort}`;
  const canSubmit = nameValue.trim().length > 0
    && (isEditing || sellingPriceValue.trim().length > 0)
    && !isSubmitting;

  useEffect(() => {
    if (apiError && apiErrorRef.current) {
      apiErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [apiError]);

  async function handleValid(values: FormValues) {
    setApiError(null);
    const purchase = values.purchase_price?.trim();
    const threshold = values.low_stock_threshold?.trim();
    const initial = values.initial_stock?.trim();
    try {
      const product: ProductFormData = {
        name: values.name,
        description: values.description,
      };
      const variant: ProductVariantFormData | null = isEditing ? null : {
        packaging_name: 'Par défaut',
        unit: isProduct ? (values.unit ?? 'piece') : 'piece',
        base_quantity: '1',
        selling_price: values.selling_price ?? '',
        purchase_price: purchase ? purchase : null,
        low_stock_threshold: isProduct && threshold ? threshold : null,
        sku: values.reference?.trim() ?? '',
      };
      await onSubmit(
        { product, variant },
        {
          image: !isEditing && image ? image : null,
          initialStock: !isEditing && isProduct && initial ? initial : null,
        },
      );
    } catch (err: unknown) {
      if (err instanceof ApiError && typeof err.data === 'object' && err.data !== null) {
        const data = err.data as Record<string, string[]>;
        if (data.name?.[0]) {
          setError('name', { message: data.name[0] });
          return;
        }
        const generic =
          data.selling_price?.[0] ??
          data.purchase_price?.[0] ??
          data.low_stock_threshold?.[0] ??
          data.unit?.[0] ??
          (typeof data.detail === 'string' ? data.detail : null);
        setApiError(generic ?? t('generic_error'));
        return;
      }
      setApiError(t('network_error'));
    }
  }

  return (
    <form
      onSubmit={handleSubmit(handleValid)}
      className="flex flex-col gap-4 p-4 pb-32 lg:max-w-2xl lg:mx-auto lg:px-8 lg:py-6 lg:pb-8"
    >
      {apiError && (
        <div
          ref={apiErrorRef}
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3"
        >
          <AlertCircle size={16} className="text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{apiError}</p>
        </div>
      )}

      <TypeHero type={type} />

      {!isEditing && (
        <section className="flex flex-col gap-2.5">
          <SectionHeading>{t('section_photo')}</SectionHeading>
          <PhotoPicker
            file={image}
            error={imageError}
            onChange={(f, err) => {
              setImage(f);
              setImageError(err);
            }}
          />
        </section>
      )}

      <section className="flex flex-col gap-2.5">
        <SectionHeading>{t('section_identity')}</SectionHeading>
        <div className="flex flex-col gap-0.5">
          <FloatingInput
            id="name"
            label={isProduct ? t('name_label_product') : t('name_label_service')}
            required
            aria-invalid={errors.name ? 'true' : 'false'}
            {...register('name')}
          />
          <FieldError message={errors.name?.message} />
        </div>
        {!isEditing && (
          <FloatingInput id="reference" label={t('sku_label')} {...register('reference')} />
        )}
      </section>

      {isProduct && !isEditing && (
        <section className="flex flex-col gap-2.5">
          <SectionHeading>{t('section_unit')}</SectionHeading>
          <Controller
            name="unit"
            control={control}
            render={({ field }) => (
              <FloatingSelect
                id="unit"
                label={t('unit_select_label')}
                value={field.value ?? 'piece'}
                onChange={(e) => field.onChange(e.target.value)}
              >
                {UNIT_KEYS.map((o) => (
                  <option key={o.value} value={o.value}>{tUnits(o.tKey)}</option>
                ))}
              </FloatingSelect>
            )}
          />
          <p className="text-[11px] text-muted-foreground px-1">
            {t('unit_helper')}
          </p>
        </section>
      )}

      {!isEditing && (
        <section className="flex flex-col gap-2.5">
          <SectionHeading>{t('section_price')}</SectionHeading>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <FloatingInput
                id="selling_price"
                label={t('sale_price')}
                required
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                suffix={isProduct ? priceSuffix : currencySymbol}
                aria-invalid={errors.selling_price ? 'true' : 'false'}
                {...register('selling_price')}
              />
              <FieldError message={errors.selling_price?.message} />
            </div>
            <FloatingInput
              id="purchase_price"
              label={t('purchase_price')}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              suffix={isProduct ? priceSuffix : currencySymbol}
              {...register('purchase_price')}
            />
          </div>
          {isProduct && (
            <p className="text-[11px] text-muted-foreground px-1">{t('purchase_helper')}</p>
          )}
        </section>
      )}

      {isProduct && !isEditing && (
        <section className="flex flex-col gap-2.5">
          <SectionHeading>{t('section_stock')}</SectionHeading>

          <div className="flex flex-col gap-0.5">
            <FloatingInput
              id="initial_stock"
              label={t('initial_stock')}
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              suffix={stockUnitLabel}
              {...register('initial_stock')}
            />
            <p className="text-[11px] text-muted-foreground px-1">{t('initial_stock_helper')}</p>
          </div>

          <div className="flex flex-col gap-0.5">
            <FloatingInput
              id="low_stock_threshold"
              label={t('alert_threshold')}
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              suffix={stockUnitLabel}
              {...register('low_stock_threshold')}
            />
            <p className="text-[11px] text-muted-foreground px-1">{t('alert_helper')}</p>
          </div>
        </section>
      )}

      <CollapsibleSection
        title={t('section_description')}
        icon={<FileText size={15} />}
        open={showDescription}
        onToggle={() => setShowDescription((v) => !v)}
      >
        <div className="flex flex-col gap-0.5">
          <FloatingTextarea
            id="description"
            label={isProduct ? t('description_product') : t('description_service')}
            rows={5}
            placeholder={isProduct
              ? t('description_placeholder_product')
              : t('description_placeholder_service')}
            maxLength={DESCRIPTION_MAX}
            aria-invalid={errors.description ? 'true' : 'false'}
            {...register('description')}
          />
          <div className="flex items-center justify-between px-1">
            <FieldError message={errors.description?.message} />
            <span className={`text-[10px] tabular-nums ml-auto ${
              descriptionValue.length > DESCRIPTION_MAX * 0.9 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground/70'
            }`}>
              {t('char_count', { count: descriptionValue.length, max: DESCRIPTION_MAX })}
            </span>
          </div>
        </div>
      </CollapsibleSection>

      <div className="sticky bottom-24 lg:bottom-2 -mx-4 lg:mx-0 px-4 lg:px-0 mt-2">
        <Button
          type="submit"
          className="w-full rounded-full shadow-lg h-12 text-sm font-semibold"
          disabled={!canSubmit}
        >
          {isSubmitting ? t('saving') : isProduct ? t('submit_product') : t('submit_service')}
        </Button>
      </div>
    </form>
  );
}
