'use client';

import { useTranslations } from 'next-intl';
import { TriangleAlert } from 'lucide-react';
import type { OrderState } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../../useZakatFormat';

interface OrderNoticeProps {
  state: Exclude<OrderState, 'unchanged'>;
  /** Montant copié dans la fiche et reste dû actuel de la commande (état « changed »). */
  before: string;
  after: string | null;
  format: ZakatFormat;
  onRemove: () => void;
  onUpdate: () => void;
}

/** Commande réglée, annulée, supprimée ou modifiée depuis la copie : le signaler, et corriger en un geste. */
export function OrderNotice({ state, before, after, format, onRemove, onUpdate }: OrderNoticeProps) {
  const t = useTranslations('zakat.steps.receivables');
  const changed = state === 'changed' && after !== null;
  return (
    <div role="status" className="flex basis-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-amber-500/10 ps-3 pe-1 text-[0.8125rem] text-amber-700 lg:order-last dark:text-amber-400">
      <p className="flex items-center gap-2 py-2 tabular-nums">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        {changed ? t('changed', { before: format.money(before), after: format.money(after) }) : t(state === 'changed' ? 'removed' : state)}
      </p>
      <button type="button" onClick={changed ? onUpdate : onRemove}
        className="min-h-11 rounded-md px-2 font-semibold whitespace-nowrap underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-primary/30">
        {t(changed ? 'update' : 'remove')}
      </button>
    </div>
  );
}
