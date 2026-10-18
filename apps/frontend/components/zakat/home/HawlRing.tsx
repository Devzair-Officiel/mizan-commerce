'use client';

import { useTranslations } from 'next-intl';
import type { NextHawl } from '@/lib/hooks/useZakat';

const RADIUS = 70;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Douze repères : les douze mois de l'année. */
const TICKS = Array.from({ length: 12 }, (_, i) => i * 30);

/** Anneau de l'année en cours : arc des jours écoulés, croissant au point d'avancement, jours restants au centre. */
export function HawlRing({ next }: { next: NextHawl }) {
  const t = useTranslations('zakat.home');
  const total = next.cycle_length;
  const days = next.days_remaining;
  const elapsed = Math.min(total, Math.max(0, total - days));
  const progress = total > 0 ? elapsed / total : 0;
  const angle = progress * 360;

  return (
    <div role="img" aria-label={t('ring_label', { elapsed, total, days })} className="relative size-29 shrink-0 lg:size-44">
      <svg viewBox="0 0 176 176" aria-hidden className="block size-full">
        <g transform="translate(88 88)">
          <g className="stroke-border max-lg:hidden" strokeWidth={2} strokeLinecap="round">
            {TICKS.map((deg) => <line key={deg} x1={0} y1={-84} x2={0} y2={-80} transform={`rotate(${deg})`} />)}
          </g>
          <circle r={RADIUS} fill="none" className="stroke-muted" strokeWidth={10} />
          <circle r={RADIUS} fill="none" className="stroke-primary" strokeWidth={10} strokeLinecap="round"
            strokeDasharray={`${CIRCUMFERENCE * progress} ${CIRCUMFERENCE}`} transform="rotate(-90)" />
          <g transform={`rotate(${angle}) translate(0 ${-RADIUS}) rotate(${-angle})`}>
            <circle r={11} className="fill-card stroke-primary" strokeWidth={2} />
            <path d="M3.6-5.2A6 6 0 1 0 3.6 5.2 4.6 4.6 0 1 1 3.6-5.2z" className="fill-primary" />
          </g>
        </g>
      </svg>
      <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-3xl leading-none font-bold tracking-tight text-foreground tabular-nums lg:text-[2.75rem]">{days}</span>
        <span className="mt-0.5 max-w-19 text-[0.6875rem] leading-tight text-muted-foreground lg:mt-1 lg:max-w-24 lg:text-[0.78125rem]">
          {t('ring_caption', { days })}
        </span>
      </div>
    </div>
  );
}
