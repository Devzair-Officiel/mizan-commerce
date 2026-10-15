'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { NavEntry } from '@/lib/navigation';
import { SidebarNavCount } from './SidebarNavCount';
import { SIDEBAR_HOVER_SHIFT, SidebarNavItem } from './SidebarNavItem';

export type SidebarSubItem = { href: string; label: string; count: number; countAlert: boolean };

/**
 * Entrée à sous-menu de la sidebar déployée : accordéon d'un seul niveau, ouvert d'office quand la page
 * courante est l'un de ses sous-items. Sous-items de 32 px le long d'un filet vertical.
 */
export function SidebarNavAccordion({ entry, label, items, isActive }: {
  entry: NavEntry;
  label: string;
  items: readonly SidebarSubItem[];
  isActive: (href: string) => boolean;
}) {
  const panelId = useId();
  const childActive = items.some((item) => isActive(item.href));
  // null : suit la page courante ; un clic fixe l'état.
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? childActive;
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const Icon = entry.icon;

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setChoice(!open)}
        className={`flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm whitespace-nowrap hover:bg-muted ${
          childActive && !open ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold' : `text-sidebar-foreground ${SIDEBAR_HOVER_SHIFT}`
        }`}
      >
        <Icon className={`h-5 w-5 shrink-0 ${childActive ? 'text-primary' : 'text-muted-foreground'}`} />
        <span className="min-w-0 flex-1 truncate text-start">{label}</span>
        {!open && <SidebarNavCount count={total} alert={items.some((item) => item.countAlert && item.count > 0)} />}
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <ul id={panelId} hidden={!open} className="ms-5 mt-0.5 flex flex-col gap-0.5 border-s border-sidebar-border ps-2">
        {items.map((item) => (
          <li key={item.href}>
            <SidebarNavItem href={item.href} label={item.label} icon={entry.icon} active={isActive(item.href)}
              collapsed={false} sub count={item.count} countAlert={item.countAlert} />
          </li>
        ))}
      </ul>
    </li>
  );
}
