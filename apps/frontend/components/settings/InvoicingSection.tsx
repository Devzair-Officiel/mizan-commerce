import type { UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Receipt } from 'lucide-react';
import { FloatingInput, FloatingTextarea } from '@/components/ui/floating-fields';
import { SettingsCard } from './SettingsCard';
import type { SettingsFormValues } from './schema';

interface InvoicingSectionProps {
  register: UseFormRegister<SettingsFormValues>;
}

export function InvoicingSection({ register }: InvoicingSectionProps) {
  const t = useTranslations('settings.invoicing');
  return (
    <SettingsCard icon={Receipt} title={t('title')} description={t('description')}>
      <FloatingTextarea
        id="legal_address"
        label={t('legal_address')}
        rows={3}
        {...register('legal_address')}
      />

      <FloatingInput
        id="tax_id"
        label={t('tax_id')}
        {...register('tax_id')}
      />

      <div className="grid grid-cols-2 gap-3">
        <FloatingInput
          id="default_tax_rate"
          label={t('tax_rate')}
          type="number"
          step="0.01"
          min="0"
          max="100"
          inputMode="decimal"
          suffix="%"
          {...register('default_tax_rate')}
        />
        <FloatingInput
          id="default_payment_terms_days"
          label={t('payment_terms')}
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          suffix={t('days')}
          {...register('default_payment_terms_days')}
        />
      </div>

      <div className="flex flex-col gap-0.5">
        <FloatingTextarea
          id="legal_mentions"
          label={t('legal_mentions')}
          rows={4}
          {...register('legal_mentions')}
        />
        <p className="text-[11px] text-muted-foreground px-1">{t('legal_mentions_help')}</p>
      </div>
    </SettingsCard>
  );
}
