'use client';

import { useTranslations } from 'next-intl';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NEXT_STEP } from './constants';

interface OrderNextStepCardProps {
  status: string;
  isPending: boolean;
  onTransition: (next: string) => void;
}

export function OrderNextStepCard({ status, isPending, onTransition }: OrderNextStepCardProps) {
  const t = useTranslations('orders.nextStep');
  const nextStep = NEXT_STEP[status] ?? null;

  if (status === 'shipped') {
    return (
      <div className="rounded-2xl border border-green-100 bg-green-50 p-4 flex items-center gap-3">
        <CheckCircle2 className="text-green-600 shrink-0" size={22} />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold text-green-800">{t('shipped_title')}</p>
          <p className="text-xs text-green-700/80">{t('shipped_sub')}</p>
        </div>
      </div>
    );
  }

  if (!nextStep) return null;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 flex flex-col gap-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${nextStep.accent}`}>
          {nextStep.icon}
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t('label')}</p>
          <p className="text-sm font-semibold text-zinc-900">{t(`${nextStep.key}_title` as const)}</p>
          <p className="text-xs text-zinc-500">{t(`${nextStep.key}_sub` as const)}</p>
        </div>
      </div>
      <Button
        onClick={() => onTransition(nextStep.next)}
        disabled={isPending}
        className={`w-full inline-flex items-center justify-center gap-2 ${nextStep.btnClass}`}
      >
        {t(`${nextStep.key}_cta` as const)}
        <ArrowRight size={16} />
      </Button>
    </div>
  );
}
