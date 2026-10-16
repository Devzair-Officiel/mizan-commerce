'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { usePlans, useSubscription } from '@/lib/hooks/useSubscription';
import { UsageGauge } from '@/components/subscription/UsageGauge';
import { Button } from '@/components/ui/button';

export function TeamMembersHeader({ action }: { action: ReactNode }) {
  const t = useTranslations('team');
  const tUsage = useTranslations('settings.usage');
  const tPlans = useTranslations('settings.subscription.plans');
  const subscription = useSubscription();
  const plans = usePlans();
  const sub = subscription.data;
  const plan = plans.data?.find((p) => p.code === sub?.effective_plan_code);
  const count = sub?.usage.members.count;
  const limit = plan?.max_members;
  const ready = count !== undefined && plan !== undefined;

  return (
    <header className="header-band flex flex-col gap-3 rounded-2xl border border-border p-4 lg:rounded-none lg:border-0 lg:border-b lg:p-5" data-team-header>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold">{t('members_title')}</h2>
            {ready && <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground tabular-nums" data-member-usage>
              {limit === null ? t('unlimited_members', { count }) : tUsage('members', { count, limit: limit ?? 0 })}
            </span>}
          </div>
          <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
        </div>
        {action}
      </div>
      {(subscription.isLoading || plans.isLoading) && <div className="h-8 animate-pulse rounded-xl bg-muted" />}
      {(subscription.isError || plans.isError) && <div role="alert" className="flex flex-wrap items-center gap-3 text-xs">
        <p>{t('usage_error')}</p>
        <Button type="button" variant="ghost" onClick={() => { subscription.refetch(); plans.refetch(); }}>{t('retry')}</Button>
      </div>}
      {ready && <>
        {typeof limit === 'number' && <UsageGauge usageKey="members" count={count} limit={limit} labelClassName="sr-only" />}
        <p className="text-xs text-muted-foreground">{t('plan_capacity', { name: tPlans(`${plan.code}.name`), limit: limit ?? 0, unlimited: limit === null ? 'yes' : 'no' })}</p>
      </>}
    </header>
  );
}

export function TeamAvailablePlaces() {
  const t = useTranslations('team');
  const { data: sub } = useSubscription();
  const { data: plans } = usePlans();
  const count = sub?.usage.members.count;
  const limit = plans?.find((p) => p.code === sub?.effective_plan_code)?.max_members;
  if (count === undefined || typeof limit !== 'number' || count >= limit) return null;
  return (
    <p data-member-places className="mt-4 rounded-2xl border border-dashed border-border bg-card p-4 text-sm font-medium text-muted-foreground tabular-nums lg:mt-0 lg:rounded-none lg:border-0 lg:border-t lg:border-solid">
      {t('available_places', { count: limit - count })}
    </p>
  );
}
