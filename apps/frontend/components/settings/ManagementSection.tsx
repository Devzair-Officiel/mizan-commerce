import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Settings2, Users, Receipt, Globe, MessageCircle, Sparkles, ChevronRight, type LucideIcon } from 'lucide-react';
import { SettingsCard } from './SettingsCard';

interface ManagementLink {
  href: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
}

interface ManagementSectionProps {
  showPublicPage: boolean;
  showMessages: boolean;
  teamTitle: string;
  teamSubtitle: string;
}

export function ManagementSection({ showPublicPage, showMessages, teamTitle, teamSubtitle }: ManagementSectionProps) {
  const t = useTranslations('settings.management');
  const links: ManagementLink[] = [
    { href: '/settings/invoices', icon: Receipt, title: t('invoices'), subtitle: t('invoices_subtitle') },
    { href: '/settings/team', icon: Users, title: teamTitle, subtitle: teamSubtitle },
    ...(showPublicPage
      ? [{
          href: '/settings/public-page',
          icon: Globe,
          title: t('public_page'),
          subtitle: t('public_page_subtitle'),
        }]
      : []),
    ...(showMessages
      ? [{ href: '/settings/messages', icon: MessageCircle, title: t('messages'), subtitle: t('messages_subtitle') }]
      : []),
    {
      href: '/settings/subscription',
      icon: Sparkles,
      title: t('subscription'),
      subtitle: t('subscription_subtitle'),
    },
  ];

  return (
    <SettingsCard icon={Settings2} title={t('title')} description={t('description')}>
      <ul className="flex flex-col gap-1 -mx-1">
        {links.map(({ href, icon: Icon, title, subtitle }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-muted transition-colors"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                <Icon className="h-4.5 w-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground leading-tight">{title}</p>
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">{subtitle}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}
