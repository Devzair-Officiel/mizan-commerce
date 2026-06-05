import { formatMoney, type ZakatCalculation } from '@/lib/hooks/useZakat';

interface CalcDetailCardProps {
  calc: ZakatCalculation;
  patrimoineTotal: number;
  ratePercent: string;
}

export function CalcDetailCard({ calc, patrimoineTotal, ratePercent }: CalcDetailCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 flex flex-col gap-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Calcul détaillé
      </p>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground tabular-nums">
        <p>
          <span className="text-foreground">{formatMoney(patrimoineTotal, calc.currency)}</span>{' '}
          <span>(patrimoine)</span>
        </p>
        <p>
          <span className="text-destructive">
            − {formatMoney(calc.short_term_debts, calc.currency)}
          </span>{' '}
          <span>(dettes exigibles)</span>
        </p>
        <p className="border-t border-border/60 pt-1 mt-1">
          =&nbsp;
          <span className="text-foreground font-semibold">
            {formatMoney(calc.zakat_base, calc.currency)}
          </span>{' '}
          <span>(base)</span>
        </p>
        <p>
          × <span className="text-foreground">{ratePercent}&nbsp;%</span> ={' '}
          <span className="text-primary font-semibold">
            {formatMoney(calc.zakat_amount, calc.currency)}
          </span>
        </p>
      </div>
    </div>
  );
}
