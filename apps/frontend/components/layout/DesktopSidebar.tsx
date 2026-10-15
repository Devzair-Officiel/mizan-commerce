'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { useThemeDrawer } from '@/components/layout/ThemeDrawer';
import { useMe, useUpdateSidebarCollapsed } from '@/lib/hooks/useMe';
import { usePlanGating } from '@/lib/hooks/usePlanGating';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { ACCOUNT_ENTRIES, SUBSCRIPTION_HREF, isNavActive, passesGate, useSidebarNavGroups } from '@/lib/navigation';
import { planBadgeState } from './planBadgeState';
import { SidebarAccountMenu } from './SidebarAccountMenu';
import { SidebarFooter } from './SidebarFooter';
import { SidebarHeader } from './SidebarHeader';
import { SidebarNavGroup } from './SidebarNavGroup';
import { SidebarPlanBadge } from './SidebarPlanBadge';

const SIDEBAR_ID = 'desktop-sidebar';

/**
 * Sidebar desktop translucide : déployée (272 px) ou en rail (80 px), préférence gardée sur le compte.
 * La navigation défile seule entre l'en-tête et le pied, qui restent fixes.
 */
export function DesktopSidebar() {
  const tNav = useTranslations('layout.nav');
  const tSidebar = useTranslations('layout.sidebar');
  const tBurger = useTranslations('layout.burgerMenu');
  const pathname = usePathname();
  const router = useRouter();
  const { toggle: toggleThemeDrawer } = useThemeDrawer();
  const { data: me } = useMe();
  const { data: subscription } = useSubscription();
  const setCollapsed = useUpdateSidebarCollapsed();
  const { can } = usePlanGating();
  const navGroups = useSidebarNavGroups();
  const membership = me?.membership ?? null;
  const collapsed = me?.sidebar_collapsed ?? false;
  const plan = subscription ? planBadgeState(subscription) : null;

  const canCreateOrder = passesGate({ kind: 'module', module: 'orders' }, membership) && can('orders');
  // Paramètres boutique n'est pas actif sur la page Abonnement, qui a sa propre ligne.
  const isActive = (href: string) => isNavActive(href, pathname)
    && !(href === '/settings' && isNavActive(SUBSCRIPTION_HREF, pathname));
  const groupProps = { membership, can, isActive, collapsed };

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <aside id={SIDEBAR_ID} data-collapsed={collapsed || undefined}
      className={`hidden lg:flex flex-col fixed inset-y-0 inset-s-0 z-30 border-e border-sidebar-border bg-sidebar/60 backdrop-blur-xl text-sidebar-foreground transition-[width] duration-200 ${collapsed ? 'w-20' : 'w-68'}`}>
      <SidebarHeader collapsed={collapsed} onToggle={() => setCollapsed.mutate(!collapsed)} controls={SIDEBAR_ID} />

      {canCreateOrder && (
        <div className={collapsed ? 'flex justify-center pb-2' : 'px-3 pb-2'}>
          <Link href="/orders/new" aria-label={collapsed ? tNav('new_sale') : undefined} title={collapsed ? tNav('new_sale') : undefined}
            className={`flex items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-95 ${collapsed ? 'h-11 w-11' : 'h-10 w-full px-4'}`}>
            <Plus className="h-4.5 w-4.5" strokeWidth={2.5} />
            {!collapsed && tNav('new_sale')}
          </Link>
        </div>
      )}

      <nav aria-label={tSidebar('nav_label')} className={`flex-1 min-h-0 overflow-y-auto overscroll-contain pb-3 ${collapsed ? 'px-2' : 'px-3'}`}>
        {navGroups.map((group) => (
          <SidebarNavGroup key={group.titleKey ?? 'home'} title={group.titleKey ? tNav(group.titleKey) : undefined}
            entries={group.entries} {...groupProps} />
        ))}
        <SidebarNavGroup title={tBurger('account_section')} entries={ACCOUNT_ENTRIES} {...groupProps}>
          <SidebarPlanBadge collapsed={collapsed} active={isActive(SUBSCRIPTION_HREF)} />
        </SidebarNavGroup>
      </nav>

      {collapsed ? (
        <div className="shrink-0 border-t border-sidebar-border py-3">
          <SidebarAccountMenu fullName={me?.full_name ?? null} plan={plan} onAppearance={toggleThemeDrawer} onLogout={handleLogout} />
        </div>
      ) : (
        <SidebarFooter fullName={me?.full_name ?? null} role={membership?.role ?? null} onAppearance={toggleThemeDrawer} onLogout={handleLogout} />
      )}
    </aside>
  );
}
