'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { formatStock, type ProductUnit } from '@/lib/hooks/useProducts';
import { useFormat, useFormatMoney } from '@/lib/hooks/useFormat';

export function OrderRow({
  id, label, sub, amount, currency,
}: {
  id: string;
  label: string;
  sub?: string | null;
  amount: string | number;
  currency: string;
}) {
  const formatMoney = useFormatMoney();
  return (
    <Link
      href={`/orders/${id}`}
      className="flex items-center justify-between px-4 py-3 active:bg-muted/60 transition-colors"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-base font-medium text-foreground">{label}</span>
        {sub && <span className="text-sm text-muted-foreground">{sub}</span>}
      </div>
      <span className="text-base font-semibold text-foreground tabular-nums">
        {formatMoney(amount, currency, { maximumFractionDigits: 2 })}
      </span>
    </Link>
  );
}

export function StockRow({
  id, name, variantName, qty, unit, baseQuantity,
}: {
  id: string;
  name: string;
  variantName: string;
  qty: string;
  unit: ProductUnit;
  baseQuantity: string;
}) {
  const t = useTranslations('dashboard.rows');
  const num = parseFloat(qty);
  const isOut = num <= 0;
  return (
    <Link
      href={`/products/${id}`}
      className="flex items-center justify-between px-4 py-3 active:bg-muted/60 transition-colors gap-3"
    >
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-base font-medium text-foreground truncate">{name}</span>
        <span className="text-xs text-muted-foreground truncate">{variantName}</span>
      </div>
      <span className={`text-sm font-semibold tabular-nums shrink-0 ${isOut ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}>
        {isOut
          ? t('out_of_stock')
          : t('remaining', { qty: formatStock(qty, unit, { baseQuantity, packagingName: variantName }) })}
      </span>
    </Link>
  );
}

export function ReminderRow({ title, due_at }: { title: string; due_at: string }) {
  const fmt = useFormat();
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-base font-medium text-foreground flex-1 truncate pr-3">{title}</span>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {fmt.dateTime(due_at, { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
}

export function SeeAllRow({ href, count }: { href: string; count: number }) {
  const t = useTranslations('dashboard.rows');
  return (
    <Link
      href={href}
      className="flex items-center justify-center px-4 py-2.5 text-sm font-medium text-muted-foreground active:bg-muted/60 transition-colors"
    >
      {t('see_all', { count })}
    </Link>
  );
}
