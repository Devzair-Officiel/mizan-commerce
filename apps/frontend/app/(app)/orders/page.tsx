'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { useOrders } from '@/lib/hooks/useOrders';
import { Suspense } from 'react';

const STATUSES = [
  { value: '', label: 'Toutes' },
  { value: 'to_prepare', label: 'À préparer' },
  { value: 'prepared', label: 'Préparées' },
  { value: 'shipped', label: 'Expédiées' },
  { value: 'draft', label: 'Brouillons' },
  { value: 'cancelled', label: 'Annulées' },
] as const;

const PAYMENT_COLOR: Record<string, string> = {
  unpaid: 'text-red-500',
  partial: 'text-amber-500',
  paid: 'text-green-600',
};
const PAYMENT_LABEL: Record<string, string> = {
  unpaid: 'Non payé', partial: 'Partiel', paid: 'Payé',
};
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-500',
  to_prepare: 'bg-blue-100 text-blue-700',
  prepared: 'bg-amber-100 text-amber-700',
  shipped: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-500',
};

function OrdersList() {
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
  const { data, isLoading } = useOrders({ status: statusFilter || undefined });

  return (
    <>
      {/* Filtres statut */}
      <div className="flex gap-2 overflow-x-auto pb-1 px-4 no-scrollbar">
        {STATUSES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setStatusFilter(value)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === value
                ? 'bg-zinc-900 text-white'
                : 'bg-white border border-zinc-200 text-zinc-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 px-4">
        {isLoading && <p className="text-sm text-zinc-400 text-center py-8">Chargement…</p>}
        {data?.results.length === 0 && (
          <p className="text-sm text-zinc-400 text-center py-8">Aucune commande.</p>
        )}

        {data?.results.map((order) => (
          <Link
            key={order.id}
            href={`/orders/${order.id}`}
            className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4"
          >
            <div className="flex flex-col gap-1.5">
              <span className="font-semibold text-sm text-zinc-900">{order.order_number}</span>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[order.status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                  {order.status_display}
                </span>
              </div>
              {order.customer_name && (
                <span className="text-xs text-zinc-400">{order.customer_name}</span>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
              <span className="text-sm font-semibold text-zinc-900">{order.total_amount} €</span>
              <span className={`text-xs font-medium ${PAYMENT_COLOR[order.payment_status] ?? ''}`}>
                {PAYMENT_LABEL[order.payment_status] ?? order.payment_status}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

export default function OrdersPage() {
  return (
    <>
      <TopBar
        title="Commandes"
        action={
          <Link href="/orders/new">
            <Button size="sm">+ Nouvelle</Button>
          </Link>
        }
      />
      <div className="flex flex-col gap-3 py-3">
        <Suspense>
          <OrdersList />
        </Suspense>
      </div>
    </>
  );
}
