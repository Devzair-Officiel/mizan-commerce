'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { useShop, useUpdateShop, type Shop } from '@/lib/hooks/useShop';
import { usePlanGating } from '@/lib/hooks/usePlanGating';
import { settingsSchema, type SettingsFormValues } from '@/components/settings/schema';
import { IdentitySection } from '@/components/settings/IdentitySection';
import { ManagementSection } from '@/components/settings/ManagementSection';
import { InvoicingSection } from '@/components/settings/InvoicingSection';
import { ZakatSection } from '@/components/settings/ZakatSection';
import { PreferencesSection } from '@/components/settings/PreferencesSection';
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
    catalog_kind: shop.catalog_kind ?? 'both',
    dashboard_mode: shop.dashboard_mode ?? 'complete',
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

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 px-4 pt-4 pb-32">
        <IdentitySection shop={shop} register={register} errors={errors} />
        <ManagementSection
          showPublicPage={can('public_pages')}
          teamTitle={tTeam('title')}
          teamSubtitle={tTeam('subtitle')}
        />
        <InvoicingSection register={register} />
        <ZakatSection register={register} shop={shop} />
        <PreferencesSection register={register} />

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
