'use client';

/**
 * Page Settings → Abonnement.
 *
 * Tant que Stripe n'est pas branché, deux scénarios pratiques :
 * - Trial actif (Boutique+) → CTA "Résilier" qui bascule sur Gratuit.
 * - Plan Pro / Boutique+ payant → CTA "Résilier" idem (downgrade vers Free).
 *
 * Les boutons "Upgrade vers Pro / Boutique+" sont volontairement désactivés
 * (label "Bientôt disponible") — l'endpoint backend rejette toute autre
 * mutation que `plan_code: 'free'`.
 */

import { useState } from 'react';
import { Sparkles, Check, Loader2 } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { useSubscription, useDowngradeToFree, type PlanCode } from '@/lib/hooks/useSubscription';

interface PlanCardData {
  code: PlanCode;
  name: string;
  price: string;
  description: string;
  features: string[];
}

const PLANS: PlanCardData[] = [
  {
    code: 'free',
    name: 'Gratuit',
    price: '0 €',
    description: "L'essentiel pour bien commencer.",
    features: [
      'Jusqu\'à 50 produits actifs',
      '20 commandes par mois',
      'Stock, notes, rappels',
    ],
  },
  {
    code: 'pro',
    name: 'Pro',
    price: '9 € / mois',
    description: 'Pour gérer tout votre commerce.',
    features: [
      'Produits et commandes illimités',
      'Factures PDF',
      'Calcul Zakat',
      'Messages WhatsApp préparés',
    ],
  },
  {
    code: 'boutique_plus',
    name: 'Boutique+',
    price: '19 € / mois',
    description: 'Outils avancés et partenariats.',
    features: [
      'Tout Pro inclus',
      'Page publique partageable',
      'Multi-utilisateurs',
      'Exports comptables',
    ],
  },
];

function formatPeriodEnd(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function SubscriptionPage() {
  const { data: subscription, isLoading } = useSubscription();
  const downgrade = useDowngradeToFree();
  const [confirming, setConfirming] = useState(false);

  if (isLoading || !subscription) {
    return (
      <>
        <TopBar title="Abonnement" />
        <p className="p-4 text-sm text-muted-foreground">Chargement…</p>
      </>
    );
  }

  const currentCode = subscription.effective_plan_code;
  const isTrialing = subscription.status === 'trialing';
  const periodEnd = formatPeriodEnd(subscription.current_period_end);

  async function handleDowngrade() {
    await downgrade.mutateAsync();
    setConfirming(false);
  }

  return (
    <>
      <TopBar title="Abonnement" />

      <div className="px-4 pt-4 pb-32 flex flex-col gap-4">
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Votre formule
              </p>
              <p className="text-lg font-semibold text-foreground">
                {subscription.plan.name}
                {isTrialing && <span className="ml-2 text-xs font-medium text-amber-600">Essai</span>}
              </p>
              {isTrialing && subscription.days_remaining !== null && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {subscription.days_remaining > 0
                    ? `Essai en cours — ${subscription.days_remaining} jour${subscription.days_remaining > 1 ? 's' : ''} restant${subscription.days_remaining > 1 ? 's' : ''}.`
                    : "Essai se terminant aujourd'hui."}
                  {periodEnd && ` Fin : ${periodEnd}.`}
                </p>
              )}
              {!isTrialing && currentCode !== 'free' && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Plan {subscription.plan.name} actif.
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-3">
          {PLANS.map((plan) => {
            const isCurrent = plan.code === currentCode;
            const isUpgrade = plan.code !== 'free' && !isCurrent;
            return (
              <section
                key={plan.code}
                className={`rounded-2xl border bg-card p-4 ${
                  isCurrent ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-foreground">{plan.name}</p>
                    <p className="text-sm text-muted-foreground">{plan.description}</p>
                  </div>
                  <p className="text-sm font-semibold text-foreground shrink-0">{plan.price}</p>
                </div>

                <ul className="mt-3 flex flex-col gap-1.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-foreground">
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent && (
                  <p className="mt-3 text-xs font-medium text-primary">Formule actuelle</p>
                )}
                {isUpgrade && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 w-full"
                    disabled
                  >
                    Bientôt disponible
                  </Button>
                )}
              </section>
            );
          })}
        </div>

        {currentCode !== 'free' && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">Résilier</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Vous passerez immédiatement sur la formule Gratuite. Vous perdrez l&apos;accès
              aux fonctionnalités payantes mais vos données restent intactes.
            </p>

            {!confirming ? (
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => setConfirming(true)}
              >
                Résilier ma formule
              </Button>
            ) : (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDowngrade}
                  disabled={downgrade.isPending}
                >
                  {downgrade.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Résiliation…</>
                  ) : (
                    'Confirmer la résiliation'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirming(false)}
                  disabled={downgrade.isPending}
                >
                  Annuler
                </Button>
              </div>
            )}
            {downgrade.isError && (
              <p className="mt-2 text-sm text-destructive">
                Impossible de résilier pour le moment. Réessayez plus tard.
              </p>
            )}
          </section>
        )}
      </div>
    </>
  );
}
