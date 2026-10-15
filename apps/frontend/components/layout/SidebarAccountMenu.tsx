'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Palette } from 'lucide-react';
import { Menu } from '@base-ui/react/menu';
import { isNavActive, ACCOUNT_ENTRIES, passesGate, type NavLabelKey } from '@/lib/navigation';
import { LogoutIcon } from '@/lib/navigation';
import type { ModuleKey, ShopRole } from '@/lib/hooks/useMe';
import { LOCALES } from '@/i18n/locales';
import { LOCALE_LABELS } from '@/components/layout/LanguageSwitcher';
import { useLocaleSwitch } from '@/lib/hooks/useLocaleSwitch';
import { SidebarAccountTrigger } from './SidebarAccountTrigger';

/** Entrée du menu compte : 44 px de haut au minimum (design_principles.md §1). */
const ITEM_CLS = 'flex min-h-11 items-center gap-3 rounded-lg ps-3 pe-3 text-sm text-foreground hover:bg-muted data-highlighted:bg-muted cursor-pointer transition-all active:scale-[0.98]';

function AccountNavItems({
  entries,
  pathname,
  router,
}: {
  entries: typeof ACCOUNT_ENTRIES;
  pathname: string;
  router: ReturnType<typeof useRouter>;
}) {
  const tNav = useTranslations('layout.nav');
  return (
    <>
      {entries.map(({ href, labelKey, icon: Icon }) => {
        const active = isNavActive(href, pathname);
        return (
          <Menu.Item
            key={href}
            className={`flex min-h-11 items-center gap-3 rounded-lg ps-3 pe-3 text-sm cursor-pointer transition-all active:scale-[0.98] ${
              active
                ? 'bg-secondary text-secondary-foreground font-semibold'
                : 'text-foreground hover:bg-muted data-highlighted:bg-muted'
            }`}
            onClick={() => router.push(href)}
          >
            <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
            {tNav(labelKey as NavLabelKey)}
          </Menu.Item>
        );
      })}
    </>
  );
}

export function SidebarAccountMenu({
  me,
  membership,
  pathname,
  onLogout,
  toggleThemeDrawer,
}: {
  me: { full_name: string } | null;
  membership: { is_admin: boolean; permissions: ModuleKey[]; role: ShopRole } | null;
  pathname: string;
  onLogout: () => void;
  toggleThemeDrawer: () => void;
}) {
  const tc = useTranslations('layout.common');
  const router = useRouter();
  const { current: currentLocale, switchLocale } = useLocaleSwitch();

  const allowedAccountEntries = ACCOUNT_ENTRIES.filter((e) =>
    passesGate(e.gate, membership),
  );

  return (
    <Menu.Root>
      <SidebarAccountTrigger
        fullName={me?.full_name ?? null}
        role={membership?.role ?? null}
      />
      <Menu.Portal>
        <Menu.Positioner side="top" align="start" sideOffset={6} className="z-50 w-52">
          <Menu.Popup className="rounded-xl border border-border bg-card shadow-lg p-1 outline-none">
            <AccountNavItems entries={allowedAccountEntries} pathname={pathname} router={router} />
            <Menu.Separator className="my-1 border-t border-border" />
            <Menu.RadioGroup
              value={currentLocale}
              onValueChange={(v) => switchLocale(v as typeof LOCALES[number])}
              aria-label={tc('language')}
            >
              {LOCALES.map((loc) => (
                <Menu.RadioItem
                  key={loc}
                  value={loc}
                  lang={loc}
                  className={ITEM_CLS}
                >
                  <Menu.RadioItemIndicator className="h-4 w-4 shrink-0 flex items-center justify-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  </Menu.RadioItemIndicator>
                  <span className="empty:hidden" />
                  {LOCALE_LABELS[loc]}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
            <Menu.Separator className="my-1 border-t border-border" />
            <Menu.Item
              className={ITEM_CLS}
              onClick={toggleThemeDrawer}
            >
              <Palette className="h-4 w-4 shrink-0 text-muted-foreground" />
              {tc('appearance')}
            </Menu.Item>
            <Menu.Item
              className={ITEM_CLS}
              onClick={onLogout}
            >
              <LogoutIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              {tc('logout')}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
