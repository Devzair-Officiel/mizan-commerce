'use client';

import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';
import { FORM_COLUMN, FORM_COLUMNS } from '@/components/form/fieldStyles';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';
import { Button } from '@/components/ui/button';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { Invoice } from '@/lib/hooks/useInvoices';
import type { Shop } from '@/lib/hooks/useShop';
import { EditorCustomerCard } from './EditorCustomerCard';
import { EditorExtrasCard } from './EditorExtrasCard';
import { EditorHeader } from './EditorHeader';
import { EditorLinesCard } from './EditorLinesCard';
import { EditorSummaryCard } from './EditorSummaryCard';
import { IssueCheckSheet } from './IssueCheckSheet';
import { useInvoiceEditor } from './useInvoiceEditor';

interface InvoiceEditorProps {
  /** Brouillon à reprendre ; absent : nouvelle facture (créée au premier enregistrement). */
  invoice?: Invoice;
  shop: Shop;
}

/**
 * Éditeur de facture libre. Colonne principale : client, lignes, remise et conditions ; colonne
 * latérale (desktop) : récapitulatif et « Émettre ». Mobile : barre flottante « Total TTC + Émettre ».
 * Tout est enregistré automatiquement ; un conflit (brouillon modifié ailleurs) arrête la saisie.
 */
export function InvoiceEditor({ invoice, shop }: InvoiceEditorProps) {
  const t = useTranslations('invoices.editor');
  const money = useFormatMoney();
  const e = useInvoiceEditor(invoice, shop);
  const { autosave, flow } = e;
  const currency = invoice?.currency ?? shop.currency;
  const conflict = autosave.status === 'conflict';

  return <>
    <EditorHeader id={autosave.id} status={autosave.status} savedAt={autosave.savedAt} flush={autosave.flush} />
    <div className="flex flex-col gap-4 px-4 pt-4 pb-28 lg:pt-0 lg:pb-8">
      {conflict && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
        <p className="min-w-0 flex-1">{t('conflict')}</p>
        <Button type="button" variant="outline" className="h-10 rounded-full" onClick={() => void autosave.reload()}>
          <RefreshCw size={16} aria-hidden />{t('reload')}
        </Button>
      </div>}
      <fieldset disabled={conflict} className="min-w-0">
        <div className={FORM_COLUMNS}>
          <div className={FORM_COLUMN}>
            <EditorCustomerCard value={e.customer} onChange={e.setCustomer} />
            <EditorLinesCard form={e.form} currency={currency} schedule={autosave.schedule} />
            <EditorExtrasCard form={e.form} currency={currency} schedule={autosave.schedule} />
          </div>
          <div className={FORM_COLUMN}>
            <EditorSummaryCard totals={e.totals} taxRate={e.taxRate} currency={currency} operation={e.operation} days={e.days}
              recommended={e.recommended} busy={flow.busy || conflict} onIssue={() => void flow.start()} />
          </div>
        </div>
      </fieldset>
    </div>
    <FloatingActionBar>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{t('summary.total')}</p>
        <p className="text-base font-semibold tabular-nums">{money(e.totals.total / 100, currency)}</p>
      </div>
      <Button type="button" className="h-11 rounded-full px-5" disabled={flow.busy || conflict} onClick={() => void flow.start()}>{t('summary.issue')}</Button>
    </FloatingActionBar>
    <IssueCheckSheet issues={flow.check?.issues ?? null} issuing={flow.issuing} onClose={flow.close} onIssue={() => void flow.confirm()} onComplete={e.complete} />
  </>;
}
