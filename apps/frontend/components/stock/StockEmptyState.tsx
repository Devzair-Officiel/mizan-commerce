'use client';

import Link from 'next/link';
import { Boxes, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface StockEmptyStateProps {
  /** Onglet affiché : le message vide n'est pas le même. */
  view: 'levels' | 'movements';
  filtered: boolean;
  onClear: () => void;
}

export function StockEmptyState({ view, filtered, onClear }: StockEmptyStateProps) {
  const t = useTranslations('stock.empty');
  const key = filtered ? `${view}_filtered` : view;
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <Boxes size={20} className="text-muted-foreground" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-foreground">{t(`${key}_title`)}</p>
      <p className="max-w-88 text-xs text-muted-foreground">{t(`${key}_sub`)}</p>
      {filtered ? (
        <button type="button" onClick={onClear} className="text-xs font-medium text-primary">{t('clear_filters')}</button>
      ) : view === 'levels' && (
        <Button render={<Link href="/products/new" />} size="sm" className="mt-1 gap-1.5">
          <Plus size={14} aria-hidden />
          {t('add_product')}
        </Button>
      )}
    </div>
  );
}
