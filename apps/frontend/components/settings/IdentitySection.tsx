import type { UseFormRegister, FieldErrors } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Store } from 'lucide-react';
import { FloatingInput, FloatingSelect } from '@/components/ui/floating-fields';
import type { Shop } from '@/lib/hooks/useShop';
import { useCountryNames } from '@/lib/hooks/useCountryNames';
import { SettingsCard } from './SettingsCard';
import { LogoUploader } from './LogoUploader';
import { COUNTRIES, CURRENCIES, type SettingsFormValues } from './schema';

interface IdentitySectionProps {
  shop: Shop | undefined;
  register: UseFormRegister<SettingsFormValues>;
  errors: FieldErrors<SettingsFormValues>;
}

export function IdentitySection({ shop, register, errors }: IdentitySectionProps) {
  const t = useTranslations('settings.identity');
  const countryName = useCountryNames();
  return (
    <SettingsCard icon={Store} title={t('title')} description={t('description')}>
      <LogoUploader shop={shop} />
      <div className="flex flex-col gap-0.5">
        <FloatingInput id="name" label={t('name')} {...register('name')} />
        {errors.name && <p className="text-[11px] text-destructive px-1">{t('name_required')}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FloatingSelect id="currency" label={t('currency')} {...register('currency')}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </FloatingSelect>
        <FloatingSelect id="country" label={t('country')} {...register('country')}>
          <option value="">—</option>
          {COUNTRIES.map((code) => <option key={code} value={code}>{countryName(code)}</option>)}
        </FloatingSelect>
      </div>
    </SettingsCard>
  );
}
