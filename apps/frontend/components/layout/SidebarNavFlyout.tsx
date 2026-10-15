'use client';

import Link from 'next/link';
import { Menu } from '@base-ui/react/menu';
import type { NavEntry } from '@/lib/navigation';
import type { SidebarSubItem } from './SidebarNavAccordion';
import { SidebarNavCount } from './SidebarNavCount';

/**
 * Entrée à sous-menu du rail : flyout translucide ouvert au survol, au clic ou au clavier (Entrée, Espace, flèches),
 * du côté de fin de ligne (à droite en français, à gauche en arabe). Les flèches parcourent les sous-items, Échap referme.
 */
export function SidebarNavFlyout({ entry, label, items, isActive }: {
  entry: NavEntry;
  label: string;
  items: readonly SidebarSubItem[];
  isActive: (href: string) => boolean;
}) {
  const childActive = items.some((item) => isActive(item.href));
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const Icon = entry.icon;

  return (
    <li>
      <Menu.Root modal={false}>
        <Menu.Trigger
          openOnHover
          delay={80}
          closeDelay={120}
          aria-label={label}
          className={`relative mx-auto flex h-11 w-11 items-center justify-center rounded-xl transition-all active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring data-popup-open:bg-muted ${
            childActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground hover:bg-muted'
          }`}
        >
          <Icon className={`h-5 w-5 ${childActive ? 'text-primary' : 'text-muted-foreground'}`} />
          <SidebarNavCount count={total} alert={items.some((item) => item.countAlert && item.count > 0)} rail />
        </Menu.Trigger>
        <Menu.Portal>
          {/* Déclencheur de 44px centré dans le rail de 80px : 18px jusqu'au bord, puis 8px d'écart. */}
          <Menu.Positioner side="inline-end" align="start" sideOffset={26} className="z-50">
            <Menu.Popup className="min-w-48 rounded-xl border border-sidebar-border bg-sidebar/70 p-1.5 shadow-lg backdrop-blur-xl outline-none">
              <Menu.Group>
                <Menu.GroupLabel className="px-2.5 pt-1 pb-1.5 text-[0.9375rem] font-bold text-sidebar-foreground">{label}</Menu.GroupLabel>
                {items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Menu.LinkItem
                      key={item.href}
                      render={<Link href={item.href} aria-current={active ? 'page' : undefined} />}
                      className={`flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm whitespace-nowrap outline-none data-highlighted:bg-muted ${
                        active ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold' : 'text-sidebar-foreground'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      <SidebarNavCount count={item.count} alert={item.countAlert} />
                    </Menu.LinkItem>
                  );
                })}
              </Menu.Group>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </li>
  );
}
