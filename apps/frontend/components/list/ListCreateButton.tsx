import Link from 'next/link';
import { Plus } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ListCreateButtonProps {
  href: string;
  label: string;
}

/**
 * Action de création d'une page de liste, en haut à droite de l'en-tête :
 * bouton avec libellé sur desktop, bouton icône de 44px sur mobile. Ce sont
 * des liens (navigation), stylés en bouton.
 */
export function ListCreateButton({ href, label }: ListCreateButtonProps) {
  return (
    <>
      <Link href={href} className={cn(buttonVariants(), 'hidden h-11 rounded-full px-5 text-sm font-semibold lg:inline-flex')}>
        <Plus aria-hidden />
        {label}
      </Link>
      <Link href={href} aria-label={label}
        className={cn(buttonVariants({ size: 'icon' }), 'size-11 rounded-full lg:hidden')}>
        <Plus strokeWidth={2.25} className="size-5.5" aria-hidden />
      </Link>
    </>
  );
}
