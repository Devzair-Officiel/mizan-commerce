'use client';

import Link from 'next/link';
import { ClipboardPlus, Receipt } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export function EmptyState({ filtered }: { filtered: boolean }) {
  const t = useTranslations('orders.list');
  return (
    <div className="flex flex-col items-center gap-3 py-12 rounded-2xl border border-border bg-card px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Receipt size={20} className="text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold text-foreground">
        {filtered ? t('empty_filtered_title') : t('empty_title')}
      </p>
      <p className="text-xs text-muted-foreground max-w-88">
        {filtered ? t('empty_filtered_sub') : t('empty_sub')}
      </p>
      {!filtered && (
        <Button render={<Link href="/orders/new" />} size="sm" className="mt-1 gap-1.5">
          <ClipboardPlus size={14} />
          {t('empty_cta')}
        </Button>
      )}
    </div>
  );
}
