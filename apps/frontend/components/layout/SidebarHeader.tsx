'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useShop } from '@/lib/hooks/useShop';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { PlanBadge } from './PlanBadge';
import { planBadgeState } from './planBadgeState';

/** En-tête de la sidebar desktop, sans bordure ni fond : avatar et nom de la boutique, badge de formule. */
export function SidebarHeader({ collapsed }: { collapsed: boolean }) {
  const tc = useTranslations('layout.common');
  const { data: shop } = useShop();
  const { data: subscription } = useSubscription();
  const name = shop?.name?.trim() || tc('shop_fallback');
  const state = subscription ? planBadgeState(subscription) : null;

  const avatar = (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary text-primary-foreground text-base font-bold select-none">
      {shop?.logo_url
        ? <Image src={shop.logo_url} alt="" width={40} height={40} unoptimized className="h-10 w-10 object-cover" />
        : name.charAt(0).toUpperCase()}
    </span>
  );

  if (collapsed) {
    return (
      <div className="flex shrink-0 justify-center pt-5 pb-4" title={name}>
        {avatar}
        <span className="sr-only">{name}</span>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-3 px-4 pt-5 pb-4">
      {avatar}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold leading-tight text-sidebar-foreground">{name}</p>
        {state && <div className="mt-1 flex"><PlanBadge state={state} /></div>}
      </div>
    </div>
  );
}
