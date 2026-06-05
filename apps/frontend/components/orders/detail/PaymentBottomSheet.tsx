import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';

interface PaymentBottomSheetProps {
  open: boolean;
  onClose: () => void;
  initialAmount: string;
  totalAmount: number;
  paidAmount: number;
  remaining: string;
  isPending: boolean;
  onSubmit: (amountInput: string) => void | Promise<void>;
}

/**
 * Le contenu vit dans un composant interne monté uniquement quand `open` est vrai.
 * Cela garantit un état frais à chaque ouverture sans recourir à un `useEffect`
 * qui appellerait setState (anti-pattern React 19).
 */
export function PaymentBottomSheet(props: PaymentBottomSheetProps) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title="Encaisser un paiement">
      {props.open && <PaymentForm {...props} />}
    </BottomSheet>
  );
}

function PaymentForm({
  initialAmount, totalAmount, paidAmount, remaining, isPending, onSubmit,
}: PaymentBottomSheetProps) {
  const [amountInput, setAmountInput] = useState(initialAmount);
  const [editAmount, setEditAmount] = useState(false);

  const val = parseFloat(amountInput) || 0;
  const isNeg = val < 0;
  const remainingNum = parseFloat(remaining);
  const newPaid = Math.max(0, paidAmount + val);
  const newRemaining = Math.max(0, totalAmount - newPaid);

  const chips: { label: string; sub?: string; value: number }[] = [];
  if (remainingNum > 0) {
    chips.push({ label: 'Solde', sub: `${remainingNum.toFixed(2)} €`, value: remainingNum });
    if (remainingNum > 1) {
      const half = Math.round((remainingNum / 2) * 100) / 100;
      chips.push({ label: 'Moitié', sub: `${half.toFixed(2)} €`, value: half });
    }
  }
  for (const v of [10, 20, 50]) {
    if (remainingNum <= 0 || v < remainingNum) chips.push({ label: `${v} €`, value: v });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-1">
        {editAmount ? (
          <input
            autoFocus
            type="number"
            step="0.01"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            onBlur={() => setEditAmount(false)}
            className={`w-full text-center text-5xl font-bold tabular-nums bg-transparent border-b-2 border-zinc-200 focus:border-zinc-900 outline-none py-2 ${isNeg ? 'text-red-500' : 'text-zinc-900'}`}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditAmount(true)}
            className={`text-5xl font-bold tabular-nums py-2 inline-flex items-center gap-2 ${isNeg ? 'text-red-500' : 'text-zinc-900'}`}
          >
            {val.toFixed(2)} €
            <Pencil size={16} className="text-zinc-400" />
          </button>
        )}
        <p className="text-xs text-zinc-500 tabular-nums">
          Reste après : <span className="font-semibold text-zinc-700">{newRemaining.toFixed(2)} €</span>
        </p>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {chips.map((chip) => {
            const selected = Math.abs(val - chip.value) < 0.01;
            return (
              <button
                key={chip.label}
                type="button"
                onClick={() => {
                  setAmountInput(chip.value % 1 === 0 ? String(chip.value) : chip.value.toFixed(2));
                  setEditAmount(false);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold tabular-nums transition-colors ${
                  selected
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                {chip.label}{chip.sub && <span className="opacity-70 font-normal"> · {chip.sub}</span>}
              </button>
            );
          })}
        </div>
      )}

      <Button
        className={`w-full inline-flex items-center justify-center gap-2 ${
          isNeg ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-600 hover:bg-green-700 text-white'
        }`}
        onClick={() => onSubmit(amountInput)}
        disabled={isPending || val === 0 || Number.isNaN(val)}
      >
        {isPending
          ? 'Enregistrement…'
          : isNeg
            ? `Corriger −${Math.abs(val).toFixed(2)} €`
            : `Encaisser ${val.toFixed(2)} €`}
      </Button>

      {remainingNum <= 0 && !isNeg && (
        <p className="text-xs text-zinc-400 text-center">
          La commande est déjà soldée. Utilisez un montant négatif pour corriger un paiement reçu.
        </p>
      )}
    </div>
  );
}
