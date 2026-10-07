'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Package, ScrollText, Sparkles, Home, Truck, Shuffle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCompleteOnboarding } from '@/lib/hooks/useShop';
import { useMe, type CatalogKind, type FulfillmentMode } from '@/lib/hooks/useMe';

type Step = 1 | 2;

interface Option<T extends string> {
  value: T;
  title: string;
  description: string;
  icon: React.ReactNode;
}

function OptionCard<T extends string>({
  option, selected, onSelect,
}: { option: Option<T>; selected: boolean; onSelect: () => void }) {
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

export default function OnboardingPage() {
  const router = useRouter();
  const t = useTranslations('onboarding');
  const { data: me } = useMe();
  const { mutateAsync, isPending } = useCompleteOnboarding();

  const [step, setStep] = useState<Step>(1);
  const [catalogKind, setCatalogKind] = useState<CatalogKind | null>(null);
  const [fulfillmentMode, setFulfillmentMode] = useState<FulfillmentMode>(null);

  const firstName = me?.full_name?.trim().split(/\s+/)[0];

  const CATALOG_OPTIONS: Option<CatalogKind>[] = [
    { value: 'products', title: 'Je vends des produits', description: 'Articles physiques avec stock, variantes, prix unitaires.', icon: <Package size={22} /> },
    { value: 'services', title: 'Je propose des services', description: 'Prestations ou abonnements sans gestion de stock.', icon: <Sparkles size={22} /> },
    { value: 'both', title: 'Les deux', description: 'Produits et services dans le même catalogue.', icon: <ScrollText size={22} /> },
  ];

  const FULFILLMENT_OPTIONS: Option<string>[] = [
    { value: 'on_site', title: t('step2_on_site_title'), description: t('step2_on_site_desc'), icon: <Home size={22} /> },
    { value: 'delivery', title: t('step2_delivery_title'), description: t('step2_delivery_desc'), icon: <Truck size={22} /> },
    { value: 'both', title: t('step2_both_title'), description: t('step2_both_desc'), icon: <Shuffle size={22} /> },
  ];

  async function submit(values: { catalog_kind: CatalogKind; fulfillment_mode: FulfillmentMode }) {
    await mutateAsync(values);
    router.replace('/dashboard');
  }

  async function handleContinue() {
    if (step === 1) {
      if (!catalogKind) return;
      if (catalogKind === 'services') {
        await submit({ catalog_kind: catalogKind, fulfillment_mode: null });
        return;
      }
      setStep(2);
      return;
    }
    if (!catalogKind) return;
    await submit({ catalog_kind: catalogKind, fulfillment_mode: fulfillmentMode });
  }

  async function handleSkip() {
    await submit({ catalog_kind: catalogKind ?? 'both', fulfillment_mode: null });
  }

  const isLastStep = step === 1 && catalogKind === 'services';
  const totalSteps = catalogKind === 'services' ? 1 : 2;

  return (
    <div className="au-card au-wizard">
      <div className="au-steps" aria-label={`Étape ${step} sur ${totalSteps}`}>
        <span className={`dot ${step === 1 ? 'is-current' : 'is-done'}`} />
        {catalogKind !== 'services' && (
          <span className={`dot ${step === 2 ? 'is-current' : ''}`} />
        )}
        <span className="label">Étape {step} / {totalSteps}</span>
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
              <OptionCard key={opt.value} option={opt} selected={catalogKind === opt.value} onSelect={() => setCatalogKind(opt.value)} />
            ))}
          </div>
        </>
      ) : (
        <>
          <h1>
            {t('step2_title')}
          </h1>
          <p className="au-sub">{t('step2_sub')}</p>
          <div className="au-divider" />
          <div className="au-options" role="radiogroup" aria-label={t('step2_label')}>
            {FULFILLMENT_OPTIONS.map((opt) => (
              <OptionCard key={opt.value} option={opt} selected={fulfillmentMode === opt.value} onSelect={() => setFulfillmentMode(opt.value as FulfillmentMode)} />
            ))}
          </div>
        </>
      )}

      <div className="au-wizard-actions">
        <button
          type="button"
          className="au-cta"
          disabled={isPending || (step === 1 ? !catalogKind : !fulfillmentMode)}
          onClick={handleContinue}
        >
          {isPending
            ? 'Enregistrement…'
            : (isLastStep || step === 2) ? 'Accéder à ma boutique' : 'Continuer'}
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
