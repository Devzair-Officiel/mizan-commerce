'use client';

import { AlertCircle, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SUBSCRIPTION_HREF } from '@/lib/navigation';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { PlanBadge } from './PlanBadge';
import { planBadgeState } from './planBadgeState';
import { SidebarNavItem } from './SidebarNavItem';

/** Ligne « Abonnement » du groupe Compte, pastille de formule à droite ; en rail, icône seule. */
export function SidebarPlanBadge({ collapsed, active }: { collapsed: boolean; active: boolean }) {
  const tSub = useTranslations('settings.subscription');
  const { data: subscription } = useSubscription();

  const state = subscription ? planBadgeState(subscription) : null;
  const expired = state?.kind === 'expired';

  return (
    <li>
      <SidebarNavItem
        href={SUBSCRIPTION_HREF}
        label={tSub('title')}
        icon={expired ? AlertCircle : Sparkles}
        active={active}
        collapsed={collapsed}
        danger={expired}
        pill={state ? <PlanBadge state={state} /> : undefined}
      />
    </li>
  );
}
