'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { orderNumberTag } from '@/components/orders/OrderNumber';
import type { StockMovement } from '@/lib/hooks/useStock';

const KINDS = ['loss', 'breakage', 'internal_use', 'adjustment'] as const;
type Kind = (typeof KINDS)[number];
const isKind = (type: string): type is Kind => (KINDS as readonly string[]).includes(type);

/** « Réservation, commande CMD-12 », « Entrée, Lin & Co facture F-118 », « Sortie, casse ». */
export function ProductMovementLabel({ movement: m }: { movement: StockMovement }) {
  const t = useTranslations('articles.sheet.movement');
  const tType = useTranslations('stock.movements.type');
  const type = tType(m.type_group);

  if (m.order_id && m.order_number) {
    const link = (chunks: ReactNode) => (
      <Link href={`/orders/${m.order_id}`} className="font-semibold text-primary hover:underline">{chunks}</Link>
    );
    const cancelled = m.movement_type === 'release' && m.order_status === 'cancelled';
    return <>{t.rich(cancelled ? 'order_cancelled' : 'order', { type, number: m.order_number, link, num: orderNumberTag })}</>;
  }
  if (m.supplier_name && m.invoice_number) {
    return <span dir="auto">{t.rich('supplier_invoice', { type, supplier: m.supplier_name, invoice: m.invoice_number, num: orderNumberTag })}</span>;
  }
  if (m.supplier_name) return <span dir="auto">{t('supplier', { type, supplier: m.supplier_name })}</span>;
  if (m.invoice_number) return <span dir="auto">{t.rich('invoice', { type, invoice: m.invoice_number, num: orderNumberTag })}</span>;
  if (isKind(m.movement_type)) {
    const kind = t(`kinds.${m.movement_type}`);
    return <span dir="auto">{m.reason ? t('kind_note', { type, kind, note: m.reason }) : t('kind', { type, kind })}</span>;
  }
  return <span dir="auto">{m.reason ? t('note', { type, note: m.reason }) : type}</span>;
}
