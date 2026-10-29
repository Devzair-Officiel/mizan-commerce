'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { complianceQueryOptions, draftError, useIssueDraftInvoice, type ComplianceIssue } from '@/lib/hooks/useInvoiceDrafts';
import { notify } from '@/lib/notify';

/**
 * « Émettre » : enregistre la saisie en attente (crée le brouillon au besoin), relit la vérification
 * de conformité et ouvre toujours la feuille « Vérification avant émission ». L'émission accepte les
 * recommandations affichées ; un point bloquant ne laisse que « Compléter ».
 */
export function useIssueFlow(flush: () => Promise<string | null>) {
  const t = useTranslations('invoices.editor');
  const router = useRouter();
  const qc = useQueryClient();
  const { mutateAsync: issue, isPending } = useIssueDraftInvoice();
  const [check, setCheck] = useState<{ id: string; issues: ComplianceIssue[] } | null>(null);
  const [preparing, setPreparing] = useState(false);

  const start = async () => {
    setPreparing(true);
    try {
      // Échec d'enregistrement : déjà signalé (notification ou bandeau de conflit).
      const id = await flush();
      if (!id) return;
      const { issues } = await qc.fetchQuery(complianceQueryOptions(id));
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
      const invoice = await issue({ id: check.id, acknowledged });
      setCheck(null);
      notify.success(t('issued', { number: invoice.number }));
      router.replace(`/invoices/${invoice.id}`);
    } catch (err) {
      const { code, issues } = draftError(err);
      if (code === 'compliance_blocking' || code === 'compliance_warnings') setCheck({ id: check.id, issues });
      else if (code === 'not_draft') router.replace(`/invoices/${check.id}`);
      else notify.error(t('issue_error'));
    }
  };

  return { check, start, confirm, close: () => setCheck(null), busy: preparing || isPending, issuing: isPending };
}
