'use client';

import Link from 'next/link';
import { Package, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { CatalogKind } from '@/lib/hooks/useMe';

interface Props {
  kind: CatalogKind;
  filtered: boolean;
  onClear: () => void;
}

export function ProductsEmptyState({ kind, filtered, onClear }: Props) {
  const t = useTranslations('articles.list');
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <Package size={20} className="text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold text-foreground">
        {filtered ? t('empty_filtered_title', { kind }) : t('empty_title', { kind })}
      </p>
      <p className="max-w-88 text-xs text-muted-foreground">
        {filtered ? t('empty_filtered_sub', { kind }) : t('empty_sub', { kind })}
      </p>
      {filtered ? (
        <button type="button" onClick={onClear} className="text-xs font-medium text-primary">{t('clear_filters')}</button>
      ) : (
        <Button render={<Link href="/products/new" />} size="sm" className="mt-1 gap-1.5">
          <Plus size={14} />
          {t('new_cta', { kind })}
        </Button>
      )}
    </div>
  );
}
