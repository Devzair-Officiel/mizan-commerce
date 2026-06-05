import { Calendar } from 'lucide-react';
import { formatMoney, type ZakatCalculation } from '@/lib/hooks/useZakat';

export function ResultHero({ calc, ratePercent }: { calc: ZakatCalculation; ratePercent: string }) {
  return (
    <>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Calendar size={14} />
        <span>
          Référence&nbsp;:{' '}
          <span className="text-foreground font-medium">
            {new Date(calc.reference_date).toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
          </span>
        </span>
        {calc.finalized_at && (
          <>
            <span>·</span>
            <span>
              Finalisé le{' '}
              {new Date(calc.finalized_at).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </>
        )}
      </div>

      <div className="rounded-3xl bg-primary text-primary-foreground px-5 py-6 flex flex-col gap-3">
        <p className="text-xs uppercase tracking-wide opacity-80">Zakat due</p>
        <p className="text-4xl font-bold tabular-nums leading-none">
          {formatMoney(calc.zakat_amount, calc.currency)}
        </p>
        <div className="h-px bg-primary-foreground/20" />
        <div className="flex flex-col gap-1 text-xs opacity-90">
          <p>
            Base zakatable&nbsp;:{' '}
            <span className="font-semibold tabular-nums">
              {formatMoney(calc.zakat_base, calc.currency)}
            </span>
          </p>
          <p>
            Taux appliqué&nbsp;: <span className="font-semibold tabular-nums">{ratePercent}&nbsp;%</span>
          </p>
          <p className="opacity-70 mt-1">
            {formatMoney(calc.zakat_base, calc.currency)} × {ratePercent}&nbsp;% ={' '}
            {formatMoney(calc.zakat_amount, calc.currency)}
          </p>
        </div>
      </div>
    </>
  );
}
