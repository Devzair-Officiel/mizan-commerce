'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingTextarea } from '@/components/ui/floating-fields';
import { CountryPicker } from '@/components/ui/CountryPicker';
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete';
import type { Customer, CustomerFormData } from '@/lib/hooks/useCustomers';

const schema = z.object({
  name: z.string().min(1, 'Nom requis'),
  first_name: z.string().optional(),
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
  const { register, handleSubmit, control, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      first_name: defaultValues?.first_name ?? '',
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
    await onSubmit({ ...values, email: values.email || undefined });
  }

  return (
    <form onSubmit={handleSubmit(handleValid)} className="flex flex-col gap-3 p-4 pb-8">

      {/* Identité */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5">
          <FloatingInput id="name" label="Nom *" {...register('name')} />
          {errors.name && <p className="text-[11px] text-destructive px-1">{errors.name.message}</p>}
        </div>
        <FloatingInput id="first_name" label="Prénom" {...register('first_name')} />
      </div>

      {/* Contact */}
      <div className="grid grid-cols-2 gap-3">
        <FloatingInput id="phone" label="Téléphone" type="tel" {...register('phone')} />
        <div className="flex flex-col gap-0.5">
          <FloatingInput id="email" label="Email" type="email" {...register('email')} />
          {errors.email && <p className="text-[11px] text-destructive px-1">{errors.email.message}</p>}
        </div>
      </div>

      {/* Adresse */}
      <Controller
        name="country"
        control={control}
        render={({ field }) => (
          <CountryPicker value={field.value ?? ''} onChange={field.onChange} />
        )}
      />

      <Controller
        name="address_line"
        control={control}
        render={({ field }) => (
          <AddressAutocomplete
            value={field.value ?? ''}
            onChange={field.onChange}
            onSelect={result => {
              field.onChange(result.address_line);
              if (result.city)         setValue('city', result.city);
              if (result.postal_code)  setValue('postal_code', result.postal_code);
              if (result.country_code) setValue('country', result.country_code);
            }}
          />
        )}
      />

      <div className="grid grid-cols-2 gap-3">
        <FloatingInput id="city" label="Ville" {...register('city')} />
        <FloatingInput id="postal_code" label="Code postal" {...register('postal_code')} />
      </div>

      {/* Notes */}
      <FloatingTextarea id="notes" label="Notes internes" rows={3} {...register('notes')} />

      <Button type="submit" className="w-full mt-1" disabled={isSubmitting}>
        {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </form>
  );
}
