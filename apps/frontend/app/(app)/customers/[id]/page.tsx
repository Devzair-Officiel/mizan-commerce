'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { useCustomer } from '@/lib/hooks/useCustomers';
import { useOrders } from '@/lib/hooks/useOrders';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon', to_prepare: 'À préparer', prepared: 'Préparé',
  shipped: 'Expédié', cancelled: 'Annulé',
};
const PAYMENT_LABEL: Record<string, string> = {
  unpaid: 'Non payé', partial: 'Partiel', paid: 'Payé',
};
const PAYMENT_COLOR: Record<string, string> = {
  unpaid: 'text-red-500', partial: 'text-amber-500', paid: 'text-green-600',
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: customer, isLoading } = useCustomer(id);
  const { data: orders } = useOrders({ customer: id });

  if (isLoading) return <><TopBar title="Client" /><p className="p-4 text-sm text-zinc-400">Chargement…</p></>;
  if (!customer) return <><TopBar title="Client" /><p className="p-4 text-sm text-red-500">Client introuvable.</p></>;

  return (
    <>
      <TopBar
        title={customer.name}
        action={
          <Link href={`/customers/${id}/edit`}>
            <Button variant="outline" size="sm">Modifier</Button>
          </Link>
        }
      />
      <div className="flex flex-col gap-4 p-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-400">Commandes</p>
            <p className="text-2xl font-bold text-zinc-900">{customer.order_count}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-400">En attente</p>
            <p className={`text-2xl font-bold ${parseFloat(customer.pending_amount) > 0 ? 'text-red-500' : 'text-zinc-900'}`}>
              {customer.pending_amount} €
            </p>
          </div>
        </div>

        {/* Coordonnées */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 flex flex-col gap-3">
          {customer.phone && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Téléphone</span>
              <a href={`tel:${customer.phone}`} className="font-medium text-zinc-900">{customer.phone}</a>
            </div>
          )}
          {customer.email && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Email</span>
              <a href={`mailto:${customer.email}`} className="font-medium text-zinc-900">{customer.email}</a>
            </div>
          )}
          {customer.city && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Ville</span>
              <span className="font-medium text-zinc-900">{customer.city}</span>
            </div>
          )}
          {customer.notes && (
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-400">Notes</span>
              <span className="text-zinc-700">{customer.notes}</span>
            </div>
          )}
        </div>

        {/* Historique commandes */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm text-zinc-900">Commandes</h2>
            <Link href={`/orders/new?customer=${id}`}>
              <Button size="sm" variant="outline">+ Nouvelle</Button>
            </Link>
          </div>
          {!orders?.results.length ? (
            <p className="text-sm text-zinc-400">Aucune commande.</p>
          ) : (
            <div className="flex flex-col divide-y divide-zinc-100">
              {orders.results.map((order) => (
                <Link key={order.id} href={`/orders/${order.id}`} className="flex items-center justify-between py-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-zinc-900">{order.order_number}</span>
                    <span className="text-xs text-zinc-400">{STATUS_LABEL[order.status] ?? order.status}</span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-sm font-semibold text-zinc-900">{order.total_amount} €</span>
                    <span className={`text-xs font-medium ${PAYMENT_COLOR[order.payment_status] ?? ''}`}>
                      {PAYMENT_LABEL[order.payment_status] ?? order.payment_status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
