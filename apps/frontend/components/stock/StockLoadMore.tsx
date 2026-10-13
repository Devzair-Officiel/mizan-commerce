'use client';

import { useTranslations } from 'next-intl';

interface StockLoadMoreProps {
  onClick: () => void;
  loading: boolean;
}

/** « Charger plus » des listes mobiles du stock. */
export function StockLoadMore({ onClick, loading }: StockLoadMoreProps) {
  const t = useTranslations('stock.common');
  return (
    <button type="button" onClick={onClick} disabled={loading}
      className="mx-auto flex h-11 items-center justify-center rounded-2xl border border-border bg-card px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50">
      {loading ? '…' : t('load_more')}
    </button>
  );
}
