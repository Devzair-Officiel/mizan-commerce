import type { UseFormRegister, FieldErrors } from 'react-hook-form';
import { Store } from 'lucide-react';
import { FloatingInput, FloatingSelect } from '@/components/ui/floating-fields';
import type { Shop } from '@/lib/hooks/useShop';
import { SettingsCard } from './SettingsCard';
import { LogoUploader } from './LogoUploader';
import { COUNTRIES, CURRENCIES, type SettingsFormValues } from './schema';

interface IdentitySectionProps {
  shop: Shop | undefined;
  register: UseFormRegister<SettingsFormValues>;
  errors: FieldErrors<SettingsFormValues>;
}

export function IdentitySection({ shop, register, errors }: IdentitySectionProps) {
  return (
    <SettingsCard
      icon={Store}
      title="Identité"
      description="Le visage de votre boutique et ses repères régionaux."
    >
      <LogoUploader shop={shop} />
      <div className="flex flex-col gap-0.5">
        <FloatingInput id="name" label="Nom de la boutique *" {...register('name')} />
        {errors.name && <p className="text-[11px] text-destructive px-1">{errors.name.message}</p>}
      </div>
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
