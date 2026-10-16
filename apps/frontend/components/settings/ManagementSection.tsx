import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Settings2, ChevronRight } from 'lucide-react';
import { SettingsCard } from './SettingsCard';
import { SettingsPlanLock, useSettingsLinks } from './SettingsNavigation';

export function ManagementSection() {
  const t = useTranslations('settings.management');
  const tNav = useTranslations('settings.navigation');
  const links = useSettingsLinks().filter((link) => link.key !== 'shop');
  return (
    <div className="lg:hidden" data-other-settings>
      <SettingsCard icon={Settings2} title={t('title')}>
        <ul className="-mx-1 flex flex-col gap-1">
          {links.map(({ key, href, icon: Icon, title, requiredPlan }) => (
            <li key={href}>
              <Link href={href}
                className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-muted active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{title}</span>
                  <span className="block text-xs text-muted-foreground">{key === 'team' ? tNav('team_subtitle') : t(`${key}_subtitle`)}</span>
                  {requiredPlan && <span className="mt-1 block"><SettingsPlanLock plan={requiredPlan} /></span>}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </SettingsCard>
    </div>
  );
}
