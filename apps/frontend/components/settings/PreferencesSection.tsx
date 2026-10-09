'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { UseFormRegister } from 'react-hook-form';
import { Sparkles, ChevronDown } from 'lucide-react';
import { FloatingSelect } from '@/components/ui/floating-fields';
import { useShop } from '@/lib/hooks/useShop';
import type { SettingsFormValues } from './schema';

interface PreferencesSectionProps {
  register: UseFormRegister<SettingsFormValues>;
}

export function PreferencesSection({ register }: PreferencesSectionProps) {
  const t = useTranslations('settings.preferences');
  const { data: shop } = useShop();
  const catalogKind = shop?.catalog_kind ?? 'both';
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5 text-left hover:bg-muted/60 transition-colors"
      >
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('title')}
        </h2>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-3 p-4">
          <p className="text-xs text-muted-foreground leading-snug -mt-1">{t('subtitle')}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FloatingSelect id="catalog_kind" label={t('catalog_kind_label')} {...register('catalog_kind')}>
              <option value="products">{t('catalog_kind_products')}</option>
              <option value="services">{t('catalog_kind_services')}</option>
              <option value="both">{t('catalog_kind_both')}</option>
            </FloatingSelect>
            {catalogKind !== 'services' && (
              <FloatingSelect id="fulfillment_mode" label={t('fulfillment_mode_label')} {...register('fulfillment_mode')}>
                <option value="">—</option>
                <option value="on_site">{t('fulfillment_on_site')}</option>
                <option value="delivery">{t('fulfillment_delivery')}</option>
                <option value="both">{t('fulfillment_both')}</option>
              </FloatingSelect>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
