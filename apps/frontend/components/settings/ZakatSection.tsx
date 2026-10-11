import type { UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Coins } from 'lucide-react';
import { FloatingInput, FloatingSelect } from '@/components/ui/floating-fields';
import type { Shop } from '@/lib/hooks/useShop';
import { SettingsCard } from './SettingsCard';
import type { SettingsFormValues } from './schema';

interface ZakatSectionProps {
  register: UseFormRegister<SettingsFormValues>;
  shop: Shop | undefined;
}

export function ZakatSection({ register, shop }: ZakatSectionProps) {
  const t = useTranslations('settings.zakat');
  return (
    <SettingsCard icon={Coins} title={t('title')} description={t('description')}>
      <div className="flex flex-col gap-0.5">
        <FloatingInput id="zakat_annual_date" label={t('annual_date')} type="date" {...register('zakat_annual_date')} />
        <p className="text-[11px] text-muted-foreground px-1">{t('annual_date_help')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FloatingSelect id="nisab_method" label={t('method')} {...register('nisab_method')}>
          <option value="silver">{t('method_silver')}</option>
          <option value="gold">{t('method_gold')}</option>
        </FloatingSelect>
        <FloatingInput
          id="nisab_unit_price"
          label={t('unit_price', { currency: shop?.currency ?? 'EUR' })}
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          {...register('nisab_unit_price')}
        />
      </div>
      <p className="text-[11px] text-muted-foreground px-1">{t('unit_price_help')}</p>
    </SettingsCard>
  );
}
