'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { useOrders } from '@/lib/hooks/useOrders';
import { Suspense } from 'react';

const STATUS_COLOR: Record<string, string> = {
  draft:      'bg-zinc-100 text-zinc-600',
  to_prepare: 'bg-blue-100 text-blue-700',
  prepared:   'bg-amber-100 text-amber-700',
  shipped:    'bg-green-100 text-green-700',
  cancelled:  'bg-red-100 text-red-500',
};

const PAYMENT_LABEL: Record<string, string> = {
  unpaid:  'Non payé',
  partial: 'Partiel',
  paid:    'Payé',
};

const PAYMENT_COLOR: Record<string, string> = {
  unpaid:  'text-red-500',
  partial: 'text-amber-500',
  paid:    'text-green-600',
};

const STATUSES: { value: string; label: string; active: string; inactive: string }[] = [
  { value: '',           label: 'Toutes',      active: 'bg-zinc-800 text-white',         inactive: 'bg-white border border-zinc-200 text-zinc-600' },
  { value: 'draft',      label: 'Brouillons',  active: 'bg-zinc-500 text-white',          inactive: 'bg-zinc-100 border border-zinc-200 text-zinc-600' },
  { value: 'to_prepare', label: 'À préparer',  active: 'bg-blue-600 text-white',          inactive: 'bg-blue-50 border border-blue-200 text-blue-700' },
  { value: 'prepared',   label: 'Préparées',   active: 'bg-amber-500 text-white',         inactive: 'bg-amber-50 border border-amber-200 text-amber-700' },
  { value: 'shipped',    label: 'Expédiées',   active: 'bg-green-600 text-white',         inactive: 'bg-green-50 border border-green-200 text-green-700' },
  { value: 'cancelled',  label: 'Annulées',    active: 'bg-red-500 text-white',           inactive: 'bg-red-50 border border-red-200 text-red-500' },
];

function OrdersList() {
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
  const { data, isLoading } = useOrders({ status: statusFilter || undefined });

  return (
    <>
      {/* Filtres statut */}
      <div className="flex gap-2 overflow-x-auto pb-1 px-4 lg:px-8 no-scrollbar">
        {STATUSES.map(({ value, label, active, inactive }) => (
          <button
            key={value}
            onClick={() => setStatusFilter(value)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === value ? active : inactive
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="px-4 lg:px-8">
        {isLoading && <p className="text-sm text-muted-foreground text-center py-8">Chargement…</p>}
        {data?.results.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Aucune commande.</p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {data?.results.map((order) => (
          <Link
            key={order.id}
            href={`/orders/${order.id}`}
            className="flex items-center justify-between rounded-xl border border-border bg-card p-4 hover:bg-muted/40 transition-colors"
          >
            <div className="flex flex-col gap-1.5">
              <span className="font-semibold text-base text-foreground">{order.order_number}</span>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[order.status] ?? 'bg-zinc-100 text-zinc-600'}`}>
                  {order.status_display}
                </span>
              </div>
              {order.customer_name && (
                <span className="text-sm text-muted-foreground">{order.customer_name}</span>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
              <span className="text-base font-semibold text-foreground">{parseFloat(order.total_amount).toFixed(2)} €</span>
              <span className={`text-sm font-medium ${PAYMENT_COLOR[order.payment_status] ?? ''}`}>
                {PAYMENT_LABEL[order.payment_status] ?? order.payment_status}
              </span>
            </div>
          </Link>
        ))}
        </div>
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
      <div className="flex flex-col gap-4 py-3 lg:py-6">
        <Suspense>
          <OrdersList />
        </Suspense>
      </div>
    </>
  );
}
