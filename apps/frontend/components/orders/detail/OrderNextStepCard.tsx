'use client';

import { useTranslations } from 'next-intl';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShop } from '@/lib/hooks/useShop';
import { useOrderStatusLabel } from '@/lib/orderStatusLabels';
import { getNextStep } from './constants';

interface OrderNextStepCardProps {
  status: string;
  isPending: boolean;
  onTransition: (next: string) => void;
}

function ShippedCard() {
  const t = useTranslations('orders.nextStep');
  const label = useOrderStatusLabel();
  const { data: shop } = useShop();
  const ck = shop?.catalog_kind ?? 'both';
  const fm = shop?.fulfillment_mode ?? null;
  const shippedSub = ck === 'services' ? t('shipped_sub_services')
    : fm === 'on_site' ? t('shipped_sub_on_site')
    : t('shipped_sub');
  return (
    <div className="rounded-2xl border border-green-100 bg-green-50 p-4 flex items-center gap-3">
      <CheckCircle2 className="text-green-600 shrink-0" size={22} />
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold text-green-800">{t('shipped_title_dynamic', { label: label('shipped') })}</p>
        <p className="text-xs text-green-700/80">{shippedSub}</p>
      </div>
    </div>
  );
}

export function OrderNextStepCard({ status, isPending, onTransition }: OrderNextStepCardProps) {
  const t = useTranslations('orders.nextStep');
  const { data: shop } = useShop();
  const ck = shop?.catalog_kind ?? 'both';
  const fm = shop?.fulfillment_mode ?? null;
  const nextStep = getNextStep(status, fm);

  if (status === 'shipped') return <ShippedCard />;
  if (!nextStep) return null;

  const goesToShipped = nextStep.next === 'shipped';
  const actionText = !goesToShipped
    ? t('action_to_prepare')
    : ck === 'services'
      ? t('action_shipped_services')
      : fm === 'delivery'
        ? t('action_shipped_delivery')
        : t('action_shipped_on_site');
  const stepTitle = actionText;
  const stepSub = goesToShipped
    ? t('prepared_sub')
    : t('to_prepare_sub', { kind: ck });
  const stepCta = actionText;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 flex flex-col gap-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${nextStep.accent}`}>
          {nextStep.icon}
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t('label')}</p>
          <p className="text-sm font-semibold text-zinc-900">{stepTitle}</p>
          <p className="text-xs text-zinc-500">{stepSub}</p>
        </div>
      </div>
      <Button
        onClick={() => onTransition(nextStep.next)}
        disabled={isPending}
        className={`w-full inline-flex items-center justify-center gap-2 ${nextStep.btnClass}`}
      >
        {stepCta}
        <ArrowRight size={16} />
      </Button>
    </div>
  );
}
