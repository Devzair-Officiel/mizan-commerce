'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { StockMovement } from '@/lib/hooks/useStock';

const EXITS = ['loss', 'breakage', 'internal_use', 'adjustment'] as const;
type ReasonedType = (typeof EXITS)[number];
const isReasoned = (type: string): type is ReasonedType => (EXITS as readonly string[]).includes(type);

/**
 * Motif ou référence d'un mouvement : commande liée (lien), fournisseur et
 * facture, motif d'une sortie ou d'une correction, sinon la note saisie.
 */
export function MovementReference({ movement: m }: { movement: StockMovement }) {
  const t = useTranslations('stock.movements.reference');
  if (m.order_id && m.order_number) {
    const link = (chunks: React.ReactNode) => (
      <Link href={`/orders/${m.order_id}`} className="font-semibold text-primary hover:underline">{chunks}</Link>
    );
    const cancelled = m.movement_type === 'release' && m.order_status === 'cancelled';
    return <>{t.rich(cancelled ? 'order_cancelled' : 'order', { number: m.order_number, link })}</>;
  }
  if (m.supplier_name || m.invoice_number) {
    if (!m.invoice_number) return <span dir="auto">{m.supplier_name}</span>;
    return <span dir="auto">{m.supplier_name ? t('supplier_invoice', { supplier: m.supplier_name, invoice: m.invoice_number }) : t('invoice', { invoice: m.invoice_number })}</span>;
  }
  if (isReasoned(m.movement_type)) {
    const kind = t(`kind.${m.movement_type}`);
    return <span dir="auto">{m.reason ? t('with_note', { kind, note: m.reason }) : kind}</span>;
  }
  return m.reason ? <span dir="auto">{m.reason}</span> : <span className="text-muted-foreground" aria-label={t('none')}>—</span>;
}
