'use client';

import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pageItems } from './pageItems';

interface DataTablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

const ROUND = 'flex size-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-card';

/** Pied de tableau : « 1 à 20 sur 50 » et pagination numérotée. */
export function DataTablePagination({ page, pageSize, total, onPageChange }: DataTablePaginationProps) {
  const t = useTranslations('ui.list');
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-[0.8125rem] text-muted-foreground">
      <span>{t('pagination_range', { from, to, total })}</span>
      {totalPages > 1 && (
        <nav aria-label={t('pagination_label')} className="flex items-center gap-1.5">
          <button type="button" aria-label={t('pagination_prev')} disabled={page <= 1}
            onClick={() => onPageChange(page - 1)} className={ROUND}>
            <ChevronLeft size={16} className="rtl:rotate-180" aria-hidden />
          </button>
          {pageItems(page, totalPages).map((item, i) => item === 'gap' ? (
            <span key={`gap-${i}`} aria-hidden>…</span>
          ) : (
            <button key={item} type="button" onClick={() => onPageChange(item)}
              aria-label={t('pagination_page', { page: item })}
              aria-current={item === page ? 'page' : undefined}
              className={cn(
                'h-9 min-w-9 rounded-full px-2 text-[0.8125rem] tabular-nums transition-colors',
                item === page ? 'bg-secondary font-semibold text-secondary-foreground' : 'text-foreground hover:bg-muted',
              )}>
              {item}
            </button>
          ))}
          <button type="button" aria-label={t('pagination_next')} disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)} className={ROUND}>
            <ChevronRight size={16} className="rtl:rotate-180" aria-hidden />
          </button>
        </nav>
      )}
    </div>
  );
}
