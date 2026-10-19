'use client';

import { useTranslations } from 'next-intl';
import { Pencil, Trash2 } from 'lucide-react';
import type { OrderState, OrderSummary, ReceivableItem } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../../useZakatFormat';
import { PersonalTag } from '../PersonalTag';
import { ScopeMissingTag } from '../ScopeMissingTag';
import { OrderNotice } from './OrderNotice';
import { SureSegment } from './SureSegment';

interface ReceivableRowProps {
  item: ReceivableItem;
  /** Commande d'origine telle qu'elle est aujourd'hui (créance copiée d'une commande). */
  order?: OrderSummary & { state: OrderState };
  format: ZakatFormat;
  /** Portée à préciser (part inférieure à 100 %) : la ligne s'ouvre pour choisir. */
  scopeMissing: boolean;
  onChange: (item: ReceivableItem) => void;
  onRemove: () => void;
  onEdit: () => void;
}

const ICON_BUTTON = 'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30';

/**
 * Une créance. Mobile : nom et montant, puis « Reste dû » et Sûre / Douteuse. Desktop : une seule ligne.
 * Une créance saisie à la main s'édite dans la feuille ; celle d'une commande se retire (elle revient
 * alors dans les commandes proposées).
 */
export function ReceivableRow({ item, order, format, scopeMissing, onChange, onRemove, onEdit }: ReceivableRowProps) {
  const t = useTranslations('zakat.steps.receivables');
  const linked = item.order_id !== null;
  let sub: string | null = linked ? null : t('manual_line');
  if (order?.order_number) {
    sub = order.created_at
      ? t('order_line', { number: order.order_number, date: format.shortDate(order.created_at) })
      : t('order_line_short', { number: order.order_number });
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3 last:border-b-0 lg:gap-x-4 lg:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          <span dir="auto">{item.label}</span>
          {item.scope === 'personal' && <PersonalTag />}
          {scopeMissing && <ScopeMissingTag />}
        </p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
      <span className="text-sm font-semibold whitespace-nowrap text-foreground tabular-nums lg:order-2">{format.money(item.amount)}</span>
      <span aria-hidden className="basis-full lg:hidden" />
      <span className="flex-1 text-xs text-muted-foreground lg:hidden">{linked ? t('remaining') : null}</span>
      <SureSegment doubtful={item.doubtful} onChange={(doubtful) => onChange({ ...item, doubtful })} className="lg:order-1" />
      {linked ? (
        <button type="button" onClick={onRemove} aria-label={t('delete_line')} className={`${ICON_BUTTON} lg:order-3`}>
          <Trash2 className="size-4" aria-hidden />
        </button>
      ) : (
        <button type="button" onClick={onEdit} aria-label={t('edit_line', { label: item.label })} className={`${ICON_BUTTON} lg:order-3`}>
          <Pencil className="size-4" aria-hidden />
        </button>
      )}
      {order && order.state !== 'unchanged' && (
        <OrderNotice state={order.state} before={item.amount} after={order.remaining} format={format}
          onRemove={onRemove} onUpdate={() => order.remaining && onChange({ ...item, amount: order.remaining })} />
      )}
    </li>
  );
}
