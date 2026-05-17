'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Customer, CustomerFormData } from '@/lib/hooks/useCustomers';

const schema = z.object({
  name: z.string().min(1, 'Nom requis'),
  phone: z.string().optional(),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  address_line: z.string().optional(),
  city: z.string().optional(),
  postal_code: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface CustomerFormProps {
  defaultValues?: Partial<Customer>;
  onSubmit: (data: CustomerFormData) => Promise<void>;
  isSubmitting: boolean;
}

export function CustomerForm({ defaultValues, onSubmit, isSubmitting }: CustomerFormProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      phone: defaultValues?.phone ?? '',
      email: defaultValues?.email ?? '',
      address_line: defaultValues?.address_line ?? '',
      city: defaultValues?.city ?? '',
      postal_code: defaultValues?.postal_code ?? '',
      country: defaultValues?.country ?? '',
      notes: defaultValues?.notes ?? '',
    },
  });

  async function handleValid(values: FormValues) {
    await onSubmit({
      ...values,
      email: values.email || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit(handleValid)} className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nom *</Label>
        <Input id="name" {...register('name')} placeholder="Ex: Karima Benali" />
        {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Téléphone</Label>
          <Input id="phone" type="tel" {...register('phone')} placeholder="+33 6 …" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...register('email')} placeholder="…@mail.com" />
          {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address_line">Adresse</Label>
        <Input id="address_line" {...register('address_line')} placeholder="Rue, numéro…" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="city">Ville</Label>
          <Input id="city" {...register('city')} placeholder="Paris" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="postal_code">Code postal</Label>
          <Input id="postal_code" {...register('postal_code')} placeholder="75001" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          {...register('notes')}
          rows={3}
          placeholder="Notes internes…"
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </form>
  );
}
