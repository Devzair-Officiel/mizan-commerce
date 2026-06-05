import type { UseFormRegister } from 'react-hook-form';
import { Receipt } from 'lucide-react';
import { FloatingInput, FloatingTextarea } from '@/components/ui/floating-fields';
import { SettingsCard } from './SettingsCard';
import type { SettingsFormValues } from './schema';

interface InvoicingSectionProps {
  register: UseFormRegister<SettingsFormValues>;
}

export function InvoicingSection({ register }: InvoicingSectionProps) {
  return (
    <SettingsCard
      icon={Receipt}
      title="Facturation"
      description="Ces champs apparaissent sur vos factures clients. Renseignez ce qui est exigé par la réglementation de votre pays."
    >
      <FloatingTextarea
        id="legal_address"
        label="Adresse légale (siège)"
        rows={3}
        {...register('legal_address')}
      />

      <FloatingInput
        id="tax_id"
        label="Identifiant fiscal (SIRET, TVA, NIF, EIN…)"
        {...register('tax_id')}
      />

      <div className="grid grid-cols-2 gap-3">
        <FloatingInput
          id="default_tax_rate"
          label="Taux TVA par défaut"
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
          label="Délai de paiement"
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          suffix="jours"
          {...register('default_payment_terms_days')}
        />
      </div>

      <div className="flex flex-col gap-0.5">
        <FloatingTextarea
          id="legal_mentions"
          label="Mentions légales (pied de facture)"
          rows={4}
          {...register('legal_mentions')}
        />
        <p className="text-[11px] text-muted-foreground px-1">
          Ex.&nbsp;: «&nbsp;TVA non applicable, art. 293 B du CGI&nbsp;», RCS, conditions de
          pénalités, indemnité forfaitaire…
        </p>
      </div>
    </SettingsCard>
  );
}
