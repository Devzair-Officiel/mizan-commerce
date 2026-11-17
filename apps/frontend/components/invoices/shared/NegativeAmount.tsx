'use client';

import { useFormatMoney } from '@/lib/hooks/useFormat';
import { cn } from '@/lib/utils';

/**
 * Montant affiché négatif (avoir, montant crédité), enregistré positif. Toujours en LTR :
 * en arabe, le signe reste devant le nombre.
 */
export function NegativeAmount({ value, currency, className }: { value: string | number; currency: string; className?: string }) {
  const money = useFormatMoney();
  const amount = Math.abs(Number(value));
  return <span dir="ltr" className={cn('tabular-nums', className)}>{money(amount ? -amount : 0, currency)}</span>;
}
