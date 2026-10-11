import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Calendar } from 'lucide-react';
import { useFormatDate } from '@/lib/hooks/useFormat';
import { formatMoney, type ZakatCalculation } from '@/lib/hooks/useZakat';

export function ResultHero({ calc, ratePercent }: { calc: ZakatCalculation; ratePercent: string }) {
  const t = useTranslations('zakat.detail');
  const formatDate = useFormatDate();
  const strong = (className: string) =>
    function Strong(chunks: ReactNode) {
      return <span className={className}>{chunks}</span>;
    };

  return (
    <>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Calendar size={14} />
        <span>
          {t.rich('reference', {
            date: formatDate(calc.reference_date, { day: '2-digit', month: 'long', year: 'numeric' }),
            b: strong('text-foreground font-medium'),
          })}
        </span>
        {calc.finalized_at && (
          <>
            <span>·</span>
            <span>
              {t('finalized_on', { date: formatDate(calc.finalized_at, { day: '2-digit', month: 'short', year: 'numeric' }) })}
            </span>
          </>
        )}
      </div>

      <div className="rounded-3xl bg-primary text-primary-foreground px-5 py-6 flex flex-col gap-3">
        <p className="text-xs uppercase tracking-wide opacity-80">{t('amount_due')}</p>
        <p className="text-4xl font-bold tabular-nums leading-none">
          {formatMoney(calc.zakat_amount, calc.currency)}
        </p>
        <div className="h-px bg-primary-foreground/20" />
        <div className="flex flex-col gap-1 text-xs opacity-90">
          <p>
            {t.rich('base', {
              amount: formatMoney(calc.zakat_base, calc.currency),
              b: strong('font-semibold tabular-nums'),
            })}
          </p>
          <p>
            {t.rich('rate', { rate: ratePercent, b: strong('font-semibold tabular-nums') })}
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
