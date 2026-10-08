'use client';

import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

interface MenuRowProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  badge?: ReactNode;
  active?: boolean;
  danger?: boolean;
  isFirst?: boolean;
}

export function MenuRow({ icon, label, onClick, badge, active = false, danger = false, isFirst = false }: MenuRowProps) {
  const tileCls = danger
    ? 'bg-destructive/10 text-red-700 dark:text-red-400'
    : active
      ? 'bg-primary text-primary-foreground'
      : 'bg-muted text-foreground';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex w-full items-center gap-3 min-h-13.5 ps-3 pe-3.5 text-start transition-colors ${
        active ? 'bg-secondary' : 'hover:bg-muted/40 active:bg-muted/60'
      }`}
    >
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
    </button>
  );
}
