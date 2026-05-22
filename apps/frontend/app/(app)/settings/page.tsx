'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingSelect } from '@/components/ui/floating-fields';
import { useShop, useUpdateShop } from '@/lib/hooks/useShop';
import { useThemeDrawer } from '@/components/layout/ThemeDrawer';

function AppearanceRow() {
  const { toggle } = useThemeDrawer();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-foreground">Apparence</p>
      <button
        onClick={toggle}
        className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3.5 text-left w-full active:bg-muted transition-colors"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
          <PaletteIcon className="h-6 w-6" />
        </span>
        <span>
          <span className="block text-sm font-medium text-foreground">Personnaliser</span>
          <span className="block text-xs text-muted-foreground">Couleurs, thème, arrière-plan</span>
        </span>
      </button>
    </div>
  );
}

function PaletteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 1 0 0 20 4 4 0 0 0 4-4v-.5a1.5 1.5 0 0 1 1.5-1.5H18a4 4 0 0 0 4-4 10 10 0 0 0-10-10zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
    </svg>
  );
}

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
    await mutateAsync({ ...values, zakat_annual_date: values.zakat_annual_date || null });
    reset(values);
  }

  if (isLoading) return <><TopBar title="Paramètres" /><p className="p-4 text-sm text-muted-foreground">Chargement…</p></>;

  return (
    <>
      <TopBar title="Paramètres boutique" />
      <div className="flex flex-col gap-5 p-4">
        <AppearanceRow />
        <div className="h-px bg-border" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 px-4 pb-8">

        <div className="flex flex-col gap-0.5">
          <FloatingInput id="name" label="Nom de la boutique *" {...register('name')} />
          {errors.name && <p className="text-[11px] text-destructive px-1">{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FloatingSelect id="currency" label="Devise" {...register('currency')}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </FloatingSelect>
          <FloatingSelect id="country" label="Pays (optionnel)" {...register('country')}>
            <option value="">—</option>
            {COUNTRIES.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
          </FloatingSelect>
        </div>

        <FloatingInput id="timezone" label="Fuseau horaire (optionnel)" {...register('timezone')} />

        <div className="flex flex-col gap-0.5">
          <FloatingInput id="zakat_annual_date" label="Date annuelle de Zakat (optionnel)" type="date" {...register('zakat_annual_date')} />
          <p className="text-[11px] text-muted-foreground px-1">Un rappel sera généré avant cette date chaque année.</p>
        </div>

        {isSuccess && !isDirty && (
          <p className="text-sm text-green-600 text-center">Modifications enregistrées ✓</p>
        )}

        <Button type="submit" disabled={isPending || !isDirty} className="w-full mt-1">
          {isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </form>
    </>
  );
}
