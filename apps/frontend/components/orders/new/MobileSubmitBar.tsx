'use client';

import { useTranslations } from 'next-intl';
import { useShop } from '@/lib/hooks/useShop';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';

interface MobileSubmitBarProps {
  total: number;
  isPending: boolean;
  onClick: () => void | Promise<void>;
}

export function MobileSubmitBar({ total, isPending, onClick }: MobileSubmitBarProps) {
  const t = useTranslations('orders.new');
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';
  const formatMoney = useFormatMoney();
  const money = (v: number | string) => formatMoney(v, currency, { maximumFractionDigits: 2 });

  return (
    <FloatingActionBar>
      <div className="flex flex-col min-w-0">
        <span className="text-xs text-muted-foreground">{t('total')}</span>
        <span className="text-xl font-bold tabular-nums text-foreground">{money(total)}</span>
      </div>
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={isPending}
        className="flex-1 h-11 rounded-full bg-primary text-primary-foreground text-[0.9375rem] font-semibold flex items-center justify-center disabled:opacity-60 active:scale-[0.98] transition-all"
      >
        {isPending ? t('submit_creating') : t('submit_label')}
      </button>
    </FloatingActionBar>
  );
}
