'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Receipt } from 'lucide-react';
import { FormSection } from '@/components/form/FormSection';
import { Button } from '@/components/ui/button';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { DraftKind } from '@/lib/hooks/useDocumentDrafts';
import type { OperationCategory } from '@/lib/hooks/useInvoices';
import { paymentTerms, type estimateTotals } from './editorSchema';

interface EditorSummaryCardProps {
  kind: DraftKind;
  totals: ReturnType<typeof estimateTotals>;
  taxRate: string;
  currency: string;
  operation: OperationCategory;
  /** Délai de paiement saisi (jours), vide : aucune échéance. */
  days: string;
  /** Validité saisie (jours), affichée pour un devis. */
  validity: string;
  /** Recommandations de la vérification pour le brouillon enregistré. */
  recommended: number;
  busy: boolean;
  onIssue: () => void;
}

function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return <div className={`flex items-baseline justify-between gap-3 ${strong ? 'border-t border-border pt-2.5 text-base font-semibold' : 'text-sm'}`}>
    <dt className={strong ? undefined : 'text-muted-foreground'}>{label}</dt>
    <dd className="text-end tabular-nums">{children}</dd>
  </div>;
}

/**
 * Récapitulatif (desktop, colonne latérale) : totaux estimés (le serveur fait foi), nature de
 * l'opération, validité (devis), échéance, recommandations restantes et bouton « Émettre la facture »
 * ou « Envoyer le devis ».
 */
export function EditorSummaryCard({ kind, totals, taxRate, currency, operation, days, validity, recommended, busy, onIssue }: EditorSummaryCardProps) {
  const t = useTranslations('invoices.editor.summary');
  const tt = useTranslations('invoices.totals');
  const te = useTranslations('invoices.editor.extras');
  const money = useFormatMoney();
  const m = (c: number) => money(c / 100, currency);
  const vat = Number(taxRate) > 0;
  return <div className="max-lg:hidden lg:sticky lg:top-20"><FormSection icon={Receipt} order="" title={t('title')}>
    <dl className="flex flex-col gap-2.5">
      <Row label={tt('subtotal')}>{m(totals.subtotal)}</Row>
      {totals.discount > 0 && <Row label={tt('discount')}>− {m(totals.discount)}</Row>}
      {totals.shipping > 0 && <Row label={tt('shipping')}>{m(totals.shipping)}</Row>}
      <Row label={vat ? tt('tax_rate', { rate: Number(taxRate) }) : tt('tax')}>{vat ? m(totals.tax) : tt('not_applicable')}</Row>
      <Row label={tt('total')} strong>{m(totals.total)}</Row>
      <Row label={te('operation')}>{te('operation_option', { value: operation })}</Row>
      {kind === 'quote' && <Row label={t('validity')}>{t('validity_value', { days: Number(validity) })}</Row>}
      <Row label={t('terms')}>{t('terms_value', paymentTerms(days))}</Row>
    </dl>
    {recommended > 0 && <p className="flex items-center gap-2 text-[0.8125rem] text-amber-700 dark:text-amber-400">
      <AlertTriangle size={16} className="shrink-0" aria-hidden />{t('recommended', { doc: kind, count: recommended })}
    </p>}
    <Button type="button" className="h-11 w-full rounded-full" disabled={busy} onClick={onIssue}>{t('issue', { doc: kind })}</Button>
    <p className="text-xs text-muted-foreground">{t('estimate', { doc: kind })}</p>
  </FormSection></div>;
}
