'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface dans la console pour le dev — en prod, c'est Next.js qui capture via digest.
    // Aucun détail technique n'est exposé à l'utilisateur.
    console.error('App error boundary:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <AlertTriangle className="size-10 text-destructive" aria-hidden />
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Une erreur est survenue
      </h1>
      <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
        Nous n&apos;avons pas pu charger cette page. Réessayez dans un instant — si
        l&apos;erreur persiste, contactez le support.
      </p>
      {error.digest ? (
        <p className="text-xs text-zinc-400">Référence : {error.digest}</p>
      ) : null}
      <Button variant="default" onClick={reset}>
        Réessayer
      </Button>
    </div>
  );
}
