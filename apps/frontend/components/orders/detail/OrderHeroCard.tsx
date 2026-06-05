import Link from 'next/link';
import { Phone, User } from 'lucide-react';
import type { Order } from '@/lib/hooks/useOrders';
import {
  DATE_FMT, PAYMENT_PILL, STATUS_CONFIG, STATUS_DRAFT,
  WhatsAppIcon, buildWhatsAppMessage,
} from './constants';

interface OrderHeroCardProps {
  order: Order;
  remaining: string;
}

export function OrderHeroCard({ order, remaining }: OrderHeroCardProps) {
  const cfg = STATUS_CONFIG[order.status] ?? STATUS_DRAFT;
  const itemCount = order.items.reduce((acc, i) => acc + i.quantity, 0);
  const waPhone = order.customer_phone?.replace(/\D/g, '') ?? '';

  return (
    <>
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 flex flex-col gap-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cfg.badge}`}>
            {cfg.icon}
            {order.status_display}
          </span>
          <span className="text-xs text-zinc-400">
            {DATE_FMT.format(new Date(order.created_at))}
          </span>
        </div>

        <div className="flex flex-col items-center gap-1 text-center">
          {order.customer_name ? (
            <Link
              href={`/customers/${order.customer}`}
              className="text-xl font-semibold text-zinc-900 capitalize hover:underline"
            >
              {order.customer_name}
            </Link>
          ) : (
            <p className="text-xl font-semibold text-zinc-400">Sans client</p>
          )}
          <p className="text-xs text-zinc-500">
            #{order.order_number} · {itemCount} {itemCount > 1 ? 'articles' : 'article'}
          </p>
        </div>

        <div className="flex flex-col items-center gap-2">
          <p className="text-4xl font-bold text-zinc-900 tabular-nums">
            {parseFloat(order.total_amount).toFixed(2)} €
          </p>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${PAYMENT_PILL[order.payment_status] ?? ''}`}>
            {order.payment_status_display}
            {order.payment_status === 'partial' && (
              <span className="ml-1.5 opacity-70">· {parseFloat(remaining).toFixed(2)} € restant</span>
            )}
          </span>
        </div>
      </div>

      {order.customer && (waPhone || order.customer_name) && (
        <div className="flex w-full items-center gap-2">
          {waPhone && (
            <a
              href={`https://wa.me/${waPhone}?text=${encodeURIComponent(buildWhatsAppMessage(order))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-2 h-11 rounded-full bg-primary/10 text-primary active:scale-95 transition-transform hover:bg-primary/15"
            >
              <WhatsAppIcon size={16} />
              <span className="text-sm font-semibold">Prévenir le client</span>
            </a>
          )}
          {order.customer_phone && (
            <a
              href={`tel:${order.customer_phone}`}
              aria-label="Appeler"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary active:scale-95 transition-transform"
            >
              <Phone size={18} />
            </a>
          )}
          <Link
            href={`/customers/${order.customer}`}
            aria-label="Voir la fiche client"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary active:scale-95 transition-transform"
          >
            <User size={18} />
          </Link>
        </div>
      )}
    </>
  );
}
