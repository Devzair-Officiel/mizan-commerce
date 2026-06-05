import { X } from 'lucide-react';

interface OrderSummaryProps {
  subtotal: number;
  total: number;
  discount: string;
  shipping: string;
  showDiscount: boolean;
  showShipping: boolean;
  onDiscountChange: (v: string) => void;
  onShippingChange: (v: string) => void;
  onShowDiscount: () => void;
  onShowShipping: () => void;
  onClearDiscount: () => void;
  onClearShipping: () => void;
}

export function OrderSummary({
  subtotal, total, discount, shipping,
  showDiscount, showShipping,
  onDiscountChange, onShippingChange,
  onShowDiscount, onShowShipping,
  onClearDiscount, onClearShipping,
}: OrderSummaryProps) {
  const discountN = parseFloat(discount) || 0;
  const shippingN = parseFloat(shipping) || 0;
  const showAddLine =
    (!showDiscount && discountN === 0) || (!showShipping && shippingN === 0);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Résumé</span>
      </div>
      <div className="flex flex-col">
        <SummaryRow label="Sous-total">
          <span className="text-sm font-medium text-foreground tabular-nums">{subtotal.toFixed(2)} €</span>
        </SummaryRow>
        {(showDiscount || discountN > 0) && (
          <SummaryRow label="Remise">
            <SummaryAmountInput
              value={discount}
              onChange={onDiscountChange}
              ariaLabel="Remise"
              onClear={onClearDiscount}
            />
          </SummaryRow>
        )}
        {(showShipping || shippingN > 0) && (
          <SummaryRow label="Frais">
            <SummaryAmountInput
              value={shipping}
              onChange={onShippingChange}
              ariaLabel="Frais"
              onClear={onClearShipping}
            />
          </SummaryRow>
        )}
        {showAddLine && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 border-b border-border">
            {!showDiscount && discountN === 0 && (
              <button
                type="button"
                onClick={onShowDiscount}
                className="text-xs font-medium text-primary hover:underline"
              >
                + Ajouter une remise
              </button>
            )}
            {!showShipping && shippingN === 0 && (
              <button
                type="button"
                onClick={onShowShipping}
                className="text-xs font-medium text-primary hover:underline"
              >
                + Ajouter des frais
              </button>
            )}
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
          <span className="text-sm font-semibold text-foreground">Total</span>
          <span className="text-base font-bold text-foreground tabular-nums">{total.toFixed(2)} €</span>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function SummaryAmountInput({
  value, onChange, ariaLabel, onClear,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  onClear?: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-1 rounded-lg border border-border bg-background focus-within:border-primary transition-colors">
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="0,00"
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={!value}
          className="w-20 bg-transparent text-right text-sm font-medium tabular-nums px-2 py-1 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-sm text-muted-foreground pr-2">€</span>
      </div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Retirer ${ariaLabel.toLowerCase()}`}
          className="p-1 text-muted-foreground hover:text-destructive transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
