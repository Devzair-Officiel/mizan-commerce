'use client';

import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { SidebarNavCount } from './SidebarNavCount';

/**
 * Ligne de la sidebar desktop. Déployée : 36 px, une seule ligne ; sous-item (`sub`) : 32 px sans icône.
 * Rail : icône seule dans une zone de 44 px, libellé en aria-label.
 */
export function SidebarNavItem({
  href, label, icon: Icon, active, collapsed, sub = false, count = 0, countAlert = false, danger = false, pill,
}: {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  collapsed: boolean;
  sub?: boolean;
  count?: number;
  /** Pastille rouge (stock bas). */
  countAlert?: boolean;
  /** Ligne en rouge (essai terminé). */
  danger?: boolean;
  pill?: ReactNode;
}) {
  const tone = active
    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
    : danger ? 'text-destructive hover:bg-muted' : 'text-sidebar-foreground hover:bg-muted';
  const iconTone = active ? 'text-primary' : danger ? '' : 'text-muted-foreground';

  if (collapsed) {
    return (
      <Link href={href} aria-label={label} title={label} aria-current={active ? 'page' : undefined}
        className={`relative mx-auto flex h-11 w-11 items-center justify-center rounded-xl transition-all active:scale-95 ${tone}`}>
        <Icon className={`h-5 w-5 ${iconTone}`} />
        <SidebarNavCount count={count} alert={countAlert} rail />
      </Link>
    );
  }

  return (
    <Link href={href} aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-lg px-2.5 text-sm whitespace-nowrap transition-colors ${sub ? 'h-8' : 'h-9'} ${tone}`}>
      {!sub && <Icon className={`h-5 w-5 shrink-0 ${iconTone}`} />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <SidebarNavCount count={count} alert={countAlert} />
      {pill}
    </Link>
  );
}
