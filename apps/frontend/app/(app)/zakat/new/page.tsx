'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { WizardLayout, TOTAL_STEPS } from '@/components/zakat/WizardLayout';
import { WizardHub } from '@/components/zakat/WizardHub';
import { Step0Liquidity } from '@/components/zakat/Step0Liquidity';
import { Step1Receivables } from '@/components/zakat/Step1Receivables';
import { Step2Stock } from '@/components/zakat/Step2Stock';
import { Step3Excluded } from '@/components/zakat/Step3Excluded';
import { Step4Debts } from '@/components/zakat/Step4Debts';
import { Step5Summary } from '@/components/zakat/Step5Summary';
import {
  useZakatStockEstimate,
  useZakatCurrentDraft,
  useCreateZakatDraft,
  useUpdateZakatDraft,
  useFinalizeZakat,
  useDeleteZakatCalculation,
  type DebtItem,
  type ExcludedItem,
  type ReceivableBreakdownItem,
  type StockBreakdownItem,
  type ZakatCalculation,
} from '@/lib/hooks/useZakat';
import { ApiError } from '@/lib/api-client';

interface WizardState {
  referenceDate: string;
  cashAmount: string;
  hasReceivables: boolean;
  receivablesNominal: string;
  receivablesBreakdown: ReceivableBreakdownItem[];
  stockBreakdown: StockBreakdownItem[];
  excludedItemsAcknowledged: ExcludedItem[];
  debtsBreakdown: DebtItem[];
}

const today = () => new Date().toISOString().split('T')[0];

const INITIAL: WizardState = {
  referenceDate: today(),
  cashAmount: '',
  hasReceivables: false,
  receivablesNominal: '',
  receivablesBreakdown: [],
  stockBreakdown: [],
  excludedItemsAcknowledged: [],
  debtsBreakdown: [],
};

const STEP_TITLES: Array<{ title: string; subtitle?: string }> = [
  { title: 'Argent disponible', subtitle: 'Caisse, compte pro, espèces du commerce.' },
  { title: 'Créances clients', subtitle: 'Ce qu\'on vous doit — et que vous pensez récupérer.' },
  { title: 'Stock commercial', subtitle: 'Marchandises destinées à la revente.' },
  { title: 'Ce qui n\'entre pas', subtitle: 'Vos outils de travail restent hors zakat.' },
  { title: 'Dettes', subtitle: 'Seules les dettes exigibles immédiatement comptent.' },
  { title: 'Récapitulatif', subtitle: 'Dernière vérification avant validation.' },
];

/** Hydrate l'état local depuis un brouillon serveur — chaînes vides plutôt que "0" pour ne pas
 *  préremplir le commerçant avec des valeurs qu'il n'a pas saisies. */
function hydrateFromDraft(draft: ZakatCalculation): WizardState {
  const blank = (v: string) => (parseFloat(v || '0') === 0 ? '' : v);
  return {
    referenceDate: draft.reference_date,
    cashAmount: blank(draft.cash_amount),
    hasReceivables: draft.has_receivables,
    receivablesNominal: blank(draft.receivables_nominal),
    receivablesBreakdown: draft.receivables_breakdown ?? [],
    stockBreakdown: draft.stock_breakdown ?? [],
    excludedItemsAcknowledged: draft.excluded_items_acknowledged,
    debtsBreakdown: draft.debts_breakdown,
  };
}

export default function NewZakatWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(INITIAL);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [calc, setCalc] = useState<ZakatCalculation | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // Mode hub : on liste les 6 étapes avec leurs valeurs et on édite à la carte.
  // Activé quand on rouvre un calcul finalisé (toutes les étapes ont déjà des valeurs).
  // En mode hub, sauvegarder une étape ramène au hub (au lieu d'enchaîner la suivante).
  const [mode, setMode] = useState<'linear' | 'hub'>('linear');
  const [editingFromHub, setEditingFromHub] = useState(false);

  const { data: draft, isLoading: draftLoading } = useZakatCurrentDraft();
  const { data: estimate, isLoading: estimateLoading } = useZakatStockEstimate();
  const currency = calc?.currency ?? estimate?.currency ?? 'EUR';

  const createDraft = useCreateZakatDraft();
  const updateDraft = useUpdateZakatDraft(draftId ?? '');
  const finalize = useFinalizeZakat();
  const deleteDraft = useDeleteZakatCalculation();

  // Reprise du brouillon : tourne une seule fois quand la requête se résout.
  useEffect(() => {
    if (hydrated || draftLoading) return;
    if (draft) {
      setDraftId(draft.id);
      setState(hydrateFromDraft(draft));
      setCalc(draft);
      // current_step est l'index où l'utilisateur s'est arrêté — on l'y remet.
      const resumeAt = Math.min(Math.max(draft.current_step, 0), TOTAL_STEPS - 1);
      setStep(resumeAt);
      // Si l'utilisateur a déjà parcouru toutes les étapes (récap atteint), on bascule
      // automatiquement en mode hub — il vient probablement modifier un point précis.
      if (draft.current_step >= TOTAL_STEPS - 1) {
        setMode('hub');
      }
    }
    setHydrated(true);
  }, [draft, draftLoading, hydrated]);

  const patch = (p: Partial<WizardState>) => setState((s) => ({ ...s, ...p }));

  const buildPayload = (currentStep: number) => {
    // Si l'utilisateur n'a pas activé "Oui" pour créances, on remet la ventilation à plat
    // côté serveur — évite qu'un changement d'avis laisse des miettes dans le breakdown.
    const receivablesBreakdown = state.hasReceivables ? state.receivablesBreakdown : [];
    return {
      current_step: currentStep,
      reference_date: state.referenceDate,
      cash_amount: state.cashAmount || '0',
      has_receivables: state.hasReceivables,
      receivables_nominal: state.hasReceivables ? state.receivablesNominal || '0' : '0',
      receivables_breakdown: receivablesBreakdown,
      stock_breakdown: state.stockBreakdown,
      excluded_items_acknowledged: state.excludedItemsAcknowledged,
      debts_breakdown: state.debtsBreakdown,
    };
  };

  const persistAndNext = async () => {
    const nextStep = step + 1;
    const payload = buildPayload(nextStep);
    let updated: ZakatCalculation;
    if (!draftId) {
      updated = await createDraft.mutateAsync(payload);
      setDraftId(updated.id);
    } else {
      updated = await updateDraft.mutateAsync(payload);
    }
    setCalc(updated);
    setStep(nextStep);
  };

  // Mode hub : on enregistre l'étape sans incrémenter `current_step`, puis on revient au hub.
  const persistAndReturnToHub = async () => {
    if (!draftId) return;
    const updated = await updateDraft.mutateAsync(buildPayload(TOTAL_STEPS - 1));
    setCalc(updated);
    setEditingFromHub(false);
  };

  const handleFinalize = async () => {
    if (!draftId) return;
    // S'assurer que les dernières infos de l'étape récap soient enregistrées avant finalisation.
    await updateDraft.mutateAsync(buildPayload(TOTAL_STEPS - 1));
    try {
      const finalized = await finalize.mutateAsync(draftId);
      router.push(`/zakat/${finalized.id}`);
    } catch (err) {
      // Conflit d'unicité annuelle : un calcul finalisé existe déjà pour cette année.
      // On redirige vers ce calcul existant après avoir prévenu le commerçant.
      if (err instanceof ApiError && err.status === 409) {
        const data = err.data as { detail?: string; existing_id?: string; year?: number };
        window.alert(
          data.detail ??
            `Un calcul finalisé existe déjà pour ${data.year}. Vous allez être redirigé vers ce calcul.`,
        );
        if (data.existing_id) {
          router.push(`/zakat/${data.existing_id}`);
          return;
        }
        router.push('/zakat');
        return;
      }
      throw err;
    }
  };

  const handleDiscard = async () => {
    if (!draftId) {
      router.push('/zakat');
      return;
    }
    if (!window.confirm('Supprimer ce brouillon ? Toutes les saisies seront perdues.')) return;
    await deleteDraft.mutateAsync(draftId);
    router.push('/zakat');
  };

  const canGoNext = useMemo(() => {
    if (step === 0) return Boolean(state.referenceDate) && parseFloat(state.cashAmount || '0') >= 0;
    if (step === 1) {
      if (!state.hasReceivables) return true;
      // Au moins une ligne saisie (certaine, probable ou douteuse) ou alors un nominal renseigné
      const hasBreakdown = state.receivablesBreakdown.some((b) => parseFloat(b.amount || '0') > 0);
      return hasBreakdown || parseFloat(state.receivablesNominal || '0') >= 0;
    }
    return true;
  }, [step, state]);

  const isPending =
    createDraft.isPending || updateDraft.isPending || finalize.isPending || deleteDraft.isPending;

  // Tant que la requête initiale tourne, on évite le flash d'écran vierge.
  if (!hydrated) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  // Vue hub : 6 cartes éditables + récap intégré. On y entre quand le brouillon a déjà
  // atteint la dernière étape (rouverture d'un finalisé) et qu'aucune édition n'est en cours.
  if (mode === 'hub' && !editingFromHub && calc) {
    return (
      <WizardHub
        calc={calc}
        state={state}
        currency={currency}
        onEditStep={(s) => {
          setStep(s);
          setEditingFromHub(true);
        }}
        onFinalize={handleFinalize}
        onDiscard={handleDiscard}
        isPending={isPending}
      />
    );
  }

  const { title, subtitle } = STEP_TITLES[step];
  // En édition depuis le hub, on n'enchaîne pas l'étape suivante : "Enregistrer" puis retour.
  const isHubEdit = mode === 'hub' && editingFromHub;
  const nextLabel = isHubEdit
    ? 'Enregistrer'
    : step === TOTAL_STEPS - 1
      ? 'Finaliser la zakat'
      : 'Suivant';
  const onNext = isHubEdit
    ? persistAndReturnToHub
    : step === TOTAL_STEPS - 1
      ? handleFinalize
      : persistAndNext;
  const onPrev = isHubEdit
    ? () => setEditingFromHub(false)
    : step > 0
      ? () => setStep(step - 1)
      : undefined;

  return (
    <WizardLayout
      step={step}
      title={title}
      subtitle={subtitle}
      nextLabel={nextLabel}
      onNext={onNext}
      onPrev={onPrev}
      canGoNext={canGoNext}
      isPending={isPending}
    >
      {step === 0 && (
        <Step0Liquidity
          referenceDate={state.referenceDate}
          cashAmount={state.cashAmount}
          currency={currency}
          onChange={patch}
        />
      )}
      {step === 1 && (
        <Step1Receivables
          hasReceivables={state.hasReceivables}
          receivablesNominal={state.receivablesNominal}
          receivablesBreakdown={state.receivablesBreakdown}
          currency={currency}
          onChange={patch}
        />
      )}
      {step === 2 && (
        <Step2Stock
          estimatedStock={calc?.stock_value_estimated ?? estimate?.stock_value_estimated ?? '0'}
          productCount={estimate?.product_count ?? 0}
          stockBreakdown={state.stockBreakdown}
          currency={currency}
          isLoadingEstimate={estimateLoading}
          onChange={patch}
        />
      )}
      {step === 3 && (
        <Step3Excluded
          acknowledged={state.excludedItemsAcknowledged}
          onChange={patch}
        />
      )}
      {step === 4 && (
        <Step4Debts
          debts={state.debtsBreakdown}
          currency={currency}
          onChange={patch}
        />
      )}
      {step === 5 && calc && <Step5Summary calc={calc} />}
      {step === 5 && !calc && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Préparation du récapitulatif…
        </p>
      )}

      {/* Abandon de brouillon — discret, accessible à toute étape, irréversible (confirm) */}
      {draftId && (
        <button
          type="button"
          onClick={handleDiscard}
          disabled={isPending}
          className="self-center mt-2 text-xs text-muted-foreground hover:text-destructive underline disabled:opacity-50"
        >
          Abandonner ce brouillon
        </button>
      )}
    </WizardLayout>
  );
}
