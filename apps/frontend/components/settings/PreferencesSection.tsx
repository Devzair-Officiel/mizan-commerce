import type { UseFormRegister } from 'react-hook-form';
import { Sparkles } from 'lucide-react';
import { FloatingSelect } from '@/components/ui/floating-fields';
import { SettingsCard } from './SettingsCard';
import type { SettingsFormValues } from './schema';

interface PreferencesSectionProps {
  register: UseFormRegister<SettingsFormValues>;
}

export function PreferencesSection({ register }: PreferencesSectionProps) {
  return (
    <SettingsCard
      icon={Sparkles}
      title="Préférences"
      description="Type d'activité et style du tableau de bord. Choix initial fait lors du premier login."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FloatingSelect id="catalog_kind" label="Type d'activité" {...register('catalog_kind')}>
          <option value="products">Produits</option>
          <option value="services">Services</option>
          <option value="both">Les deux</option>
        </FloatingSelect>
        <FloatingSelect id="dashboard_mode" label="Tableau de bord" {...register('dashboard_mode')}>
          <option value="minimal">Minimaliste</option>
          <option value="complete">Complet</option>
        </FloatingSelect>
      </div>
    </SettingsCard>
  );
}
