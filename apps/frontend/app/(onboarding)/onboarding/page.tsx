'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Package, ScrollText, Sparkles, BarChart3, LayoutGrid } from 'lucide-react';
import { useCompleteOnboarding } from '@/lib/hooks/useShop';
import { useMe, type CatalogKind, type DashboardMode } from '@/lib/hooks/useMe';

type Step = 1 | 2;

interface Option<T extends string> {
  value: T;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const CATALOG_OPTIONS: Option<CatalogKind>[] = [
  {
    value: 'products',
    title: 'Je vends des produits',
    description: 'Articles physiques avec stock, variantes, prix unitaires.',
    icon: <Package size={22} />,
  },
  {
    value: 'services',
    title: 'Je propose des services',
    description: 'Prestations ou abonnements sans gestion de stock.',
    icon: <Sparkles size={22} />,
  },
  {
    value: 'both',
    title: 'Les deux',
    description: 'Produits et services dans le même catalogue.',
    icon: <ScrollText size={22} />,
  },
];

const DASHBOARD_OPTIONS: Option<DashboardMode>[] = [
  {
    value: 'minimal',
    title: 'Minimaliste',
    description: 'L\'essentiel uniquement : chiffres clés du jour et raccourcis.',
    icon: <LayoutGrid size={22} />,
  },
  {
    value: 'complete',
    title: 'Complet',
    description: 'Tous les indicateurs : ventes, stock, alertes, rappels…',
    icon: <BarChart3 size={22} />,
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const { mutateAsync, isPending } = useCompleteOnboarding();

  const [step, setStep] = useState<Step>(1);
  const [catalogKind, setCatalogKind] = useState<CatalogKind | null>(null);
  const [dashboardMode, setDashboardMode] = useState<DashboardMode | null>(null);

  const firstName = me?.full_name?.trim().split(/\s+/)[0];

  async function submit(values: { catalog_kind: CatalogKind; dashboard_mode: DashboardMode }) {
    await mutateAsync(values);
    router.replace('/dashboard');
  }

  async function handleContinue() {
    if (step === 1) {
      if (!catalogKind) return;
      setStep(2);
      return;
    }
    if (!catalogKind || !dashboardMode) return;
    await submit({ catalog_kind: catalogKind, dashboard_mode: dashboardMode });
  }

  async function handleSkip() {
    // Defaults : `both` + `complete` — choix le plus inclusif, modifiable plus tard.
    await submit({
      catalog_kind: catalogKind ?? 'both',
      dashboard_mode: dashboardMode ?? 'complete',
    });
  }

  return (
    <div className="au-card au-wizard">
      <div className="au-steps" aria-label={`Étape ${step} sur 2`}>
        <span className={`dot ${step === 1 ? 'is-current' : 'is-done'}`} />
        <span className={`dot ${step === 2 ? 'is-current' : ''}`} />
        <span className="label">Étape {step} / 2</span>
      </div>

      {step === 1 ? (
        <>
          <h1>
            Bienvenue{firstName ? `, ${firstName}` : ''}{' '}
            <span className="serif-i">!</span>
          </h1>
          <p className="au-sub">
            Que proposez-vous dans votre boutique ? Vous pourrez modifier ce
            choix plus tard depuis les réglages.
          </p>
          <div className="au-divider" />

          <div className="au-options" role="radiogroup" aria-label="Type d'activité">
            {CATALOG_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                option={opt}
                selected={catalogKind === opt.value}
                onSelect={() => setCatalogKind(opt.value)}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <h1>
            Votre tableau de bord{' '}
            <span className="serif-i">favori</span>
          </h1>
          <p className="au-sub">
            Préférez-vous une vue épurée ou tous les indicateurs ? Modifiable
            à tout moment.
          </p>
          <div className="au-divider" />

          <div className="au-options" role="radiogroup" aria-label="Style de tableau de bord">
            {DASHBOARD_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                option={opt}
                selected={dashboardMode === opt.value}
                onSelect={() => setDashboardMode(opt.value)}
              />
            ))}
          </div>
        </>
      )}

      <div className="au-wizard-actions">
        <button
          type="button"
          className="au-cta"
          disabled={
            isPending ||
            (step === 1 ? !catalogKind : !dashboardMode)
          }
          onClick={handleContinue}
        >
          {isPending
            ? 'Enregistrement…'
            : step === 1
              ? 'Continuer'
              : 'Accéder à ma boutique'}
        </button>
        <button
          type="button"
          className="au-cta-ghost"
          disabled={isPending}
          onClick={handleSkip}
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}

interface OptionCardProps<T extends string> {
  option: Option<T>;
  selected: boolean;
  onSelect: () => void;
}

function OptionCard<T extends string>({ option, selected, onSelect }: OptionCardProps<T>) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`au-option ${selected ? 'is-selected' : ''}`}
      onClick={onSelect}
    >
      <span className="au-option-icon" aria-hidden>{option.icon}</span>
      <span className="au-option-body">
        <span className="au-option-title">{option.title}</span>
        <span className="au-option-desc">{option.description}</span>
      </span>
      <span className="au-option-check" aria-hidden>
        <Check size={14} strokeWidth={3} />
      </span>
    </button>
  );
}
