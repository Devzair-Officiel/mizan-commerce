'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('ui.error');
  useEffect(() => {
    // Surface dans la console pour le dev — en prod, c'est Next.js qui capture via digest.
    // Aucun détail technique n'est exposé à l'utilisateur.
    console.error('App error boundary:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <AlertTriangle className="size-10 text-destructive" aria-hidden />
      <h1 className="text-2xl font-semibold text-foreground">
        {t('title')}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {t('body')}
      </p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">{t('reference', { digest: error.digest })}</p>
      ) : null}
      <Button variant="default" onClick={reset}>
        {t('retry')}
      </Button>
    </div>
  );
}
