import type { UseFormRegister } from 'react-hook-form';
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
  return (
    <SettingsCard
      icon={Coins}
      title="Zakat"
      description="Paramètres pour calculer le seuil de Nisab et générer le rappel annuel."
    >
      <div className="flex flex-col gap-0.5">
        <FloatingInput id="zakat_annual_date" label="Date annuelle (optionnel)" type="date" {...register('zakat_annual_date')} />
        <p className="text-[11px] text-muted-foreground px-1">Un rappel sera généré avant cette date chaque année.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FloatingSelect id="nisab_method" label="Méthode du Nisab" {...register('nisab_method')}>
          <option value="silver">Argent (595 g)</option>
          <option value="gold">Or (85 g)</option>
        </FloatingSelect>
        <FloatingInput
          id="nisab_unit_price"
          label={`Prix au gramme (${shop?.currency ?? 'EUR'})`}
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          {...register('nisab_unit_price')}
        />
      </div>
      <p className="text-[11px] text-muted-foreground px-1">
        Le cours évolue chaque jour. Vérifiez et mettez à jour le prix au gramme avant chaque
        calcul. La méthode de l&apos;argent est plus inclusive (seuil plus bas).
      </p>
    </SettingsCard>
  );
}
