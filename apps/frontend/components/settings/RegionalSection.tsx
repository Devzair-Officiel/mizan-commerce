import type { UseFormRegister } from 'react-hook-form';
import { Globe } from 'lucide-react';
import { FloatingSelect } from '@/components/ui/floating-fields';
import { SettingsCard } from './SettingsCard';
import { COUNTRIES, CURRENCIES, type SettingsFormValues } from './schema';

interface RegionalSectionProps {
  register: UseFormRegister<SettingsFormValues>;
}

export function RegionalSection({ register }: RegionalSectionProps) {
  return (
    <SettingsCard
      icon={Globe}
      title="Régional"
      description="Devise et pays utilisés dans toute l'application."
    >
      <div className="grid grid-cols-2 gap-3">
        <FloatingSelect id="currency" label="Devise" {...register('currency')}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </FloatingSelect>
        <FloatingSelect id="country" label="Pays (optionnel)" {...register('country')}>
          <option value="">—</option>
          {COUNTRIES.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
        </FloatingSelect>
      </div>
    </SettingsCard>
  );
}
