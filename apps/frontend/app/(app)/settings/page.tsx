'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { useShop, useUpdateShop, type Shop } from '@/lib/hooks/useShop';
import { notify } from '@/lib/notify';
import { settingsSchema, type SettingsFormValues } from '@/components/settings/schema';
import { IdentitySection } from '@/components/settings/IdentitySection';
import { ManagementSection } from '@/components/settings/ManagementSection';
import { ZakatSection } from '@/components/settings/ZakatSection';
import { PreferencesSection } from '@/components/settings/PreferencesSection';
import { StickyActionBar } from '@/components/settings/StickyActionBar';
import { Button } from '@/components/ui/button';
import { SectionsSkeleton } from '@/components/ui/SectionsSkeleton';
import { resetKeepingEdits } from '@/components/form/resetKeepingEdits';

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
    fulfillment_mode: shop.fulfillment_mode ?? null,
  };
}

export default function SettingsPage() {
  const t = useTranslations('settings.page');
  const { data: shop, isLoading, isError, refetch } = useShop();
  const { mutateAsync, isPending } = useUpdateShop();

  const form = useForm<SettingsFormValues>({ resolver: zodResolver(settingsSchema) });
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = form;

  // Données rechargées (après un enregistrement notamment) : la saisie en cours est gardée.
  useEffect(() => {
    if (shop) resetKeepingEdits(form, defaultsFromShop(shop));
  }, [shop, form]);

  async function onSubmit(values: SettingsFormValues) {
    try {
      const saved = await mutateAsync({
        ...values,
        zakat_annual_date: values.zakat_annual_date || null,
        nisab_unit_price: values.nisab_unit_price && parseFloat(values.nisab_unit_price) > 0
          ? values.nisab_unit_price
          : null,
        default_tax_rate: values.default_tax_rate || '0',
        default_payment_terms_days: Number(values.default_payment_terms_days || 30),
      });
      resetKeepingEdits(form, defaultsFromShop(saved), values);
      notify.success(t('saved'));
    } catch {
      notify.error(t('save_error'));
    }
  }

  if (isLoading) {
    return (
      <>
        <TopBar hideSearch title={t('loading_title')} />
        <SectionsSkeleton sections={[4, 3, 3]} className="mx-auto w-full max-w-3xl px-4 pt-4 pb-32" />
      </>
    );
  }

  if (isError || !shop) return (
    <>
      <TopBar hideSearch title={t('title')} />
      <div role="alert" className="flex flex-col items-start gap-3 p-5 text-sm">
        <p>{t('load_error')}</p>
        <Button type="button" variant="outline" onClick={() => refetch()}>{t('retry')}</Button>
      </div>
    </>
  );

  return (
    <>
      <TopBar hideSearch title={t('title')} />

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 px-4 pt-4 pb-32 max-w-3xl mx-auto w-full">
        <IdentitySection shop={shop} register={register} errors={errors} />
        <ManagementSection />
        <ZakatSection register={register} shop={shop} />
        <PreferencesSection register={register} />

        <StickyActionBar
          isDirty={isDirty}
          isPending={isPending}
          onReset={() => shop && reset(defaultsFromShop(shop))}
        />
      </form>
    </>
  );
}
