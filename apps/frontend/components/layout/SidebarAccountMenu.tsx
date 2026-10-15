'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { LogOut, Palette } from 'lucide-react';
import { Menu } from '@base-ui/react/menu';
import { BRIGHTNESS_OPTIONS } from '@/components/ui/BrightnessToggle';
import { LOCALES, isLocale } from '@/i18n/locales';
import { LOCALE_LABELS } from '@/components/layout/LanguageSwitcher';
import { useAccountTheme } from '@/lib/hooks/useAccountTheme';
import { useLocaleSwitch } from '@/lib/hooks/useLocaleSwitch';
import { isThemeMode } from '@/lib/themes';
import { PlanBadge } from './PlanBadge';
import type { PlanBadgeState } from './planBadgeState';

/** Entrée du menu compte : 44 px de haut au minimum (design_principles.md §1). */
const ITEM_BASE = 'flex min-h-11 items-center gap-3 rounded-lg ps-3 pe-3 text-sm outline-none data-highlighted:bg-muted cursor-pointer transition-all active:scale-[0.98]';
const ITEM_CLS = `${ITEM_BASE} text-sidebar-foreground`;
const LABEL_CLS = 'px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground';

/**
 * Menu du compte desktop, popover translucide : formule, Apparence (clair / sombre / système, palettes), langue,
 * Se déconnecter. Ouvert par l'avatar du rail (côté fin de ligne) ou par « ⋯ » du pied de la sidebar déployée (au-dessus).
 */
export function SidebarAccountMenu({ trigger, side, fullName, plan, onAppearance, onLogout }: {
  /** Menu.Trigger qui ouvre le menu. */
  trigger: ReactNode;
  side: 'inline-end' | 'top';
  fullName: string | null;
  plan: PlanBadgeState | null;
  /** Ouvre le tiroir des palettes de couleurs. */
  onAppearance: () => void;
  onLogout: () => void;
}) {
  const t = useTranslations('layout.themeDrawer');
  const tc = useTranslations('layout.common');
  const tSidebar = useTranslations('layout.sidebar');
  const { theme } = useTheme();
  const { setThemeMode } = useAccountTheme();
  const { current: currentLocale, switchLocale } = useLocaleSwitch();

  return (
    <Menu.Root>
      {trigger}
      <Menu.Portal>
        {/* Rail : déclencheur de 44px centré dans 80px, 18px jusqu'au bord puis 8px d'écart. Pied : 8px au-dessus. */}
        <Menu.Positioner side={side} align="end" sideOffset={side === 'top' ? 8 : 26} className="z-50 w-60">
          <Menu.Popup className="rounded-xl border border-sidebar-border bg-sidebar/70 p-1.5 shadow-lg backdrop-blur-xl outline-none">
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-sidebar-foreground">{fullName ?? '—'}</span>
              {plan && <PlanBadge state={plan} />}
            </div>
            <Menu.Separator className="my-1 border-t border-sidebar-border" />
            <Menu.Group>
              <Menu.GroupLabel className={LABEL_CLS}>{tc('appearance')}</Menu.GroupLabel>
              <Menu.RadioGroup value={isThemeMode(theme) ? theme : 'system'} onValueChange={(v) => { if (isThemeMode(v)) setThemeMode(v); }}>
                {BRIGHTNESS_OPTIONS.map(({ value, labelKey, icon: Icon }) => (
                  <Menu.RadioItem key={value} value={value} closeOnClick={false} className={ITEM_CLS}>
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1">{t(labelKey)}</span>
                    <Menu.RadioItemIndicator className="h-1.5 w-1.5 rounded-full bg-primary" />
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
              <Menu.Item className={ITEM_CLS} onClick={onAppearance}>
                <Palette className="h-4 w-4 shrink-0 text-muted-foreground" />
                {tSidebar('palettes')}
              </Menu.Item>
            </Menu.Group>
            <Menu.Separator className="my-1 border-t border-sidebar-border" />
            <Menu.Group>
              <Menu.GroupLabel className={LABEL_CLS}>{tc('language')}</Menu.GroupLabel>
              <Menu.RadioGroup value={currentLocale} onValueChange={(v) => { if (isLocale(v)) switchLocale(v); }}>
                {LOCALES.map((loc) => (
                  <Menu.RadioItem key={loc} value={loc} lang={loc} className={ITEM_CLS}>
                    <span className="flex-1">{LOCALE_LABELS[loc]}</span>
                    <Menu.RadioItemIndicator className="h-1.5 w-1.5 rounded-full bg-primary" />
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
            <Menu.Separator className="my-1 border-t border-sidebar-border" />
            <Menu.Item className={`${ITEM_BASE} text-destructive`} onClick={onLogout}>
              <LogOut className="h-4 w-4 shrink-0 rtl:-scale-x-100" />
              {tc('logout')}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
