'use client';

import { useState, useMemo, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { WizardLayout, TOTAL_STEPS } from '@/components/zakat/WizardLayout';
import { WizardHub } from '@/components/zakat/WizardHub';
import { WizardSteps } from '@/components/zakat/wizard/WizardSteps';
import {
  INITIAL_STATE,
  STEP_TITLES,
  hydrateFromDraft,
  type WizardState,
} from '@/components/zakat/wizard/types';
import {
  useZakatStockEstimate,
  useZakatCurrentDraft,
  useCreateZakatDraft,
  useUpdateZakatDraft,
  useFinalizeZakat,
  useDeleteZakatCalculation,
  type ZakatCalculation,
} from '@/lib/hooks/useZakat';
import { ApiError } from '@/lib/api-client';
import { ConfirmDialog } from '@/components/ui/dialog';

export default function NewZakatWizardPage() {
  const { data: draft, isLoading: draftLoading } = useZakatCurrentDraft();

  if (draftLoading) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-4">
        <div className="flex flex-col gap-3 w-full max-w-sm">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <div className="h-4 bg-muted animate-pulse rounded-md mb-2" />
              <div className="h-3 bg-muted animate-pulse rounded-md w-1/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <WizardController initialDraft={draft ?? null} />;
}

function WizardController({ initialDraft }: { initialDraft: ZakatCalculation | null }) {
  const router = useRouter();
  const startInHub = !!initialDraft && initialDraft.current_step >= TOTAL_STEPS - 1;
  const startStep = initialDraft
    ? Math.min(Math.max(initialDraft.current_step, 0), TOTAL_STEPS - 1)
    : 0;

  const [step, setStep] = useState(startStep);
  const [state, setState] = useState<WizardState>(
    initialDraft ? hydrateFromDraft(initialDraft) : INITIAL_STATE,
  );
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.id ?? null);
  const [calc, setCalc] = useState<ZakatCalculation | null>(initialDraft);
  const [mode] = useState<'linear' | 'hub'>(startInHub ? 'hub' : 'linear');
  const [editingFromHub, setEditingFromHub] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const { data: estimate, isLoading: estimateLoading } = useZakatStockEstimate();
  const currency = calc?.currency ?? estimate?.currency ?? 'EUR';

  const createDraft = useCreateZakatDraft();
  const updateDraft = useUpdateZakatDraft(draftId ?? '');
  const finalize = useFinalizeZakat();
  const deleteDraft = useDeleteZakatCalculation();

  const patch = (p: Partial<WizardState>) => setState((s) => ({ ...s, ...p }));

  const buildPayload = (currentStep: number) => {
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

  const persistAndReturnToHub = async () => {
    if (!draftId) return;
    const updated = await updateDraft.mutateAsync(buildPayload(TOTAL_STEPS - 1));
    setCalc(updated);
    setEditingFromHub(false);
  };

  const handleFinalize = async () => {
    if (!draftId) return;
    await updateDraft.mutateAsync(buildPayload(TOTAL_STEPS - 1));
    try {
      const finalized = await finalize.mutateAsync(draftId);
      router.push(`/zakat/${finalized.id}`);
    } catch (err) {
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

  function triggerDiscard() {
    if (!draftId) {
      router.push('/zakat');
      return;
    }
    setConfirmDiscard(true);
  }

  const handleDiscard = async () => {
    if (!draftId) return;
    await deleteDraft.mutateAsync(draftId);
    router.push('/zakat');
  };

  const canGoNext = useMemo(() => {
    if (step === 0) return Boolean(state.referenceDate) && parseFloat(state.cashAmount || '0') >= 0;
    if (step === 1) {
      if (!state.hasReceivables) return true;
      const hasBreakdown = state.receivablesBreakdown.some((b) => parseFloat(b.amount || '0') > 0);
      return hasBreakdown || parseFloat(state.receivablesNominal || '0') >= 0;
    }
    return true;
  }, [step, state]);

  const isPending =
    createDraft.isPending || updateDraft.isPending || finalize.isPending || deleteDraft.isPending;

  const { title, subtitle } = STEP_TITLES[step] ?? { title: '', subtitle: undefined };
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
    <Fragment>
      {mode === 'hub' && !editingFromHub && calc ? (
        <WizardHub
          calc={calc}
          state={state}
          currency={currency}
          onEditStep={(s) => {
            setStep(s);
            setEditingFromHub(true);
          }}
          onFinalize={handleFinalize}
          onDiscard={triggerDiscard}
          isPending={isPending}
        />
      ) : (
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
          <WizardSteps
            step={step}
            state={state}
            patch={patch}
            calc={calc}
            estimate={estimate}
            estimateLoading={estimateLoading}
            currency={currency}
          />

          {draftId && (
            <button
              type="button"
              onClick={triggerDiscard}
              disabled={isPending}
              className="self-center mt-2 text-xs text-muted-foreground hover:text-destructive underline disabled:opacity-50 px-3 py-2 -mx-3"
            >
              Abandonner ce brouillon
            </button>
          )}
        </WizardLayout>
      )}

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Supprimer ce brouillon ?"
        description="Toutes les saisies seront perdues."
        onConfirm={handleDiscard}
        variant="destructive"
        confirmLabel="Supprimer"
      />
    </Fragment>
  );
}
