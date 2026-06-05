'use client';

import { useTranslations } from 'next-intl';
import { AlertCircle, ChevronRight } from 'lucide-react';

interface AlertBannerProps {
  count: number;
  active: boolean;
  onToggle: () => void;
}

export function AlertBanner({ count, active, onToggle }: AlertBannerProps) {
  const t = useTranslations('orders.alert');
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors active:scale-[0.98] ${
        active
          ? 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10'
          : 'border-border bg-card hover:bg-muted/50'
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
        <AlertCircle size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {t('banner_title', { count })}
        </p>
        <p className="text-xs text-muted-foreground">
          {active ? t('banner_active') : t('banner_idle')}
        </p>
      </div>
      <ChevronRight size={16} className="text-muted-foreground shrink-0" />
    </button>
  );
}
