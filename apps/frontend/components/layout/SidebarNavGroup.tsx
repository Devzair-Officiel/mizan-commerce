'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { isNavActive, passesGate, type NavGroup, type NavLabelKey } from '@/lib/navigation';
import type { ModuleKey } from '@/lib/hooks/useMe';
import type { Feature } from '@/lib/hooks/usePlanGating';

export function SidebarNavGroup({
  group,
  membership,
  can,
  pathname,
}: {
  group: NavGroup;
  membership: { is_admin: boolean; permissions: ModuleKey[] } | null;
  can: (feature: Feature) => boolean;
  pathname: string;
}) {
  const tNav = useTranslations('layout.nav');

  const visible = group.entries.filter(
    (e) => passesGate(e.gate, membership) && (e.feature ? can(e.feature) : true),
  );

  if (visible.length === 0) return null;

  return (
    <div className={group.titleKey ? 'mt-3' : ''}>
      {group.titleKey && (
        <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground select-none">
          {tNav(group.titleKey)}
        </p>
      )}
      <div className="flex flex-col gap-0.5">
        {visible.map(({ href, labelKey, icon: Icon }) => {
          const active = isNavActive(href, pathname);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl ps-3 pe-3 py-2.5 text-sm transition-colors ${
                active
                  ? 'bg-secondary text-secondary-foreground font-semibold'
                  : 'text-foreground hover:bg-muted'
              }`}
            >
              <Icon
                className={`h-5 w-5 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`}
              />
              {tNav(labelKey as NavLabelKey)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
