'use client';

import { useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { LockedFeature } from '@/components/subscription/UpgradeCard';
import { UpgradeSheet } from '@/components/subscription/UpgradeSheet';
import { buttonVariants } from '@/components/ui/button';
import { usePlanGating } from '@/lib/hooks/usePlanGating';
import { useLimitGuard } from '@/lib/hooks/usePlanUsage';
import type { UsageKey } from '@/lib/hooks/useSubscription';
import { cn } from '@/lib/utils';

interface ListCreateButtonProps {
  href: string;
  label: string;
  /** Limite de la formule : atteinte, le bouton ouvre la carte de mise à niveau. */
  usage?: UsageKey;
  /** Fonction d'une formule supérieure : hors formule, le bouton ouvre la carte de mise à niveau. */
  feature?: LockedFeature;
}

/**
 * Action de création d'une page de liste, en haut à droite de l'en-tête :
 * bouton avec libellé sur desktop, bouton icône de 44px sur mobile. Ce sont
 * des liens (navigation), stylés en bouton.
 */
export function ListCreateButton({ href, label, usage, feature }: ListCreateButtonProps) {
  const guard = useLimitGuard(usage);
  const { can } = usePlanGating();
  const [locked, setLocked] = useState(false);
  const onClick = (event: MouseEvent) => {
    if (!feature || can(feature)) return guard.onClick(event);
    event.preventDefault();
    setLocked(true);
  };
  return (
    <>
      <Link href={href} onClick={onClick}
        className={cn(buttonVariants(), 'hidden h-11 rounded-full px-5 text-sm font-semibold lg:inline-flex')}>
        <Plus aria-hidden />
        {label}
      </Link>
      <Link href={href} onClick={onClick} aria-label={label}
        className={cn(buttonVariants({ size: 'icon' }), 'size-11 rounded-full lg:hidden')}>
        <Plus strokeWidth={2.25} className="size-5.5" aria-hidden />
      </Link>
      <UpgradeSheet {...guard.sheet} />
      {feature && <UpgradeSheet open={locked} onClose={() => setLocked(false)} feature={feature} title={label} />}
    </>
  );
}
