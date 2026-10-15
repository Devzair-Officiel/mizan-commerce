'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

/** Destination d'une ligne : un lien (sidebar desktop) ou une action (menu burger, qui se ferme d'abord). */
export type MenuRowNav = { href: string; onClick?: never } | { onClick: () => void; href?: never };

interface MenuRowProps {
  icon: ReactNode;
  label: string;
  badge?: ReactNode;
  active?: boolean;
  danger?: boolean;
  isFirst?: boolean;
}

export function MenuRow({ icon, label, badge, active = false, danger = false, isFirst = false, ...nav }: MenuRowProps & MenuRowNav) {
  const tileCls = danger
    ? 'bg-destructive/10 text-red-700 dark:text-red-400'
    : active
      ? 'bg-primary text-primary-foreground'
      : 'bg-muted text-foreground';
  const className = `relative flex w-full items-center gap-3 min-h-13.5 ps-3 pe-3.5 text-start transition-all active:scale-[0.98] ${
    active ? 'bg-secondary' : 'hover:bg-muted/40 active:bg-muted/60'
  }`;

  const content = (
    <>
      {!isFirst && (
        <span aria-hidden="true" className="absolute top-0 inset-s-14.5 inset-e-0 h-px bg-border" />
      )}
      <span className={`h-8.5 w-8.5 flex-none rounded-[0.625rem] flex items-center justify-center shrink-0 ${tileCls}`}>
        {icon}
      </span>
      <span className={`flex-1 min-w-0 text-[0.9375rem] ${active ? 'font-semibold' : 'font-medium'} ${
        danger ? 'text-red-700 dark:text-red-400' : 'text-foreground'
      }`}>
        {label}
      </span>
      {badge ?? (!danger && (
        <ChevronRight size={16} className="shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
      ))}
    </>
  );

  if (nav.href !== undefined) {
    return <Link href={nav.href} aria-current={active ? 'page' : undefined} className={className}>{content}</Link>;
  }
  return <button type="button" onClick={nav.onClick} className={className}>{content}</button>;
}
