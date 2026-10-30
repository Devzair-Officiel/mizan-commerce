'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { complianceQueryOptions, DRAFT_KINDS, draftError, useFinalizeDraft, type ComplianceIssue, type DraftKind } from '@/lib/hooks/useDocumentDrafts';
import { notify } from '@/lib/notify';

interface IssueFlowSteps {
  /** Enregistre la saisie en attente ; `null` : échec déjà signalé (notification ou bandeau de conflit). */
  flush: () => Promise<string | null>;
  /** Valide tout le formulaire et mène au premier champ invalide ; `false` : rien ne part. */
  validate: () => Promise<boolean>;
}

/**
 * « Émettre » : valide la saisie, l'enregistre (crée le brouillon au besoin), relit la vérification
 * de conformité et ouvre toujours la feuille « Vérification avant émission ». L'émission accepte les
 * recommandations affichées ; un point bloquant ne laisse que « Compléter ».
 *
 * Champs verrouillés (`locked`) de la préparation à la fin de l'émission ; la confirmation valide et
 * enregistre de nouveau : une ligne invalide (que `toPayload` écarterait) ou une frappe restée en attente
 * ne peut pas être perdue par l'émission.
 */
export function useIssueFlow(kind: DraftKind, { flush, validate }: IssueFlowSteps) {
  const t = useTranslations('invoices.editor');
  const router = useRouter();
  const qc = useQueryClient();
  const { mutateAsync: finalize, isPending } = useFinalizeDraft(kind);
  const { route } = DRAFT_KINDS[kind];
  const [check, setCheck] = useState<{ id: string; issues: ComplianceIssue[] } | null>(null);
  const [preparing, setPreparing] = useState(false);

  /** Saisie valide puis enregistrée ; verrouille les champs (à déverrouiller par l'appelant). */
  const prepare = async (): Promise<string | null> => {
    if (!(await validate())) {
      notify.error(t('issue_invalid'));
      return null;
    }
    setPreparing(true);
    return flush();
  };

  const start = async () => {
    try {
      const id = await prepare();
      if (!id) return;
      const { issues } = await qc.fetchQuery(complianceQueryOptions(kind, id));
      setCheck({ id, issues });
    } catch {
      notify.error(t('issue_error'));
    } finally {
      setPreparing(false);
    }
  };

  const confirm = async () => {
    if (!check) return;
    const acknowledged = check.issues.filter((i) => i.level === 'recommended').map((i) => i.code);
    try {
      const id = await prepare();
      if (!id) { setCheck(null); return; }
      const document = await finalize({ id, acknowledged });
      setCheck(null);
      notify.success(t('issued', { number: document.number }));
      router.replace(`${route}/${document.id}`);
    } catch (err) {
      const { code, issues } = draftError(err);
      if (code === 'compliance_blocking' || code === 'compliance_warnings') setCheck({ id: check.id, issues });
      else if (code === 'not_draft') router.replace(`${route}/${check.id}`);
      else notify.error(t('issue_error'));
    } finally {
      setPreparing(false);
    }
  };

  return { check, start, confirm, close: () => setCheck(null), locked: preparing || isPending, issuing: isPending };
}
