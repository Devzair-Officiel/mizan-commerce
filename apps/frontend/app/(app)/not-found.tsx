import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Erreur 404</p>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Page introuvable
      </h1>
      <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
        La page que vous cherchez n&apos;existe pas ou a été déplacée.
      </p>
      <Link href="/dashboard" className={buttonVariants({ variant: 'default' })}>
        Retour au tableau de bord
      </Link>
    </div>
  );
}
