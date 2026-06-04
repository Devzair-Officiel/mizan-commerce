'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Camera, ChevronDown, FileText, Package, Sparkles, X } from 'lucide-react';
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

const UNIT_OPTIONS: { value: ProductUnit; label: string }[] = [
  { value: 'piece', label: 'Pièce' },
  { value: 'g',     label: 'Gramme (g)' },
  { value: 'kg',    label: 'Kilogramme (kg)' },
  { value: 'mL',    label: 'Millilitre (mL)' },
  { value: 'L',     label: 'Litre (L)' },
  { value: 'm',     label: 'Mètre (m)' },
];

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const DESCRIPTION_MAX = 1000;

const schema = z.object({
  name: z.string().min(1, 'Nom requis'),
  reference: z.string().optional(),
  description: z.string().max(DESCRIPTION_MAX, `${DESCRIPTION_MAX} caractères maximum`).optional(),
  purchase_price: z.string().optional(),
  // En édition, le prix est sur la variante : non requis ici.
  selling_price: z.string().optional(),
  unit: z.enum(['piece', 'g', 'kg', 'mL', 'L', 'm']).optional(),
  low_stock_threshold: z.string().optional(),
  initial_stock: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export interface ProductFormExtras {
  image?: File | null;
  initialStock?: string | null;
}

export interface ProductFormSubmission {
  product: ProductFormData;
  /** Données de la variante par défaut — null en édition (les variantes se gèrent ailleurs). */
  variant: ProductVariantFormData | null;
}

interface ProductFormProps {
  type: ProductType;
  defaultValues?: Partial<ProductDetail>;
  /** Mode édition : unit déjà figé, on ne ré-affiche pas photo / stock initial. */
  isEditing?: boolean;
  onSubmit: (submission: ProductFormSubmission, extras: ProductFormExtras) => Promise<void>;
  isSubmitting: boolean;
}

export function ProductForm({ type, defaultValues, isEditing = false, onSubmit, isSubmitting }: ProductFormProps) {
  const isProduct = type === 'product';

  const firstVariant = defaultValues?.variants?.[0];

  const { register, handleSubmit, control, watch, setError, formState: { errors } } = useForm<FormValues>({
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

  const nameValue = watch('name');
  const sellingPriceValue = watch('selling_price') ?? '';
  const descriptionValue = watch('description') ?? '';
  const unitValue: ProductUnit = watch('unit') ?? 'piece';
  const unitShort = UNIT_LABELS[unitValue]; // "pièce", "kg", "g", "mL", "L", "m"
  const stockUnitLabel = unitValue === 'piece' ? 'pièces' : unitShort;
  const priceSuffix = `€/${unitShort}`;
  // En édition, on n'a plus besoin du prix dans la validation : il vit sur la variante.
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
        setApiError(generic ?? 'Une erreur est survenue. Vérifiez les champs et réessayez.');
        return;
      }
      setApiError('Impossible de joindre le serveur. Réessayez dans un instant.');
    }
  }

  return (
    <form
      onSubmit={handleSubmit(handleValid)}
      className="flex flex-col gap-4 p-4 pb-32 lg:max-w-2xl lg:mx-auto lg:px-8 lg:py-6 lg:pb-8"
    >
      {/* Bandeau d'erreur API */}
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

      {/* Hero : type indicator */}
      <TypeHero type={type} />

      {/* Photo — uniquement à la création */}
      {!isEditing && (
        <section className="flex flex-col gap-2.5">
          <SectionHeading>Photo</SectionHeading>
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

      {/* Identité */}
      <section className="flex flex-col gap-2.5">
        <SectionHeading>Identité</SectionHeading>
        <div className="flex flex-col gap-0.5">
          <FloatingInput
            id="name"
            label={isProduct ? 'Nom du produit' : 'Nom du service'}
            required
            aria-invalid={errors.name ? 'true' : 'false'}
            {...register('name')}
          />
          <FieldError message={errors.name?.message} />
        </div>
        {!isEditing && (
          <FloatingInput id="reference" label="Référence / SKU (optionnel)" {...register('reference')} />
        )}
      </section>

      {/* Unité de vente — produits uniquement, création seulement.
          Placée AVANT le prix pour ancrer le référentiel ("le prix de quoi ?"). */}
      {isProduct && !isEditing && (
        <section className="flex flex-col gap-2.5">
          <SectionHeading>Unité de vente</SectionHeading>
          <Controller
            name="unit"
            control={control}
            render={({ field }) => (
              <FloatingSelect
                id="unit"
                label="Comment vendez-vous ce produit ?"
                value={field.value ?? 'piece'}
                onChange={(e) => field.onChange(e.target.value)}
              >
                {UNIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </FloatingSelect>
            )}
          />
          <p className="text-[11px] text-muted-foreground px-1">
            Définitif après création — tous les prix et stocks s&apos;exprimeront dans cette unité.
          </p>
        </section>
      )}

      {/* Prix — création seulement (en édition : passer par les conditionnements).
          Champs en pleine largeur : labels + suffixes ne tiennent pas en 2 colonnes sur mobile. */}
      {!isEditing && (
      <section className="flex flex-col gap-2.5">
        <SectionHeading>Prix</SectionHeading>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <FloatingInput
              id="selling_price"
              label="Prix de vente"
              required
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              suffix={isProduct ? priceSuffix : '€'}
              aria-invalid={errors.selling_price ? 'true' : 'false'}
              {...register('selling_price')}
            />
            <FieldError message={errors.selling_price?.message} />
          </div>
          <FloatingInput
            id="purchase_price"
            label="Prix d'achat (optionnel)"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            suffix={isProduct ? priceSuffix : '€'}
            {...register('purchase_price')}
          />
        </div>
        {isProduct && (
          <p className="text-[11px] text-muted-foreground px-1">Le prix d&apos;achat sert au calcul de marge et à la zakât. Laissez vide s&apos;il varie.</p>
        )}
      </section>
      )}

      {/* Stock — produits uniquement, création seulement */}
      {isProduct && !isEditing && (
        <section className="flex flex-col gap-2.5">
          <SectionHeading>Stock</SectionHeading>

          <div className="flex flex-col gap-0.5">
            <FloatingInput
              id="initial_stock"
              label="Stock initial (optionnel)"
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              suffix={stockUnitLabel}
              {...register('initial_stock')}
            />
            <p className="text-[11px] text-muted-foreground px-1">Enregistre une entrée stock « Stock initial » à la création.</p>
          </div>

          <div className="flex flex-col gap-0.5">
            <FloatingInput
              id="low_stock_threshold"
              label="Seuil d'alerte (optionnel)"
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              suffix={stockUnitLabel}
              {...register('low_stock_threshold')}
            />
            <p className="text-[11px] text-muted-foreground px-1">Notifié quand le stock passe sous ce seuil. Laissez vide pour désactiver.</p>
          </div>
        </section>
      )}

      {/* Description — collapsible */}
      <CollapsibleSection
        title="Description"
        icon={<FileText size={15} />}
        open={showDescription}
        onToggle={() => setShowDescription((v) => !v)}
      >
        <div className="flex flex-col gap-0.5">
          <FloatingTextarea
            id="description"
            label={isProduct ? 'Description du produit' : 'Description du service'}
            rows={5}
            placeholder={isProduct
              ? "Composition, conseils d'utilisation, dimensions, matière…"
              : 'Déroulé de la prestation, durée moyenne, conditions…'}
            maxLength={DESCRIPTION_MAX}
            aria-invalid={errors.description ? 'true' : 'false'}
            {...register('description')}
          />
          <div className="flex items-center justify-between px-1">
            <FieldError message={errors.description?.message} />
            <span className={`text-[10px] tabular-nums ml-auto ${
              descriptionValue.length > DESCRIPTION_MAX * 0.9 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground/70'
            }`}>
              {descriptionValue.length} / {DESCRIPTION_MAX}
            </span>
          </div>
        </div>
      </CollapsibleSection>

      {/* Sticky submit */}
      <div className="sticky bottom-24 lg:bottom-2 -mx-4 lg:mx-0 px-4 lg:px-0 mt-2">
        <Button
          type="submit"
          className="w-full rounded-full shadow-lg h-12 text-sm font-semibold"
          disabled={!canSubmit}
        >
          {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </form>
  );
}

function PhotoPicker({
  file,
  error,
  onChange,
}: {
  file: File | null;
  error: string | null;
  onChange: (file: File | null, error: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleFiles(files: FileList | null) {
    const next = files?.[0] ?? null;
    if (!next) {
      onChange(null, null);
      return;
    }
    if (!next.type.startsWith('image/')) {
      onChange(null, 'Format non supporté : choisissez une image.');
      return;
    }
    if (next.size > MAX_IMAGE_SIZE) {
      onChange(null, 'Image trop lourde (5 Mo max).');
      return;
    }
    onChange(next, null);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    if (inputRef.current) inputRef.current.value = '';
    onChange(null, null);
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-2 pr-4 active:scale-[0.99] transition-transform text-left"
      >
        <span className="relative flex h-16 w-16 items-center justify-center rounded-xl bg-muted/40 overflow-hidden shrink-0">
          {previewUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Aperçu" className="h-full w-full object-cover" />
              <span
                onClick={clear}
                className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-background border border-border shadow"
                aria-label="Retirer la photo"
              >
                <X size={11} className="text-foreground" />
              </span>
            </>
          ) : (
            <Camera size={18} className="text-muted-foreground" />
          )}
        </span>
        <span className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">
            {previewUrl ? 'Photo sélectionnée' : 'Ajouter une photo'}
          </span>
          {error
            ? <span className="flex items-center gap-1 text-[11px] text-destructive"><AlertCircle size={11} /> {error}</span>
            : <span className="text-[11px] text-muted-foreground">JPEG, PNG ou WebP — 5 Mo max</span>}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="flex items-center gap-1 text-[11px] text-destructive px-1">
      <AlertCircle size={11} className="shrink-0" />
      {message}
    </p>
  );
}

function TypeHero({ type }: { type: ProductType }) {
  const isProduct = type === 'product';
  const Icon = isProduct ? Package : Sparkles;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Icon size={20} className="text-primary" />
      </div>
      <div className="flex flex-col">
        <p className="text-sm font-semibold text-foreground">
          {isProduct ? 'Produit physique' : 'Service'}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {isProduct
            ? 'Stock suivi, unité de vente à définir.'
            : 'Pas de stock — un prix et une description suffisent.'}
        </p>
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
      {children}
    </h2>
  );
}

function CollapsibleSection({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center justify-between px-1 py-1 active:scale-[0.99] transition-transform"
      >
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="text-muted-foreground/70">{icon}</span>
          {title}
        </span>
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="flex flex-col gap-3">{children}</div>}
    </section>
  );
}
