'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, Coins } from 'lucide-react';

export function ZakatBanner({ daysUntil }: { daysUntil: number }) {
  const t = useTranslations('dashboard.zakat_banner');
  return (
    <Link
      href="/zakat"
      className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/40 p-4 flex items-center gap-3 active:scale-[0.99] transition-transform"
    >
      <span className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 shrink-0">
        <Coins size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{t('title', { days: daysUntil })}</p>
        <p className="text-xs text-muted-foreground">{t('sub')}</p>
      </div>
      <ArrowRight size={16} className="text-muted-foreground shrink-0" />
    </Link>
  );
}
