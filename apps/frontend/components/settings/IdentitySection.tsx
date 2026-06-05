import type { UseFormRegister, FieldErrors } from 'react-hook-form';
import { Store } from 'lucide-react';
import { FloatingInput } from '@/components/ui/floating-fields';
import type { Shop } from '@/lib/hooks/useShop';
import { SettingsCard } from './SettingsCard';
import { LogoUploader } from './LogoUploader';
import type { SettingsFormValues } from './schema';

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
      description="Le visage de votre boutique sur les factures et reçus."
    >
      <LogoUploader shop={shop} />
      <div className="flex flex-col gap-0.5">
        <FloatingInput id="name" label="Nom de la boutique *" {...register('name')} />
        {errors.name && <p className="text-[11px] text-destructive px-1">{errors.name.message}</p>}
      </div>
    </SettingsCard>
  );
}
