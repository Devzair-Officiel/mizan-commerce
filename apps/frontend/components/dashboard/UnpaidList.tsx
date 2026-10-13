'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { useShop } from '@/lib/hooks/useShop';
import { SectionCard } from '@/components/ui/SectionCard';
import { UnpaidRow } from '@/components/dashboard/UnpaidRow';
import type { UnpaidOrder } from '@/lib/hooks/useDashboard';

interface Props { count: number; items: UnpaidOrder[]; totalDue: string; }

export function UnpaidList({ count, items, totalDue }: Props) {
  const t = useTranslations('dashboard.unpaid');
  const formatMoney = useFormatMoney();
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';

  if (count === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 flex flex-col items-center gap-2 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Clock size={20} className="text-muted-foreground" />
        </span>
        <p className="text-sm font-semibold text-foreground">{t('empty')}</p>
        <p className="text-xs text-muted-foreground">{t('empty_sub')}</p>
      </div>
    );
  }

  const totalDueSlot = parseFloat(totalDue) > 0 ? (
    <span className="text-muted-foreground">
      {t('total_due_label')}{' '}
      <span className="font-semibold text-amber-700 dark:text-amber-400">
        {formatMoney(totalDue, currency)}
      </span>
    </span>
  ) : undefined;

  return (
    <SectionCard title={t('title')} rightSlot={totalDueSlot}>
      <div className="divide-y divide-border">
        {items.map((o) => <UnpaidRow key={o.id} order={o} currency={currency} />)}
      </div>
      {count > items.length && (
        <Link href="/orders?payment_status=unpaid"
          className="block text-center text-[0.8125rem] font-medium text-primary px-5 py-3.5 hover:bg-muted transition-colors border-t border-border">
          {t('see_all', { count })}
        </Link>
      )}
    </SectionCard>
  );
}
