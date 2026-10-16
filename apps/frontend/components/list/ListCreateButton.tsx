'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { UpgradeSheet } from '@/components/subscription/UpgradeSheet';
import { buttonVariants } from '@/components/ui/button';
import { useLimitGuard } from '@/lib/hooks/usePlanUsage';
import type { UsageKey } from '@/lib/hooks/useSubscription';
import { cn } from '@/lib/utils';

interface ListCreateButtonProps {
  href: string;
  label: string;
  /** Limite de la formule : atteinte, le bouton ouvre la carte de mise à niveau. */
  usage?: UsageKey;
}

/**
 * Action de création d'une page de liste, en haut à droite de l'en-tête :
 * bouton avec libellé sur desktop, bouton icône de 44px sur mobile. Ce sont
 * des liens (navigation), stylés en bouton.
 */
export function ListCreateButton({ href, label, usage }: ListCreateButtonProps) {
  const guard = useLimitGuard(usage);
  return (
    <>
      <Link href={href} onClick={guard.onClick}
        className={cn(buttonVariants(), 'hidden h-11 rounded-full px-5 text-sm font-semibold lg:inline-flex')}>
        <Plus aria-hidden />
        {label}
      </Link>
      <Link href={href} onClick={guard.onClick} aria-label={label}
        className={cn(buttonVariants({ size: 'icon' }), 'size-11 rounded-full lg:hidden')}>
        <Plus strokeWidth={2.25} className="size-5.5" aria-hidden />
      </Link>
      <UpgradeSheet {...guard.sheet} />
    </>
  );
}
