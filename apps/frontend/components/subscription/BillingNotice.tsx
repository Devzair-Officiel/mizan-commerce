'use client';

import { AlertTriangle, CalendarClock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Résiliation programmée (attente, ambre) ou dernier paiement échoué (danger, rouge). */
export type BillingNoticeKind = 'cancel_scheduled' | 'past_due';

interface BillingNoticeProps {
  kind: BillingNoticeKind;
  text: string;
  /** Ligne sous le texte, quand l'action est réservée au propriétaire. */
  hint?: string;
  action?: { label: string; onClick: () => void; pending: boolean };
}

const TONES: Record<BillingNoticeKind, string> = {
  cancel_scheduled: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  past_due: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
};

/** Bandeau d'état de l'abonnement Stripe, dans « Votre formule », avec son action éventuelle. */
export function BillingNotice({ kind, text, hint, action }: BillingNoticeProps) {
  const Icon = kind === 'past_due' ? AlertTriangle : CalendarClock;
  return (
    <div className={cn('flex flex-col gap-3 rounded-2xl border p-4', TONES[kind])} data-billing-notice={kind}>
      <div className="flex items-start gap-2.5">
        <Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium">{text}</p>
          {hint && <p className="text-sm">{hint}</p>}
        </div>
      </div>
      {action && (
        <Button type="button" onClick={action.onClick} disabled={action.pending} aria-busy={action.pending}
          className="h-11 self-start rounded-full px-5 active:scale-[0.98]">
          {action.pending && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {action.label}
        </Button>
      )}
    </div>
  );
}
