interface PaymentPartialInputProps {
  amountPaid: string;
  paymentError: string;
  onAmountPaidChange: (v: string) => void;
}

export function PaymentPartialInput({
  amountPaid, paymentError, onAmountPaidChange,
}: PaymentPartialInputProps) {
  return (
    <div className="mt-3 flex flex-col gap-1">
      <label htmlFor="amount-paid" className="text-xs font-medium text-muted-foreground">
        Montant reçu
      </label>
      <div className="flex items-center gap-1 rounded-lg border border-border bg-background focus-within:border-primary transition-colors w-fit">
        <input
          id="amount-paid"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="0,00"
          value={amountPaid}
          onChange={(e) => onAmountPaidChange(e.target.value)}
          className="w-28 bg-transparent text-right text-sm font-medium tabular-nums px-2 py-1.5 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-sm text-muted-foreground pr-2">€</span>
      </div>
      {paymentError && (
        <p className="text-[11px] text-destructive px-1">{paymentError}</p>
      )}
    </div>
  );
}
