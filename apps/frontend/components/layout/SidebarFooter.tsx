'use client';

import { Menu } from '@base-ui/react/menu';
import { MoreHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getInitials } from '@/components/customers/detail/constants';
import type { ShopRole } from '@/lib/hooks/useMe';
import type { PlanBadgeState } from './planBadgeState';
import { SidebarAccountMenu } from './SidebarAccountMenu';

/** Pied fixe de la sidebar déployée, une seule ligne : avatar, nom, rôle, et « ⋯ » qui ouvre le menu du compte. */
export function SidebarFooter({ fullName, role, plan, onAppearance, onLogout }: {
  fullName: string | null;
  role: ShopRole | null;
  plan: PlanBadgeState | null;
  /** Ouvre le tiroir des palettes de couleurs. */
  onAppearance: () => void;
  onLogout: () => void;
}) {
  const tTeam = useTranslations('team');
  const tSidebar = useTranslations('layout.sidebar');

  const trigger = (
    <Menu.Trigger aria-label={tSidebar('account_menu')} title={tSidebar('account_menu')}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-popup-open:bg-muted data-popup-open:text-foreground">
      <MoreHorizontal className="h-5 w-5" />
    </Menu.Trigger>
  );

  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-sidebar-border py-2.5 ps-4 pe-2">
      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground text-xs font-semibold">
        {fullName ? getInitials(fullName) : '?'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-sidebar-foreground">{fullName ?? '—'}</span>
        {role && <span className="block truncate text-xs text-muted-foreground">{tTeam(`role.${role}`)}</span>}
      </span>
      <SidebarAccountMenu trigger={trigger} side="top" fullName={fullName} plan={plan} onAppearance={onAppearance} onLogout={onLogout} />
    </div>
  );
}
