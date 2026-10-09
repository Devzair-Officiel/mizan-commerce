'use client';

import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  total: number;
  page: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
}

export function OrdersPagination({ total, page, pageSize, onPrev, onNext }: Props) {
  const t = useTranslations('orders.list');
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const hasPrev = page > 1;
  const hasNext = to < total;

  if (total <= pageSize) return null;

  return (
    <div className="flex items-center justify-between px-1">
      <span className="text-xs text-muted-foreground">
        {t('pagination_range', { from, to, total })}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={13} />
          {t('pagination_prev')}
        </button>
        <button
          onClick={onNext}
          disabled={!hasNext}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {t('pagination_next')}
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}
