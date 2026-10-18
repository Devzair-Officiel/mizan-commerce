'use client';

import { useTranslations } from 'next-intl';
import { ratioToPercent } from '@/lib/decimal';
import { cn } from '@/lib/utils';

interface ThresholdGaugeProps {
  above: boolean;
  /** `nisab_ratio` du serveur : plus petit / plus grand de (base, seuil). */
  ratio: string | null;
  base: string;
  threshold: string;
}

/**
 * Desktop : la base comparée au seuil. Au-dessus, la barre est pleine et le repère marque le seuil ;
 * en dessous, la barre s'arrête à la base et le repère est au bout. Décorative : la phrase à côté dit la même chose.
 */
export function ThresholdGauge({ above, ratio, base, threshold }: ThresholdGaugeProps) {
  const t = useTranslations('zakat.result');
  const percent = ratioToPercent(ratio);
  const legend = [t('gauge_threshold', { amount: threshold }), t('gauge_base', { amount: base })];

  return (
    <div aria-hidden className="w-70 max-lg:hidden">
      <div className="relative h-3 rounded-full bg-muted">
        <div className={cn('absolute inset-y-0 inset-s-0 rounded-full', above ? 'bg-primary' : 'bg-muted-foreground')}
          style={{ width: above ? '100%' : percent }} />
        <div className="absolute -top-1.5 h-6 w-0.5 bg-foreground" style={{ insetInlineStart: above ? percent : '100%' }} />
      </div>
      <div className="mt-2.5 flex justify-between gap-3 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        {(above ? legend : [...legend].reverse()).map((text) => <span key={text}>{text}</span>)}
      </div>
    </div>
  );
}
