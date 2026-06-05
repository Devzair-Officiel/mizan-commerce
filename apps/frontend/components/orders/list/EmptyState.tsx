'use client';

import { Receipt } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function EmptyState({ filtered }: { filtered: boolean }) {
  const t = useTranslations('orders.list');
  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Receipt size={20} className="text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">
        {filtered ? t('empty_filtered_title') : t('empty_title')}
      </p>
      <p className="text-xs text-muted-foreground text-center max-w-[16rem]">
        {filtered ? t('empty_filtered_sub') : t('empty_sub')}
      </p>
    </div>
  );
}
