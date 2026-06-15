'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMe } from '@/lib/hooks/useMe';

/** Redirige vers `/onboarding` les admins qui n'ont pas encore validé le wizard
 * 1er login. Les staff (non-admins) passent : le wizard est un choix d'owner.
 * Tant que `me` n'est pas chargé, on ne fait rien — sinon on aurait un flash de
 * dashboard pour les utilisateurs déjà onboardés. */
export function OnboardingGate() {
  const router = useRouter();
  const { data: me, isLoading } = useMe();

  useEffect(() => {
    if (isLoading || !me) return;
    const m = me.membership;
    if (!m || !m.is_admin) return;
    if (m.onboarding_completed_at === null) {
      router.replace('/onboarding');
    }
  }, [me, isLoading, router]);

  return null;
}
