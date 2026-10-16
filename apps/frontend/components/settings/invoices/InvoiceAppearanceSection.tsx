'use client';

import { useTranslations } from 'next-intl';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import { Palette } from 'lucide-react';
import { FormSection } from '@/components/form/FormSection';
import { FormField } from '@/components/form/FormField';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { LogoUploader } from '@/components/settings/LogoUploader';
import { UpgradeCard } from '@/components/subscription/UpgradeCard';
import { usePlanGating } from '@/lib/hooks/usePlanGating';
import type { Shop } from '@/lib/hooks/useShop';
import type { InvoiceSettings } from '@/lib/hooks/useInvoiceSettings';
import type { InvoiceSettingsValues } from './schema';
import { invoiceContrast } from './invoiceColor';

export function InvoiceAppearanceSection({ form, settings, shop }: {
  form: UseFormReturn<InvoiceSettingsValues>; settings: InvoiceSettings; shop?: Shop;
}) {
  const t = useTranslations('invoice_settings');
  const [mode, color] = useWatch({ control: form.control, name: ['invoice_color_mode', 'invoice_color'] });
  const lowContrast = /^#[0-9a-fA-F]{6}$/.test(color) && invoiceContrast(color) < 4.5;
  // Logo et couleur relèvent de la formule Boutique : en dessous, les réglages restent visibles mais figés.
  const branding = usePlanGating().can('invoice_branding');
  return (
    <FormSection icon={Palette} title={t('appearance')} description={t('appearance_help')} order="max-lg:order-1">
      {!branding && <UpgradeCard feature="invoice_branding" />}
      <fieldset disabled={!branding} className="flex min-w-0 flex-col gap-4 disabled:opacity-60" data-testid="invoice-branding">
        <LogoUploader shop={shop} />
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 text-[0.8125rem] font-medium">{t('color')}</legend>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {(['automatic', 'custom', 'neutral'] as const).map((choice) => (
              <label key={choice} className={`flex min-w-0 cursor-pointer items-start gap-2.5 rounded-xl border p-3.5 ${mode === choice ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card'}`}>
                <input type="radio" value={choice} {...form.register('invoice_color_mode')} className="mt-0.5 size-4 shrink-0 accent-primary" />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm font-semibold">{t(choice)}</span>
                  <span className="text-xs leading-relaxed text-muted-foreground">{t(`${choice}_help`)}</span>
                  {choice === 'automatic' && settings.invoice_auto_color && <span className="mt-1 h-4 w-10 rounded-full" style={{ backgroundColor: settings.invoice_auto_color }} aria-label={t('extracted_color')} />}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {mode === 'custom' && (
          <FormField label={t('chosen_color')} error={form.formState.errors.invoice_color ? t('invalid_value') : undefined}>
            {(c) => <input {...c} type="color" {...form.register('invoice_color')} className={`${FIELD_CONTROL} max-w-32 cursor-pointer p-1.5`} />}
          </FormField>
        )}
        {mode === 'automatic' && !settings.invoice_auto_color && <p className="text-xs text-muted-foreground">{t('automatic_neutral')}</p>}
        {mode === 'custom' && lowContrast && <p role="status" className="text-xs text-amber-700 dark:text-amber-400">{t('contrast_warning')}</p>}
      </fieldset>
    </FormSection>
  );
}
