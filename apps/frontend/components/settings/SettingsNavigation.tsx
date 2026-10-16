'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Store, Users, Receipt, MessageCircle, Globe, CreditCard, LockKeyhole } from 'lucide-react';
import { featureMinPlan, usePlanGating, type Feature } from '@/lib/hooks/usePlanGating';
import type { PlanCode } from '@/lib/hooks/useSubscription';

const LINKS = [
  { key: 'shop', href: '/settings', icon: Store },
  { key: 'team', href: '/settings/team', icon: Users, feature: 'multi_user' },
  { key: 'invoices', href: '/settings/invoices', icon: Receipt, feature: 'invoices' },
  { key: 'messages', href: '/settings/messages', icon: MessageCircle, feature: 'whatsapp' },
  { key: 'public_page', href: '/settings/public-page', icon: Globe, feature: 'public_pages' },
  { key: 'subscription', href: '/settings/subscription', icon: CreditCard },
] as const;

/** Les mêmes destinations et les mêmes verrous sur desktop et mobile. */
export function useSettingsLinks() {
  const t = useTranslations('settings.navigation');
  const { can } = usePlanGating();
  return LINKS.map((link) => {
    const feature: Feature | undefined = 'feature' in link ? link.feature : undefined;
    return { ...link, title: t(link.key), requiredPlan: feature && !can(feature) ? featureMinPlan(feature) : undefined };
  });
}

export function SettingsPlanLock({ plan }: { plan: PlanCode | undefined }) {
  const t = useTranslations('settings.navigation');
  const tPlans = useTranslations('settings.subscription.plans');
  if (!plan) return null;
  const name = tPlans(`${plan}.name`);
  return (
    <span aria-label={t('requires_plan', { name })} data-settings-lock={plan}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-1 text-[0.6875rem] font-semibold text-muted-foreground">
      <LockKeyhole className="size-3" aria-hidden />{name}
    </span>
  );
}

export function SettingsNavigation() {
  const t = useTranslations('settings.navigation');
  const pathname = usePathname();
  const links = useSettingsLinks();
  return (
    <nav aria-label={t('label')} data-settings-nav className="sticky top-8 hidden w-52 flex-col gap-1 lg:flex">
      {links.map(({ href, icon: Icon, title, requiredPlan }) => (
        <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}
          className="flex min-h-11 flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-[current=page]:bg-secondary aria-[current=page]:font-semibold aria-[current=page]:text-secondary-foreground">
          <Icon className="size-4.5 shrink-0" aria-hidden />
          <span>{title}</span>
          <span className="ms-auto"><SettingsPlanLock plan={requiredPlan} /></span>
        </Link>
      ))}
    </nav>
  );
}
