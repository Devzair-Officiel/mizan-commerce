'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingTextarea } from '@/components/ui/floating-fields';
import { ApiError } from '@/lib/api-client';
import type { ProductDetail, ProductFormData } from '@/lib/hooks/useProducts';

const productSchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  reference: z.string().optional(),
  description: z.string().optional(),
  purchase_price: z.string().min(1, "Prix d'achat requis"),
  selling_price: z.string().min(1, 'Prix de vente requis'),
  low_stock_threshold: z.string().optional(),
});

type FormValues = z.infer<typeof productSchema>;

interface ProductFormProps {
  defaultValues?: Partial<ProductDetail>;
  onSubmit: (data: ProductFormData) => Promise<void>;
  isSubmitting: boolean;
}

export function ProductForm({ defaultValues, onSubmit, isSubmitting }: ProductFormProps) {
  const { register, handleSubmit, setError, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      reference: defaultValues?.reference ?? '',
      description: defaultValues?.description ?? '',
      purchase_price: defaultValues?.purchase_price ?? '',
      selling_price: defaultValues?.selling_price ?? '',
      low_stock_threshold: defaultValues?.low_stock_threshold != null
        ? String(defaultValues.low_stock_threshold)
        : '',
    },
  });

  async function handleValid(values: FormValues) {
    const threshold = values.low_stock_threshold;
    try {
      await onSubmit({
        name: values.name,
        reference: values.reference,
        description: values.description,
        purchase_price: values.purchase_price,
        selling_price: values.selling_price,
        low_stock_threshold: threshold !== undefined && threshold !== '' ? parseInt(threshold, 10) : null,
      });
    } catch (err: unknown) {
      if (err instanceof ApiError && typeof err.data === 'object' && err.data !== null) {
        const data = err.data as Record<string, string[]>;
        if (data.name?.[0]) {
          setError('name', { message: data.name[0] });
          return;
        }
      }
      throw err;
    }
  }

  return (
    <form onSubmit={handleSubmit(handleValid)} className="flex flex-col gap-3 p-4 pb-8 lg:max-w-2xl lg:mx-auto lg:px-8 lg:py-6">

      <div className="flex flex-col gap-0.5">
        <FloatingInput id="name" label="Nom du produit *" {...register('name')} />
        {errors.name && <p className="text-[11px] text-destructive px-1">{errors.name.message}</p>}
      </div>

      <FloatingInput id="reference" label="Référence (optionnel)" {...register('reference')} />

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5">
          <FloatingInput id="purchase_price" label="Prix d'achat *" type="number" step="0.01" min="0" {...register('purchase_price')} />
          {errors.purchase_price && <p className="text-[11px] text-destructive px-1">{errors.purchase_price.message}</p>}
        </div>
        <div className="flex flex-col gap-0.5">
          <FloatingInput id="selling_price" label="Prix de vente *" type="number" step="0.01" min="0" {...register('selling_price')} />
          {errors.selling_price && <p className="text-[11px] text-destructive px-1">{errors.selling_price.message}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <FloatingInput id="low_stock_threshold" label="Seuil alerte stock (optionnel)" type="number" min="0" {...register('low_stock_threshold')} />
        <p className="text-[11px] text-muted-foreground px-1">Laissez vide pour désactiver l'alerte</p>
      </div>

      <FloatingTextarea id="description" label="Description (optionnel)" rows={3} {...register('description')} />

      <Button type="submit" className="w-full mt-1" disabled={isSubmitting}>
        {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </form>
  );
}
