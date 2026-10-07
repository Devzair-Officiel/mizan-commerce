'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useThemeDrawer } from '@/components/layout/ThemeDrawer';
import { useMe } from '@/lib/hooks/useMe';
import { usePlanGating } from '@/lib/hooks/usePlanGating';
import { useShop } from '@/lib/hooks/useShop';
import { passesGate, NAV_GROUPS } from '@/lib/navigation';
import { SidebarNavGroup } from './SidebarNavGroup';
import { SidebarAccountMenu } from './SidebarAccountMenu';
import { SidebarTrialCard } from './SidebarTrialCard';

export function DesktopSidebar() {
  const tNav = useTranslations('layout.nav');
  const pathname = usePathname();
  const router = useRouter();
  const { toggle: toggleThemeDrawer } = useThemeDrawer();
  const { data: me } = useMe();
  const { data: shop } = useShop();
  const membership = me?.membership ?? null;
  const { can } = usePlanGating();

  const canCreateOrder =
    passesGate({ kind: 'module', module: 'orders' }, membership) && can('orders');

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 fixed inset-y-0 inset-s-0 z-30 border-e border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-border shrink-0">
        <span className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-bold select-none">
          M
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-foreground leading-tight">Mizan</div>
          {shop?.name && (
            <div className="text-xs text-muted-foreground truncate leading-tight">{shop.name}</div>
          )}
        </div>
      </div>

      {/* Nouvelle vente */}
      {canCreateOrder && (
        <div className="px-3 pt-4 pb-2">
          <Link
            href="/orders/new"
            className="flex items-center justify-center gap-2.5 w-full rounded-full h-11 px-4 text-sm font-semibold text-primary-foreground bg-primary transition-all hover:opacity-90 active:scale-95"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {tNav('new_sale')}
          </Link>
        </div>
      )}

      {/* Navigation groupée */}
      <nav className="flex flex-col flex-1 overflow-y-auto px-3 py-2 gap-0.5">
        {NAV_GROUPS.map((group, idx) => (
          <SidebarNavGroup
            key={idx}
            group={group}
            membership={membership}
            can={can}
            pathname={pathname}
          />
        ))}
      </nav>

      {/* Footer : carte essai + menu compte */}
      <div className="pb-3 border-t border-border pt-3">
        <SidebarTrialCard />
        <SidebarAccountMenu
          me={me ?? null}
          membership={membership}
          pathname={pathname}
          onLogout={handleLogout}
          toggleThemeDrawer={toggleThemeDrawer}
        />
      </div>
    </aside>
  );
}
