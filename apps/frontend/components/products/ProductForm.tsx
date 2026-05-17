'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ProductDetail, ProductFormData } from '@/lib/hooks/useProducts';

const productSchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  reference: z.string().optional(),
  description: z.string().optional(),
  purchase_price: z.string().min(1, 'Prix d\'achat requis'),
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
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
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
    await onSubmit({
      name: values.name,
      reference: values.reference,
      description: values.description,
      purchase_price: values.purchase_price,
      selling_price: values.selling_price,
      low_stock_threshold:
        threshold !== undefined && threshold !== '' ? parseInt(threshold, 10) : null,
    });
  }

  return (
    <form onSubmit={handleSubmit(handleValid)} className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nom du produit *</Label>
        <Input id="name" {...register('name')} placeholder="Ex: Savon noir" />
        {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reference">Référence</Label>
        <Input id="reference" {...register('reference')} placeholder="Ex: REF-001" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="purchase_price">Prix d'achat *</Label>
          <Input id="purchase_price" type="number" step="0.01" min="0" {...register('purchase_price')} placeholder="0.00" />
          {errors.purchase_price && <p className="text-xs text-red-500">{errors.purchase_price.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="selling_price">Prix de vente *</Label>
          <Input id="selling_price" type="number" step="0.01" min="0" {...register('selling_price')} placeholder="0.00" />
          {errors.selling_price && <p className="text-xs text-red-500">{errors.selling_price.message}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="low_stock_threshold">Seuil alerte stock</Label>
        <Input id="low_stock_threshold" type="number" min="0" {...register('low_stock_threshold')} placeholder="Ex: 5" />
        <p className="text-xs text-zinc-400">Laissez vide pour désactiver l'alerte</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          {...register('description')}
          rows={3}
          placeholder="Description optionnelle…"
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </form>
  );
}
