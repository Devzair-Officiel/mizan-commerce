import { useTranslations } from 'next-intl';
import type { UseFormRegister } from 'react-hook-form';
import { Sparkles } from 'lucide-react';
import { FloatingSelect } from '@/components/ui/floating-fields';
import { useShop } from '@/lib/hooks/useShop';
import { SettingsCard } from './SettingsCard';
import type { SettingsFormValues } from './schema';

export function PreferencesSection({ register }: { register: UseFormRegister<SettingsFormValues> }) {
  const t = useTranslations('settings.preferences');
  const { data: shop } = useShop();
  return (
    <SettingsCard icon={Sparkles} title={t('title')} description={t('subtitle')}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FloatingSelect id="catalog_kind" label={t('catalog_kind_label')} {...register('catalog_kind')}>
          <option value="products">{t('catalog_kind_products')}</option>
          <option value="services">{t('catalog_kind_services')}</option>
          <option value="both">{t('catalog_kind_both')}</option>
        </FloatingSelect>
        {shop?.catalog_kind !== 'services' && (
          <FloatingSelect id="fulfillment_mode" label={t('fulfillment_mode_label')} {...register('fulfillment_mode')}>
            <option value="">—</option>
            <option value="on_site">{t('fulfillment_on_site')}</option>
            <option value="delivery">{t('fulfillment_delivery')}</option>
            <option value="both">{t('fulfillment_both')}</option>
          </FloatingSelect>
        )}
      </div>
    </SettingsCard>
  );
}
