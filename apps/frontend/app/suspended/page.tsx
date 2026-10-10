'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAccessStatus } from '@/lib/hooks/useAccessStatus';

/**
 * Seul écran d'un employé ou d'un admin dont la boutique n'a plus Boutique+ (code
 * `staff_suspended_plan`). L'accès revient seul dès que la boutique reprend la formule.
 */
export default function SuspendedPage() {
  const t = useTranslations('suspended');
  const router = useRouter();
  const status = useAccessStatus();

  useEffect(() => {
    if (status === 'restored') router.replace('/dashboard');
    if (status === 'signed_out') router.replace('/login');
  }, [status, router]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <main className="min-h-dvh flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 flex flex-col items-center text-center gap-3">
        <div className="w-12 h-12 rounded-full bg-secondary text-primary flex items-center justify-center">
          <Lock size={20} aria-hidden />
        </div>
        <h1 className="text-lg font-semibold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('text')}</p>
        <Button type="button" variant="outline" onClick={handleLogout} className="mt-2 h-11 w-full">
          {t('logout')}
        </Button>
      </div>
    </main>
  );
}
