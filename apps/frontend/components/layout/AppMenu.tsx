'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Palette, LogOut } from 'lucide-react';
import { useThemeDrawer } from '@/components/layout/ThemeDrawer';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { MenuHeader } from '@/components/layout/MenuHeader';
import { MenuSection } from '@/components/layout/MenuSection';
import { MenuRow, type MenuRowNav } from '@/components/layout/MenuRow';
import { MenuPlanBadge } from '@/components/layout/MenuPlanBadge';
import { useShop } from '@/lib/hooks/useShop';
import { useMe } from '@/lib/hooks/useMe';
import { usePlanGating } from '@/lib/hooks/usePlanGating';
import { useNavGroups, passesGate, isNavActive, ACCOUNT_ENTRIES, type NavEntry, type NavGroup } from '@/lib/navigation';
import { useNavBadges } from '@/lib/hooks/useNavBadges';
import { confirmLeave } from '@/lib/dirtyGuard';

function NavBadge({ count, danger }: { count: number; danger?: boolean }) {
  return (
    <span className={`min-w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center px-2 leading-none shrink-0 ${
      danger ? 'bg-destructive/10 text-red-700 dark:text-red-400' : 'bg-muted text-foreground'
    }`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

function NavGroupSection({ group, pathname, nav, badges }: {
  group: NavGroup; pathname: string; nav: (href: string) => MenuRowNav;
  badges: Record<string, number> | undefined;
}) {
  const tNav = useTranslations('layout.nav');
  return (
    <MenuSection title={group.titleKey ? tNav(group.titleKey) : undefined}>
      {group.entries.map((entry, i) => {
        const count = entry.badgeKey ? (badges?.[entry.badgeKey] ?? 0) : 0;
        return (
          <MenuRow
            key={entry.href}
            icon={<entry.icon className="h-4.5 w-4.5" />}
            label={tNav(entry.labelKey)}
            {...nav(entry.href)}
            isFirst={i === 0}
            active={isNavActive(entry.href, pathname)}
            badge={count > 0 ? <NavBadge count={count} danger={entry.badgeKey === 'low_stock'} /> : undefined}
          />
        );
      })}
    </MenuSection>
  );
}

/**
 * Menu de l'application, même organisation partout : navigation, Compte, Langue, abonnement, déconnexion.
 * Menu burger (`onClose`) : lignes-actions qui ferment le tiroir, sans Accueil (déjà dans la barre du bas).
 * Sidebar desktop (`desktop`) : lignes-liens, Accueil et « Nouvelle commande », entrées hors formule masquées.
 */
export function AppMenu({ desktop = false, onClose }: { desktop?: boolean; onClose?: () => void }) {
  const tc = useTranslations('layout.common');
  const tBurger = useTranslations('layout.burgerMenu');
  const tNav = useTranslations('layout.nav');
  const { toggle: toggleTheme } = useThemeDrawer();
  const router   = useRouter();
  const pathname = usePathname();
  const { data: me } = useMe();
  const { data: shop } = useShop();
  const membership = me?.membership ?? null;
  const { can } = usePlanGating();
  const { data: badges } = useNavBadges();
  const navGroups = useNavGroups();

  const shown = (e: NavEntry) => passesGate(e.gate, membership) && (desktop ? !e.feature || can(e.feature) : e.href !== '/dashboard');
  const groups = navGroups.map((g) => ({ ...g, entries: g.entries.filter(shown) })).filter((g) => g.entries.length > 0);
  const accountEntries = ACCOUNT_ENTRIES.filter((e) => passesGate(e.gate, membership));
  const canCreateOrder = desktop && passesGate({ kind: 'module', module: 'orders' }, membership) && can('orders');
  const roleLabels = { owner: tBurger('role_owner'), admin: tBurger('role_admin'), staff: tBurger('role_staff') };
  const roleLabel = membership?.role ? (roleLabels[membership.role] ?? '') : '';
  const subtitle = [me?.full_name, roleLabel].filter(Boolean).join(', ');
  const displayName = shop?.name?.trim() || tc('shop_fallback');

  function handleNav(href: string) { if (!confirmLeave(tc('confirm_leave'))) return; onClose?.(); router.push(href); }
  const nav = (href: string): MenuRowNav => (desktop ? { href } : { onClick: () => handleNav(href) });
  async function handleLogout() { onClose?.(); await fetch('/api/auth/logout', { method: 'POST' }); router.replace('/login'); }

  return (
    <>
      <MenuHeader logoUrl={shop?.logo_url} displayName={displayName} subtitle={subtitle} onClose={onClose} closeLabel={tc('close')} />
      <div className="flex flex-col gap-5.5 px-3.5 pt-4.5" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}>
        {canCreateOrder && (
          <Link
            href="/orders/new"
            className="flex items-center justify-center gap-2.5 w-full rounded-full h-11 px-4 text-sm font-semibold text-primary-foreground bg-primary transition-all hover:opacity-90 active:scale-95"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {tNav('new_sale')}
          </Link>
        )}
        {groups.map((group) => (
          <NavGroupSection key={group.titleKey ?? 'main'} group={group} pathname={pathname} nav={nav} badges={badges} />
        ))}
        <MenuSection title={tBurger('account_section')}>
          {accountEntries.map((entry, i) => (
            <MenuRow key={entry.href} icon={<entry.icon className="h-4.5 w-4.5" />} label={tNav(entry.labelKey)} {...nav(entry.href)} isFirst={i === 0} active={isNavActive(entry.href, pathname)} />
          ))}
          <MenuRow icon={<Palette className="h-4.5 w-4.5" />} label={tc('appearance')} onClick={() => { onClose?.(); toggleTheme(); }} />
        </MenuSection>
        <section className="flex flex-col gap-2">
          <h2 className="m-0 px-1.5 text-sm font-bold text-foreground tracking-[-0.005em]">{tc('language')}</h2>
          <LanguageSwitcher />
        </section>
        <MenuPlanBadge nav={nav('/settings/subscription')} />
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <MenuRow icon={<LogOut className="h-4.5 w-4.5" />} label={tc('logout')} onClick={handleLogout} danger isFirst />
        </div>
      </div>
    </>
  );
}
