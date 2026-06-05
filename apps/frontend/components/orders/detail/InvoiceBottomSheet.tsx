import { useState } from 'react';
import { Receipt } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingTextarea } from '@/components/ui/floating-fields';

interface InvoiceBottomSheetProps {
  open: boolean;
  onClose: () => void;
  defaultTaxRate: string;
  defaultTermsDays: string;
  isPending: boolean;
  error: string | null;
  onSubmit: (params: { taxRate: string; termsDays: string; notes: string }) => void | Promise<void>;
}

/**
 * Le formulaire vit dans un composant interne monté uniquement quand `open` est vrai,
 * pour garantir un état frais à chaque ouverture sans `useEffect` (anti-pattern React 19).
 */
export function InvoiceBottomSheet(props: InvoiceBottomSheetProps) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title="Émettre une facture">
      {props.open && <InvoiceForm {...props} />}
    </BottomSheet>
  );
}

function InvoiceForm({
  defaultTaxRate, defaultTermsDays, isPending, error, onSubmit,
}: InvoiceBottomSheetProps) {
  const [taxRate, setTaxRate] = useState(defaultTaxRate);
  const [termsDays, setTermsDays] = useState(defaultTermsDays);
  const [notes, setNotes] = useState('');

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-zinc-500">
        Les valeurs par défaut viennent des paramètres boutique. Ajustez-les si besoin pour
        cette facture.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <FloatingInput
          id="invoice-tax-rate"
          label="Taux TVA"
          type="number"
          step="0.01"
          min="0"
          max="100"
          inputMode="decimal"
          suffix="%"
          value={taxRate}
          onChange={(e) => setTaxRate(e.target.value)}
        />
        <FloatingInput
          id="invoice-terms-days"
          label="Délai de paiement"
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          suffix="jours"
          value={termsDays}
          onChange={(e) => setTermsDays(e.target.value)}
        />
      </div>
      <FloatingTextarea
        id="invoice-notes"
        label="Notes (optionnel)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button
        onClick={() => onSubmit({ taxRate, termsDays, notes })}
        disabled={isPending}
        className="w-full inline-flex items-center justify-center gap-2"
      >
        <Receipt size={16} />
        {isPending ? 'Émission…' : 'Émettre la facture'}
      </Button>
      <p className="text-[11px] text-zinc-400 text-center">
        Une fois émise, la facture est immuable. Seul le statut peut être modifié.
      </p>
    </div>
  );
}
