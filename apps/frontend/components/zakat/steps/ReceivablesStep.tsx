'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { compareDecimal } from '@/lib/decimal';
import type { ReceivableItem, ZakatCalculation } from '@/lib/hooks/useZakat';
import { CalcChoice } from '../choice/CalcChoice';
import type { ZakatFormat } from '../useZakatFormat';
import { AddLineButton } from './AddLineButton';
import { NewOrdersCard } from './receivables/NewOrdersCard';
import { ReceivableRow } from './receivables/ReceivableRow';
import { ReceivableSheet } from './receivables/ReceivableSheet';
import { receivableOf } from './receivables/receivableOf';
import { StepHeading } from './StepHeading';
import type { StepProps } from './types';

/** Sûres (dans la base selon le choix) et douteuses (hors base) : montants du serveur. */
function ReceivableTotals({ calc, format, share }: { calc: ZakatCalculation; format: ZakatFormat; share?: string }) {
  const t = useTranslations('zakat.steps');
  const items = calc.receivable_items;
  const row = 'flex justify-between gap-3 bg-muted/50 px-4 py-2.5 text-[0.84375rem] lg:px-5';
  // Inconnu tant qu'une portée reste à choisir.
  const money = (value: string | null) => (value === null ? '—' : format.money(value));
  return (
    <div className="border-t border-border">
      <p className={row}>
        <span>{t('receivables.total_sure', { count: items.filter((i) => !i.doubtful).length })}</span>
        <span className="font-semibold whitespace-nowrap tabular-nums">{money(calc.totals.receivables_sure)}</span>
      </p>
      {items.some((i) => i.doubtful) && (
        <p className={`${row} border-t border-border text-muted-foreground`}>
          <span>{t('receivables.total_doubtful')}</span>
          <span className="whitespace-nowrap tabular-nums">{money(calc.totals.receivables_doubtful)}</span>
        </p>
      )}
      {share !== undefined && <p className="px-4 pt-2 pb-3 text-xs text-muted-foreground lg:px-5">{t('scope.share_note', { share })}</p>}
    </div>
  );
}

/** Étape 4 : commandes non réglées copiées à la création, sûres ou douteuses, et créances hors Mizan. */
export function ReceivablesStep({ calc, save, format }: StepProps) {
  const t = useTranslations('zakat.steps.receivables');
  const [sheet, setSheet] = useState<number | 'new' | null>(null);
  const items = calc.receivable_items;
  const scopeMissing = new Set(calc.totals.missing_scopes.receivables);
  // Sous 100 %, chaque créance saisie à la main se classe : boutique ou personnelle.
  const share = compareDecimal(calc.totals.ownership_share, '100') < 0 ? format.percent(calc.totals.ownership_share) : undefined;
  const orders = new Map(calc.review.receivable_orders.linked.map((o) => [o.order_id, o]));
  // Une commande ajoutée quitte la liste tout de suite, sans attendre la réponse du serveur.
  const fresh = calc.review.receivable_orders.new.filter((o) => !items.some((i) => i.order_id === o.order_id));
  const write = (next: ReceivableItem[]) => save({ receivable_items: next }, true);
  const replace = (index: number, item: ReceivableItem) => write(items.map((it, i) => (i === index ? item : it)));
  const remove = (index: number) => write(items.filter((_, i) => i !== index));

  return (
    <>
      <StepHeading title={t('title')} lead={t('hint')} />
      <CalcChoice calc={calc} save={save} format={format} name="receivables_mode" />
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="header-band border-b border-border px-5 py-4 max-lg:hidden">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">{t('title')}</h2>
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted-foreground">{t('hint')}</p>
        </div>
        {items.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <p className="text-sm font-semibold text-foreground">{t('empty_title')}</p>
            <p className="mt-1 text-[0.8125rem] text-muted-foreground">{t('empty_sub')}</p>
          </div>
        ) : (
          <>
            <ul>
              {items.map((item, index) => (
                <ReceivableRow key={item.id} item={item} format={format} scopeMissing={scopeMissing.has(item.id)}
                  order={item.order_id ? orders.get(item.order_id) : undefined}
                  onChange={(next) => replace(index, next)} onRemove={() => remove(index)} onEdit={() => setSheet(index)} />
              ))}
            </ul>
            <ReceivableTotals calc={calc} format={format} share={share} />
          </>
        )}
      </section>
      {fresh.length > 0 && (
        <NewOrdersCard orders={fresh} format={format}
          onAdd={(added) => write([...items, ...added.map(receivableOf)])} />
      )}
      <AddLineButton label={t('add_manual')} onClick={() => setSheet('new')} />
      {sheet !== null && (
        <ReceivableSheet item={sheet === 'new' ? undefined : items[sheet]} format={format} share={share} onClose={() => setSheet(null)}
          onSubmit={(item) => (sheet === 'new' ? write([...items, item]) : replace(sheet, item))}
          onDelete={sheet === 'new' ? undefined : () => { remove(sheet); setSheet(null); }} />
      )}
    </>
  );
}
