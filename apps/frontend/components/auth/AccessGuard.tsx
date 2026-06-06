'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';
import { useMe, type ModuleKey } from '@/lib/hooks/useMe';

type AccessGuardProps =
  | { module: ModuleKey; adminOnly?: never; children: ReactNode }
  | { adminOnly: true; module?: never; children: ReactNode };

export function AccessGuard(props: AccessGuardProps) {
  const { data, isLoading } = useMe();
  const m = data?.membership ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]" aria-busy>
        <div className="h-8 w-8 rounded-full border-2 border-muted border-t-primary animate-spin" />
      </div>
    );
  }

  const allowed = (() => {
    if (!m) return false;
    if ('adminOnly' in props && props.adminOnly) return m.is_admin;
    if (m.is_admin) return true;
    return m.permissions.includes(props.module);
  })();

  if (!allowed) return <Forbidden />;
  return <>{props.children}</>;
}

function Forbidden() {
  const t = useTranslations('layout.guard');
  return (
    <div className="flex flex-col items-center justify-center gap-4 min-h-[60vh] px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">{t('forbidden_title')}</h1>
        <p className="text-sm text-muted-foreground max-w-sm">{t('forbidden_body')}</p>
      </div>
      <Link
        href="/dashboard"
        className="inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
      >
        {t('back_home')}
      </Link>
    </div>
  );
}
