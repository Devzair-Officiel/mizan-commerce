'use client';

import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { passesGate, type NavEntry } from '@/lib/navigation';
import type { ModuleKey } from '@/lib/hooks/useMe';
import type { Feature } from '@/lib/hooks/usePlanGating';
import { useNavBadges } from '@/lib/hooks/useNavBadges';
import { SidebarNavAccordion, type SidebarSubItem } from './SidebarNavAccordion';
import { SidebarNavFlyout } from './SidebarNavFlyout';
import { SidebarNavItem } from './SidebarNavItem';

/**
 * Groupe de la sidebar desktop. Déployée : titre en 15 px gras, items indentés de 10 px dessous (Accueil, sans titre,
 * reste à plat). Rail : un filet sépare les groupes. Une entrée à sous-menu devient accordéon, ou flyout en rail.
 */
export function SidebarNavGroup({ title, entries, membership, can, isActive, collapsed, children }: {
  title?: string;
  entries: readonly NavEntry[];
  membership: { is_admin: boolean; permissions: ModuleKey[] } | null;
  can: (feature: Feature) => boolean;
  isActive: (href: string) => boolean;
  collapsed: boolean;
  /** Lignes ajoutées en fin de groupe (Abonnement dans Compte). */
  children?: ReactNode;
}) {
  const tNav = useTranslations('layout.nav');
  const { data: badges } = useNavBadges();
  const titleId = useId();

  const allowed = (e: NavEntry) => passesGate(e.gate, membership) && (e.feature ? can(e.feature) : true);
  const toItem = (e: NavEntry): SidebarSubItem => ({
    href: e.href, label: tNav(e.labelKey), count: e.badgeKey ? (badges?.[e.badgeKey] ?? 0) : 0, countAlert: e.badgeKey === 'low_stock',
  });
  const visible = entries
    .map((e) => ({ entry: e, items: (e.children ?? []).filter(allowed).map(toItem) }))
    .filter(({ entry, items }) => (entry.children ? items.length > 0 : allowed(entry)));

  if (visible.length === 0 && !children) return null;

  return (
    <div className={title ? (collapsed ? 'mt-2 border-t border-sidebar-border pt-2' : 'mt-3') : ''}>
      {title && (
        <p id={titleId} className={collapsed ? 'sr-only' : 'px-2.5 pb-1 text-[0.9375rem] font-bold text-sidebar-foreground select-none'}>
          {title}
        </p>
      )}
      <ul aria-labelledby={title ? titleId : undefined} className={`flex flex-col gap-0.5 ${title && !collapsed ? 'ps-2.5' : ''}`}>
        {visible.map(({ entry, items }) => {
          const label = tNav(entry.labelKey);
          if (entry.children) {
            const Submenu = collapsed ? SidebarNavFlyout : SidebarNavAccordion;
            return <Submenu key={entry.href} entry={entry} label={label} items={items} isActive={isActive} />;
          }
          const { count, countAlert } = toItem(entry);
          return (
            <li key={entry.href}>
              <SidebarNavItem href={entry.href} label={label} icon={entry.icon} active={isActive(entry.href)}
                collapsed={collapsed} count={count} countAlert={countAlert} />
            </li>
          );
        })}
        {children}
      </ul>
    </div>
  );
}
