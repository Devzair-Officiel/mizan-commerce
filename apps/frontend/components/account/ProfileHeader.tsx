'use client';

import { useTranslations } from 'next-intl';
import { useMe } from '@/lib/hooks/useMe';
import { getInitials } from '@/components/customers/detail/constants';
import { LoadingRegion } from '@/components/ui/LoadingRegion';
import { Skeleton } from '@/components/ui/skeleton';

export function ProfileHeader() {
  const tRole = useTranslations('team.role');
  const { data: me, isLoading } = useMe();
  if (isLoading) return (
    <LoadingRegion className="flex items-center gap-4">
      <Skeleton className="size-16 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-6 w-2/3 rounded-xl" />
        <Skeleton className="h-4 w-full rounded-xl" />
        <Skeleton className="h-4 w-3/4 rounded-xl" />
      </div>
    </LoadingRegion>
  );
  if (!me) return null;
  return (
    <header data-profile-header className="flex items-center gap-4">
      <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-full bg-secondary text-xl font-semibold text-secondary-foreground lg:size-18 lg:text-2xl">
        {getInitials(me.full_name || me.email)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 dir="auto" className="wrap-anywhere text-lg font-semibold text-foreground lg:text-xl">{me.full_name}</h2>
        {me.membership && <p className="wrap-anywhere text-sm text-muted-foreground">
          {tRole(me.membership.role)} <span aria-hidden>·</span> <bdi>{me.membership.shop_name}</bdi>
        </p>}
        <p dir="ltr" className="wrap-anywhere text-start text-xs text-muted-foreground">{me.email}</p>
      </div>
    </header>
  );
}
