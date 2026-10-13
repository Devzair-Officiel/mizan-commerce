'use client';

import type { InputHTMLAttributes, Ref } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface QuantityStepperProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> {
  ref?: Ref<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  /** `md` : champ de formulaire (44px) ; `sm` : ligne d'un tableau (38px). */
  size?: 'md' | 'sm';
  /** Plancher du bouton Moins : 1 (quantité reçue ou sortie), 0 (quantité comptée). */
  min?: number;
}

/** Quantité saisie (« 2,5 ») en nombre, `NaN` si elle est illisible. */
export function parseQuantity(value: string): number {
  return value.trim() ? Number(value.trim().replace(',', '.')) : NaN;
}

/**
 * Champ de quantité avec boutons Moins et Plus (pas de 1). La saisie reste
 * libre pour le vrac (« 2,5 ») ; Moins s'arrête à `min` (1 par défaut).
 */
export function QuantityStepper({ ref, value, onChange, size = 'md', min = 1, className, ...input }: QuantityStepperProps) {
  const t = useTranslations('stock.common');
  const n = parseQuantity(value);
  const step = (delta: number) => onChange(String(Math.max(min, (Number.isFinite(n) ? Math.round(n) : 0) + delta)));
  const button = cn(
    'grid shrink-0 place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
    size === 'md' ? 'size-11' : 'size-9.5 rounded-full',
  );

  return (
    <div className={cn(
      'flex items-center overflow-hidden border border-border bg-background has-aria-invalid:border-red-600 dark:has-aria-invalid:border-red-400',
      size === 'md' ? 'h-11 rounded-xl' : 'h-9.5 rounded-full', className,
    )}>
      <button type="button" onClick={() => step(-1)} disabled={!(n > min)} aria-label={t('decrease')} className={button}>
        <Minus size={16} aria-hidden />
      </button>
      <input {...input} ref={ref} value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" autoComplete="off"
        className={cn('h-full w-full min-w-0 bg-transparent text-center font-bold tabular-nums text-foreground outline-none',
          size === 'md' ? 'text-base' : 'text-sm')} />
      <button type="button" onClick={() => step(1)} aria-label={t('increase')} className={button}>
        <Plus size={16} aria-hidden />
      </button>
    </div>
  );
}
