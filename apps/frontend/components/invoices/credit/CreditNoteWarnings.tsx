'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import type { ComplianceIssue } from '@/lib/hooks/useDocumentDrafts';

interface CreditNoteWarningsProps {
  issues: ComplianceIssue[];
  register: UseFormRegisterReturn;
  error?: string;
}

/** Recommandations de la facture, reprises par l'avoir : à lire et accepter avant de le créer. */
export function CreditNoteWarnings({ issues, register, error }: CreditNoteWarningsProps) {
  const t = useTranslations('invoices.credit');
  const tCheck = useTranslations('invoices.editor.check');
  return <section aria-labelledby="credit-warnings-title" className="flex flex-col gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
    <h3 id="credit-warnings-title" className="text-sm font-semibold">{t('warnings_title')}</h3>
    <p className="text-xs text-muted-foreground">{t('warnings_body')}</p>
    <ul className="flex flex-col gap-2">
      {issues.map((issue) => <li key={issue.code} className="flex items-start gap-2.5">
        <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{tCheck('issue_title', { code: issue.code })}</p>
          <p className="text-xs text-muted-foreground">{tCheck('issue_hint', { code: issue.code })}</p>
        </div>
      </li>)}
    </ul>
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
      <input type="checkbox" {...register} aria-invalid={error ? true : undefined} aria-describedby={error ? 'credit-warnings-error' : undefined}
        className="size-5 shrink-0 accent-primary" />
      {t('warnings_accept')}
    </label>
    {error && <p id="credit-warnings-error" className="text-xs font-medium text-red-700 dark:text-red-400">{error}</p>}
  </section>;
}
