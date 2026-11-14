'use client';

import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';
import { FORM_COLUMN, FORM_COLUMNS } from '@/components/form/fieldStyles';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';
import { Button } from '@/components/ui/button';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { DraftDocuments, DraftKind } from '@/lib/hooks/useDocumentDrafts';
import type { Shop } from '@/lib/hooks/useShop';
import { EditorCustomerCard } from './EditorCustomerCard';
import { EditorExtrasCard } from './EditorExtrasCard';
import { EditorHeader } from './EditorHeader';
import { EditorLinesCard } from './EditorLinesCard';
import { EditorSummaryCard } from './EditorSummaryCard';
import { IssueCheckSheet } from './IssueCheckSheet';
import { useInvoiceEditor } from './useInvoiceEditor';

interface InvoiceEditorProps<K extends DraftKind> {
  kind: K;
  /** Brouillon à reprendre ; absent : nouveau document (créé au premier enregistrement). */
  draft?: DraftDocuments[K];
  shop: Shop;
}

/**
 * Éditeur de facture libre ou de devis (`kind`). Colonne principale : client, lignes, remise et
 * conditions ; colonne latérale (desktop) : récapitulatif et « Émettre » ou « Envoyer ». Mobile :
 * barre flottante « Total TTC + Émettre » (ou « Envoyer »).
 * Tout est enregistré automatiquement ; un conflit (brouillon modifié ailleurs) arrête la saisie.
 */
export function InvoiceEditor<K extends DraftKind>({ kind, draft, shop }: InvoiceEditorProps<K>) {
  const t = useTranslations('invoices.editor');
  const money = useFormatMoney();
  const e = useInvoiceEditor(kind, draft, shop);
  const { autosave, flow } = e;
  const currency = draft?.currency ?? shop.currency;
  const conflict = autosave.status === 'conflict';

  return <>
    <EditorHeader kind={kind} id={autosave.id} status={autosave.status} savedAt={autosave.savedAt} flush={autosave.flush} />
    <div className="flex flex-col gap-4 px-4 pt-4 pb-28 lg:pt-0 lg:pb-8">
      {conflict && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
        <p className="min-w-0 flex-1">{t('conflict')}</p>
        <Button type="button" variant="outline" className="h-10 rounded-full" onClick={() => void autosave.reload()}>
          <RefreshCw size={16} aria-hidden />{t('reload')}
        </Button>
      </div>}
      <fieldset disabled={conflict || flow.locked} className="min-w-0">
        <div className={FORM_COLUMNS}>
          <div className={FORM_COLUMN}>
            <EditorCustomerCard value={e.customer} onChange={e.setCustomer} />
            <EditorLinesCard form={e.form} currency={currency} schedule={autosave.schedule} />
            <EditorExtrasCard kind={kind} form={e.form} currency={currency} schedule={autosave.schedule} />
          </div>
          <div className={FORM_COLUMN}>
            <EditorSummaryCard kind={kind} totals={e.totals} taxRate={e.taxRate} currency={currency} operation={e.operation} days={e.days} validity={e.validity}
              recommended={e.recommended} busy={flow.locked || conflict} onIssue={() => void flow.start()} />
          </div>
        </div>
      </fieldset>
    </div>
    <FloatingActionBar>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{t('summary.total')}</p>
        <p className="text-base font-semibold tabular-nums">{money(e.totals.total / 100, currency)}</p>
      </div>
      <Button type="button" className="h-11 rounded-full px-5" disabled={flow.locked || conflict} onClick={() => void flow.start()}>{t('summary.issue', { doc: kind })}</Button>
    </FloatingActionBar>
    <IssueCheckSheet kind={kind} issues={flow.check?.issues ?? null} issuing={flow.locked} onClose={flow.close} onIssue={() => void flow.confirm()} onComplete={e.complete} />
  </>;
}
