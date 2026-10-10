'use client';

import { Fragment } from 'react';
import { useTranslations } from 'next-intl';
import { Check, X } from 'lucide-react';
import { SectionCard } from '@/components/ui/SectionCard';
import { useOrderActivity, type Order } from '@/lib/hooks/useOrders';
import { useShop } from '@/lib/hooks/useShop';
import { useOrderStatusLabel } from '@/lib/orderStatusLabels';
import { cn } from '@/lib/utils';
import { getRevertStatus } from './constants';
import { computeOrderSteps, type OrderStep, type StepState } from './orderSteps';
import { useDayTime } from './useDayTime';
import type { OrderDetailActions } from './useOrderDetailState';

const CIRCLE: Record<StepState, string> = {
  done: 'bg-green-700 text-card dark:bg-green-400',
  current: 'bg-amber-500/10 ring-2 ring-inset ring-amber-600 dark:ring-amber-400',
  upcoming: 'bg-card ring-2 ring-inset ring-border',
  cancelled: 'bg-red-700 text-card dark:bg-red-400',
};

const LINE: Record<StepState, string> = {
  done: 'bg-green-700 dark:bg-green-400',
  current: 'bg-green-700 dark:bg-green-400',
  upcoming: 'bg-border',
  cancelled: 'bg-red-700 dark:bg-red-400',
};

function StepItem({ step, label, sub }: { step: OrderStep; label: string; sub: string }) {
  return (
    <div role="listitem" aria-current={step.state === 'current' ? 'step' : undefined}
      className="flex w-18 shrink-0 flex-col items-center gap-2 text-center lg:w-30">
      <span className={cn('grid size-7 place-items-center rounded-full', CIRCLE[step.state])}>
        {step.state === 'done' && <Check size={16} strokeWidth={3} aria-hidden />}
        {step.state === 'cancelled' && <X size={16} strokeWidth={3} aria-hidden />}
        {step.state === 'current' && <span className="size-2.5 rounded-full bg-amber-600 dark:bg-amber-400" aria-hidden />}
      </span>
      <span>
        <span className={cn('block text-[0.8125rem] font-semibold lg:text-sm', step.state === 'upcoming' ? 'text-muted-foreground'
          : step.state === 'cancelled' ? 'text-red-700 dark:text-red-400' : 'text-foreground')}>{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{sub}</span>
      </span>
    </div>
  );
}

/** Carte « Suivi » : étapes du parcours de la boutique, avec l'heure de chaque étape passée. */
export function OrderStatusStepper({ order, actions }: { order: Order; actions: OrderDetailActions }) {
  const t = useTranslations('orders.stepper');
  const tDetail = useTranslations('orders.detail');
  const label = useOrderStatusLabel();
  const { format } = useDayTime();
  const { data: shop } = useShop();
  const { data: activity } = useOrderActivity(order.id);
  const fm = shop?.fulfillment_mode ?? null;
  const steps = computeOrderSteps(order, activity?.events ?? [], fm);
  const revert = order.status === 'shipped' ? getRevertStatus(order.status, fm) : null;
  const modeKey = shop?.catalog_kind === 'services' ? 'services' : fm ?? 'none';
  const mode = t('mode', { mode: modeKey });

  const subFor = (s: OrderStep) => s.state === 'current' ? t('in_progress')
    : s.state === 'upcoming' ? t('upcoming') : s.at ? format(s.at) : '';

  return (
    <SectionCard title={t('title')} rightSlot={mode ? <span className="text-muted-foreground">{mode}</span> : undefined}>
      <div className="px-4 py-4 lg:px-5">
        <div role="list" aria-label={t('title')} className="flex items-start gap-1 py-1">
          {steps.map((step, i) => (
            <Fragment key={step.key}>
              {i > 0 && <div className={cn('mt-3.25 h-0.5 min-w-2 flex-1 rounded-full', LINE[step.state])} aria-hidden />}
              <StepItem step={step} sub={subFor(step)} label={step.key === 'created' ? t('created') : label(step.key)} />
            </Fragment>
          ))}
        </div>
        {revert && (
          <p className="mt-4 border-t border-border pt-3 text-[0.8125rem] text-muted-foreground">
            {t('mistake', { mode: modeKey })}{' '}
            <button type="button" disabled={actions.pending} onClick={() => actions.transition(revert)}
              className="font-semibold text-primary hover:underline disabled:opacity-50">
              {tDetail('revert_to', { label: label(revert) })}
            </button>
          </p>
        )}
      </div>
    </SectionCard>
  );
}
