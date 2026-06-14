'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Users, ChevronRight, Globe, Sparkles } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { useShop, useUpdateShop, type Shop } from '@/lib/hooks/useShop';
import { usePlanGating } from '@/lib/hooks/usePlanGating';
import { settingsSchema, type SettingsFormValues } from '@/components/settings/schema';
import { IdentitySection } from '@/components/settings/IdentitySection';
import { RegionalSection } from '@/components/settings/RegionalSection';
import { ZakatSection } from '@/components/settings/ZakatSection';
import { InvoicingSection } from '@/components/settings/InvoicingSection';
import { StickyActionBar } from '@/components/settings/StickyActionBar';

function defaultsFromShop(shop: Shop): SettingsFormValues {
  return {
    name: shop.name,
    currency: shop.currency,
    country: shop.country ?? '',
    zakat_annual_date: shop.zakat_annual_date ?? '',
    nisab_method: shop.nisab_method ?? 'silver',
    nisab_unit_price: shop.nisab_unit_price ?? '',
    legal_address: shop.legal_address ?? '',
    tax_id: shop.tax_id ?? '',
    legal_mentions: shop.legal_mentions ?? '',
    default_tax_rate: shop.default_tax_rate ?? '0',
    default_payment_terms_days: String(shop.default_payment_terms_days ?? 30),
  };
}

export default function SettingsPage() {
  const tTeam = useTranslations('team');
  const { data: shop, isLoading } = useShop();
  const { mutateAsync, isPending, isSuccess } = useUpdateShop();
  const { can } = usePlanGating();

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
  });

  useEffect(() => {
    if (shop) reset(defaultsFromShop(shop));
  }, [shop, reset]);

  async function onSubmit(values: SettingsFormValues) {
    await mutateAsync({
      ...values,
      zakat_annual_date: values.zakat_annual_date || null,
      nisab_unit_price: values.nisab_unit_price && parseFloat(values.nisab_unit_price) > 0
        ? values.nisab_unit_price
        : null,
      default_tax_rate: values.default_tax_rate || '0',
      default_payment_terms_days: Number(values.default_payment_terms_days || 30),
    });
    reset(values);
  }

  if (isLoading) {
    return (
      <>
        <TopBar title="Paramètres" />
        <p className="p-4 text-sm text-muted-foreground">Chargement…</p>
      </>
    );
  }

  return (
    <>
      <TopBar title="Paramètres boutique" />

      <div className="flex flex-col gap-3 px-4 pt-4">
        <Link
          href="/settings/team"
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:bg-muted transition-colors"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{tTeam('title')}</p>
            <p className="text-xs text-muted-foreground">{tTeam('subtitle')}</p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground rtl:rotate-180 shrink-0" />
        </Link>

        {can('public_pages') && (
          <Link
            href="/settings/public-page"
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:bg-muted transition-colors"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Globe className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Page publique</p>
              <p className="text-xs text-muted-foreground">
                Vitrine partageable de votre boutique
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground rtl:rotate-180 shrink-0" />
          </Link>
        )}

        <Link
          href="/settings/subscription"
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:bg-muted transition-colors"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Abonnement</p>
            <p className="text-xs text-muted-foreground">
              Formule, essai et résiliation
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground rtl:rotate-180 shrink-0" />
        </Link>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 px-4 pt-4 pb-32">
        <IdentitySection shop={shop} register={register} errors={errors} />
        <RegionalSection register={register} />
        <ZakatSection register={register} shop={shop} />
        <InvoicingSection register={register} />

        {isSuccess && !isDirty && (
          <p className="text-sm text-green-600 text-center">Modifications enregistrées ✓</p>
        )}

        <StickyActionBar
          isDirty={isDirty}
          isPending={isPending}
          onReset={() => shop && reset(defaultsFromShop(shop))}
        />
      </form>
    </>
  );
}
