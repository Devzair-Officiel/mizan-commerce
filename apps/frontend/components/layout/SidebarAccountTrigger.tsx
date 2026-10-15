'use client';

import { Menu } from '@base-ui/react/menu';
import { getInitials } from '@/components/customers/detail/constants';
import type { PlanBadgeState } from './planBadgeState';

const DOT_TONES: Record<PlanBadgeState['kind'], string> = {
  trial: 'bg-primary',
  expired: 'bg-destructive',
  plan: 'bg-secondary-foreground',
};

/** Avatar du rail, pastille de formule dans le coin ; ouvre le menu du compte (thème, langue, déconnexion). */
export function SidebarAccountTrigger({ fullName, plan, label }: {
  fullName: string | null;
  plan: PlanBadgeState | null;
  /** Nom de l'utilisateur et formule, lus par les lecteurs d'écran. */
  label: string;
}) {
  return (
    <Menu.Trigger aria-label={label} title={label}
      className="relative mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground text-xs font-semibold transition-all hover:ring-2 hover:ring-sidebar-border active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring data-popup-open:ring-2 data-popup-open:ring-sidebar-ring">
      {fullName ? getInitials(fullName) : '?'}
      {plan && <span className={`absolute -bottom-0.5 -inset-e-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-sidebar ${DOT_TONES[plan.kind]}`} />}
    </Menu.Trigger>
  );
}
