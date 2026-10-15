'use client';

import Image from 'next/image';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useShop } from '@/lib/hooks/useShop';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { PlanBadge } from './PlanBadge';
import { planBadgeState } from './planBadgeState';

/** En-tête de la sidebar desktop : avatar et nom de la boutique, badge de formule, bouton replier / déplier. */
export function SidebarHeader({ collapsed, onToggle, controls }: {
  collapsed: boolean;
  onToggle: () => void;
  /** id de la sidebar, pour aria-controls. */
  controls: string;
}) {
  const t = useTranslations('layout.sidebar');
  const tc = useTranslations('layout.common');
  const { data: shop } = useShop();
  const { data: subscription } = useSubscription();
  const name = shop?.name?.trim() || tc('shop_fallback');
  const state = subscription ? planBadgeState(subscription) : null;
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  const avatar = (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary text-primary-foreground text-base font-bold select-none">
      {shop?.logo_url
        ? <Image src={shop.logo_url} alt="" width={40} height={40} unoptimized className="h-10 w-10 object-cover" />
        : name.charAt(0).toUpperCase()}
    </span>
  );
  const toggle = (
    <button type="button" onClick={onToggle} aria-label={collapsed ? t('expand') : t('collapse')}
      aria-expanded={!collapsed} aria-controls={controls}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95">
      <ToggleIcon className="h-5 w-5 rtl:-scale-x-100" />
    </button>
  );

  if (collapsed) {
    return (
      <div className="flex shrink-0 flex-col items-center gap-1 pt-4 pb-2" title={name}>
        {avatar}
        <span className="sr-only">{name}</span>
        {toggle}
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-3 ps-4 pe-2 pt-4 pb-3">
      {avatar}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold leading-tight text-sidebar-foreground">{name}</p>
        {state && <div className="mt-1 flex"><PlanBadge state={state} /></div>}
      </div>
      {toggle}
    </div>
  );
}
