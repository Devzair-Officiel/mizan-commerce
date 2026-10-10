import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Erreur 404</p>
      <h1 className="text-2xl font-semibold text-foreground">
        Page introuvable
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        La page que vous cherchez n&apos;existe pas ou a été déplacée.
      </p>
      <Link href="/dashboard" className={buttonVariants({ variant: 'default' })}>
        Retour au tableau de bord
      </Link>
    </div>
  );
}
