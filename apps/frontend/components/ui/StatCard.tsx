import Link from 'next/link';
import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type StatTone = 'neutral' | 'amber' | 'green' | 'red';

interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  /** Couleur de la pastille d'icône. */
  tone?: StatTone;
  /** Colore aussi la valeur avec `tone` (montant à encaisser, alerte). */
  toneValue?: boolean;
  subTone?: StatTone;
  /** Navigation vers une autre page (Accueil). */
  href?: string;
  /** Filtre la liste de la page courante : bouton bascule avec `aria-pressed`. */
  onClick?: () => void;
  pressed?: boolean;
}

const DOT: Record<StatTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  green: 'bg-green-500/10 text-green-600 dark:text-green-400',
  red: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

const TEXT: Record<StatTone, string> = {
  neutral: 'text-muted-foreground',
  amber: 'text-amber-700 dark:text-amber-400',
  green: 'text-green-700 dark:text-green-400',
  red: 'text-red-600 dark:text-red-400',
};

function StatCardBody({ label, value, sub, icon, tone = 'neutral', toneValue, subTone = 'neutral' }: StatCardProps) {
  return (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="text-[0.8125rem] font-medium text-muted-foreground">{label}</span>
        {icon && (
          <span className={cn('flex size-7.5 shrink-0 items-center justify-center rounded-full', DOT[tone])}>{icon}</span>
        )}
      </span>
      <span className={cn(
        'max-[379px]:text-2xl text-[1.625rem] font-bold leading-[1.1] tabular-nums',
        toneValue ? TEXT[tone] : 'text-foreground',
      )}>
        {value}
      </span>
      {sub != null && <span className={cn('mt-1 text-[0.8125rem]', TEXT[subTone])}>{sub}</span>}
    </>
  );
}

const CARD = 'flex h-full flex-col gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-3.5 text-start sm:px-4.5 sm:py-4';

export function StatCard(props: StatCardProps) {
  const { href, onClick, pressed } = props;
  if (href) {
    return (
      <Link href={href} className={cn(CARD, 'active:scale-[0.98] transition-transform')}>
        <StatCardBody {...props} />
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={pressed} className={cn(
        CARD, 'cursor-pointer transition-colors hover:bg-muted/40',
        pressed && 'border-primary ring-1 ring-primary',
      )}>
        <StatCardBody {...props} />
      </button>
    );
  }
  return <div className={CARD}><StatCardBody {...props} /></div>;
}
