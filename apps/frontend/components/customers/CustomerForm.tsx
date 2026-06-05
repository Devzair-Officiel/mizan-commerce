'use client';

import { useState } from 'react';
import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronDown, MapPin, FileText } from 'lucide-react';
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

function hasAddress(v?: Partial<Customer>): boolean {
  return Boolean(v?.address_line || v?.city || v?.postal_code || v?.country);
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

  const [showAddress, setShowAddress] = useState(() => hasAddress(defaultValues));
  const [showNotes, setShowNotes] = useState(() => Boolean(defaultValues?.notes));

  const nameValue = useWatch({ control, name: 'name' }) ?? '';
  const countryValue = useWatch({ control, name: 'country' }) ?? '';
  const canSubmit = nameValue.trim().length > 0 && !isSubmitting;

  async function handleValid(values: FormValues) {
    await onSubmit({ ...values, email: values.email || undefined });
  }

  return (
    <form
      onSubmit={handleSubmit(handleValid)}
      className="flex flex-col gap-4 p-4 pb-32 lg:max-w-2xl lg:mx-auto lg:px-8 lg:py-6 lg:pb-8"
    >
      {/* Identité */}
      <section className="flex flex-col gap-2.5">
        <SectionHeading>Identité</SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-0.5">
            <FloatingInput id="name" label="Nom" required {...register('name')} />
            {errors.name && <p className="text-[11px] text-destructive px-1">{errors.name.message}</p>}
          </div>
          <FloatingInput id="first_name" label="Prénom" {...register('first_name')} />
        </div>
      </section>

      {/* Contact */}
      <section className="flex flex-col gap-3">
        <SectionHeading>Contact</SectionHeading>
        <FloatingInput id="phone" label="Téléphone" type="tel" {...register('phone')} />
        <div className="flex flex-col gap-0.5">
          <FloatingInput id="email" label="Email" type="email" {...register('email')} />
          {errors.email && <p className="text-[11px] text-destructive px-1">{errors.email.message}</p>}
        </div>
      </section>

      {/* Adresse — collapsible */}
      <CollapsibleSection
        title="Adresse"
        icon={<MapPin size={15} />}
        open={showAddress}
        onToggle={() => setShowAddress((v) => !v)}
      >
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
              countryCode={countryValue}
              onSelect={(result) => {
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
      </CollapsibleSection>

      {/* Notes — collapsible */}
      <CollapsibleSection
        title="Notes internes"
        icon={<FileText size={15} />}
        open={showNotes}
        onToggle={() => setShowNotes((v) => !v)}
      >
        <FloatingTextarea id="notes" label="Notes internes" rows={3} {...register('notes')} />
      </CollapsibleSection>

      {/* Sticky submit */}
      <div className="sticky bottom-24 lg:bottom-2 -mx-4 lg:mx-0 px-4 lg:px-0 mt-2">
        <Button
          type="submit"
          className="w-full rounded-full shadow-lg h-12 text-sm font-semibold"
          disabled={!canSubmit}
        >
          {isSubmitting ? 'Enregistrement…' : 'Enregistrer le client'}
        </Button>
      </div>
    </form>
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
