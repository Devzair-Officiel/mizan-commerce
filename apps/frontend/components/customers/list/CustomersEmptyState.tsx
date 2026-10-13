'use client';

import Link from 'next/link';
import { UserPlus, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export function CustomersEmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  const t = useTranslations('customers.list');
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <Users size={20} className="text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold text-foreground">
        {filtered ? t('empty_filtered_title') : t('empty_title')}
      </p>
      <p className="max-w-88 text-xs text-muted-foreground">
        {filtered ? t('empty_filtered_sub') : t('empty_sub')}
      </p>
      {filtered ? (
        <button type="button" onClick={onClear} className="text-xs font-medium text-primary">{t('clear_filters')}</button>
      ) : (
        <Button render={<Link href="/customers/new" />} size="sm" className="mt-1 gap-1.5">
          <UserPlus size={14} />
          {t('new_cta')}
        </Button>
      )}
    </div>
  );
}
