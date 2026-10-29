'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, CircleAlert } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import type { ComplianceIssue } from '@/lib/hooks/useInvoiceDrafts';

interface IssueCheckSheetProps {
  issues: ComplianceIssue[] | null;
  issuing: boolean;
  onClose: () => void;
  onIssue: () => void;
  /** Mène là où se complète le point (lignes, client, paramètres de facture). */
  onComplete: (issue: ComplianceIssue) => void;
}

/**
 * Vérification avant émission. Sans point : confirmer. Recommandations seules : « Émettre quand
 * même » ou compléter. Un point bloquant : compléter seulement. Le texte n'affirme jamais une
 * conformité légale.
 */
export function IssueCheckSheet({ issues, issuing, onClose, onIssue, onComplete }: IssueCheckSheetProps) {
  const t = useTranslations('invoices.editor.check');
  const list = issues ?? [];
  const blocking = list.some((i) => i.level === 'blocking');
  const [first] = list;
  const intro = blocking ? 'intro_blocking' : list.length ? 'intro_recommended' : 'intro_ready';
  const footer = <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
    {!first && <Button type="button" variant="outline" className="h-11 rounded-full" onClick={onClose}>{t('cancel')}</Button>}
    {first && !blocking && <Button type="button" variant="outline" className="h-11 rounded-full" disabled={issuing} onClick={onIssue}>{t('issue_anyway')}</Button>}
    {first
      ? <Button type="button" className="h-11 rounded-full" onClick={() => onComplete(first)}>{t('complete')}</Button>
      : <Button type="button" className="h-11 rounded-full" disabled={issuing} onClick={onIssue}>{t('issue')}</Button>}
  </div>;
  return <BottomSheet open={issues !== null} onClose={onClose} title={t('title')} description={t(intro)} footer={footer}>
    {first && <ul className="flex flex-col divide-y divide-border">
      {list.map((issue) => <li key={issue.code} className="flex items-center gap-3 py-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-full ${issue.level === 'blocking' ? 'bg-red-500/10 text-red-700 dark:text-red-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'}`}>
          {issue.level === 'blocking' ? <CircleAlert size={18} aria-hidden /> : <AlertTriangle size={18} aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p id={`issue-check-${issue.code}`} className="text-sm font-semibold">{t('issue_title', { code: issue.code })}</p>
          <p className="text-xs text-muted-foreground">{t('issue_hint', { code: issue.code })}</p>
        </div>
        <button type="button" onClick={() => onComplete(issue)} aria-describedby={`issue-check-${issue.code}`} className="min-h-11 shrink-0 px-1 text-[0.8125rem] font-semibold text-primary whitespace-nowrap">
          {t('complete')}
        </button>
      </li>)}
    </ul>}
  </BottomSheet>;
}
