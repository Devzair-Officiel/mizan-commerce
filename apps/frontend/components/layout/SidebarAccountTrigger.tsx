'use client';

import { Menu } from '@base-ui/react/menu';
import type { ShopRole } from '@/lib/hooks/useMe';
import { useTranslations } from 'next-intl';

export function SidebarAccountTrigger({
  fullName,
  role,
}: {
  fullName: string | null;
  role: ShopRole | null;
}) {
  const tTeam = useTranslations('team');

  const initials =
    fullName
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase() ?? '')
      .join('') ?? '?';

  return (
    <Menu.Trigger className="flex w-full items-center gap-3 rounded-xl ps-3 pe-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors data-popup-open:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none outline-none mx-0 px-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground text-xs font-semibold">
        {initials}
      </span>
      <span className="flex-1 min-w-0 text-start">
        <span className="block truncate">{fullName ?? '—'}</span>
        {role && (
          <span className="block truncate text-xs text-muted-foreground font-normal">
            {tTeam(`role.${role}`)}
          </span>
        )}
      </span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground shrink-0">
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </Menu.Trigger>
  );
}
