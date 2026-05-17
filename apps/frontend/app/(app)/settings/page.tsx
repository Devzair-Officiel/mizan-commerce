'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useShop, useUpdateShop } from '@/lib/hooks/useShop';

const CURRENCIES = ['EUR', 'MAD', 'TND', 'DZD', 'XOF', 'USD', 'GBP'];
const COUNTRIES = [
  { code: 'FR', label: 'France' },
  { code: 'MA', label: 'Maroc' },
  { code: 'TN', label: 'Tunisie' },
  { code: 'DZ', label: 'Algérie' },
  { code: 'SN', label: 'Sénégal' },
  { code: 'CI', label: "Côte d'Ivoire" },
  { code: 'BE', label: 'Belgique' },
  { code: 'GB', label: 'Royaume-Uni' },
];

const schema = z.object({
  name: z.string().min(1, 'Nom requis'),
  currency: z.string().min(1),
  country: z.string().optional(),
  timezone: z.string().optional(),
  zakat_annual_date: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function SettingsPage() {
  const { data: shop, isLoading } = useShop();
  const { mutateAsync, isPending, isSuccess } = useUpdateShop();

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (shop) {
      reset({
        name: shop.name,
        currency: shop.currency,
        country: shop.country ?? '',
        timezone: shop.timezone ?? '',
        zakat_annual_date: shop.zakat_annual_date ?? '',
      });
    }
  }, [shop, reset]);

  async function onSubmit(values: FormValues) {
    await mutateAsync({
      ...values,
      zakat_annual_date: values.zakat_annual_date || null,
    });
    reset(values);
  }

  if (isLoading) return <><TopBar title="Paramètres" /><p className="p-4 text-sm text-zinc-400">Chargement…</p></>;

  return (
    <>
      <TopBar title="Paramètres boutique" />
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 p-4">

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nom de la boutique *</Label>
          <Input id="name" {...register('name')} />
          {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency">Devise</Label>
            <select
              id="currency"
              {...register('currency')}
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="country">Pays</Label>
            <select
              id="country"
              {...register('country')}
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >
              <option value="">—</option>
              {COUNTRIES.map(({ code, label }) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="timezone">Fuseau horaire</Label>
          <Input id="timezone" {...register('timezone')} placeholder="Ex: Europe/Paris" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="zakat_annual_date">Date annuelle de Zakat</Label>
          <Input id="zakat_annual_date" type="date" {...register('zakat_annual_date')} />
          <p className="text-xs text-zinc-400">Un rappel sera généré avant cette date chaque année.</p>
        </div>

        {isSuccess && !isDirty && (
          <p className="text-sm text-green-600 text-center">Modifications enregistrées ✓</p>
        )}

        <Button type="submit" disabled={isPending || !isDirty} className="w-full">
          {isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </form>
    </>
  );
}
