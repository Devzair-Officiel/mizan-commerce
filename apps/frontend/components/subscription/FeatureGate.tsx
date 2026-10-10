'use client';

import type { ReactNode } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { UpgradeCard, type UpgradeFeature } from '@/components/subscription/UpgradeCard';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { hasFeature } from '@/lib/hooks/usePlanGating';

/**
 * Page réservée à une formule : sans elle, la carte de mise à niveau remplace le contenu.
 * Le contenu n'est monté qu'une fois la formule connue, pour ne pas lancer de requêtes
 * que le serveur refuserait. Si la formule ne peut pas être lue, le serveur reste juge.
 */
export function FeatureGate({ feature, title, back, children }: {
  feature: UpgradeFeature; title: string; back?: boolean; children: ReactNode;
}) {
  const { data: subscription, isLoading } = useSubscription();

  if (isLoading) return <TopBar title={title} back={back} />;
  if (subscription && !hasFeature(subscription.effective_plan_code, feature)) {
    return (
      <>
        <TopBar title={title} back={back} />
        <div className="px-4 pt-4 pb-32 lg:pb-4">
          <UpgradeCard feature={feature} />
        </div>
      </>
    );
  }
  return <>{children}</>;
}
