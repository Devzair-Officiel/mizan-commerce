'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { UsageGauge } from '@/components/subscription/UsageGauge';
import { usePlanUsage } from '@/lib/hooks/usePlanUsage';
import type { UsageKey } from '@/lib/hooks/useSubscription';

/** Bandeau discret en haut d'une liste, à partir de 80 % de la limite de la formule. */
export function UsageBanner({ usageKey }: { usageKey: UsageKey }) {
  const t = useTranslations('settings.upgrade');
  const { counter, level } = usePlanUsage(usageKey);
  if (!counter || counter.limit === null || level === 'ok') return null;

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card px-4 py-3" data-testid="usage-banner">
      <div className="min-w-0 flex-1">
        <UsageGauge usageKey={usageKey} count={counter.count} limit={counter.limit} />
      </div>
      <Link href="/settings/subscription"
        className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap text-[0.8125rem] font-semibold text-primary hover:underline">
        {t('cta')}
      </Link>
    </div>
  );
}
