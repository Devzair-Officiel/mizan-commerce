'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOrder, useTransitionOrder, useUpdatePayment } from '@/lib/hooks/useOrders';

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-600',
  to_prepare: 'bg-blue-100 text-blue-700',
  prepared: 'bg-amber-100 text-amber-700',
  shipped: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-500',
};
const PAYMENT_COLOR: Record<string, string> = {
  unpaid: 'text-red-500', partial: 'text-amber-500', paid: 'text-green-600',
};

const NEXT_TRANSITIONS: Record<string, { status: string; label: string }[]> = {
  draft: [{ status: 'to_prepare', label: 'Confirmer la commande' }],
  to_prepare: [
    { status: 'prepared', label: 'Marquer préparée' },
    { status: 'cancelled', label: 'Annuler' },
  ],
  prepared: [
    { status: 'shipped', label: 'Marquer expédiée' },
    { status: 'cancelled', label: 'Annuler' },
  ],
  shipped: [],
  cancelled: [],
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: order, isLoading } = useOrder(id);
  const transition = useTransitionOrder(id);
  const updatePayment = useUpdatePayment(id);
  const [paymentInput, setPaymentInput] = useState('');
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  if (isLoading) return <><TopBar title="Commande" /><p className="p-4 text-sm text-zinc-400">Chargement…</p></>;
  if (!order) return <><TopBar title="Commande" /><p className="p-4 text-sm text-red-500">Commande introuvable.</p></>;

  const transitions = NEXT_TRANSITIONS[order.status] ?? [];
  const remaining = (parseFloat(order.total_amount) - parseFloat(order.amount_paid)).toFixed(2);

  async function handleTransition(status: string) {
    if (status === 'cancelled' && !confirm('Annuler cette commande ?')) return;
    await transition.mutateAsync(status);
  }

  async function handlePayment() {
    if (!paymentInput) return;
    await updatePayment.mutateAsync(paymentInput);
    setPaymentInput('');
    setShowPaymentForm(false);
  }

  return (
    <>
      <TopBar title={order.order_number} />
      <div className="flex flex-col gap-4 p-4">

        {/* Statut + client */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLOR[order.status] ?? ''}`}>
              {order.status_display}
            </span>
            <span className="text-xs text-zinc-400">
              {new Date(order.created_at).toLocaleDateString('fr-FR')}
            </span>
          </div>
          {order.customer_name && (
            <Link href={`/customers/${order.customer}`} className="text-sm font-medium text-zinc-900 hover:underline">
              {order.customer_name}
            </Link>
          )}
          {order.notes && <p className="text-sm text-zinc-500">{order.notes}</p>}
        </div>

        {/* Articles */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="font-semibold text-sm text-zinc-900 mb-3">Articles</h2>
          {order.items.length === 0 ? (
            <p className="text-sm text-zinc-400">Aucun article.</p>
          ) : (
            <div className="flex flex-col divide-y divide-zinc-100">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-zinc-900">{item.product_name}</span>
                    <span className="text-xs text-zinc-400">{item.unit_price} € × {item.quantity}</span>
                  </div>
                  <span className="text-sm font-semibold text-zinc-900">{item.line_total} €</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totaux */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 flex flex-col gap-2">
          <div className="flex justify-between text-sm text-zinc-500">
            <span>Sous-total</span><span>{order.subtotal} €</span>
          </div>
          {parseFloat(order.discount_amount) > 0 && (
            <div className="flex justify-between text-sm text-zinc-500">
              <span>Remise</span><span>− {order.discount_amount} €</span>
            </div>
          )}
          {parseFloat(order.shipping_amount) > 0 && (
            <div className="flex justify-between text-sm text-zinc-500">
              <span>Livraison</span><span>+ {order.shipping_amount} €</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold text-zinc-900 pt-1 border-t border-zinc-100">
            <span>Total</span><span>{order.total_amount} €</span>
          </div>
        </div>

        {/* Paiement */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-zinc-900">Paiement</h2>
            <span className={`text-sm font-semibold ${PAYMENT_COLOR[order.payment_status] ?? ''}`}>
              {order.payment_status_display}
            </span>
          </div>
          <div className="flex justify-between text-sm text-zinc-500">
            <span>Payé</span><span>{order.amount_paid} €</span>
          </div>
          {parseFloat(remaining) > 0 && (
            <div className="flex justify-between text-sm font-medium text-red-500">
              <span>Reste à payer</span><span>{remaining} €</span>
            </div>
          )}
          {order.payment_status !== 'paid' && order.status !== 'cancelled' && (
            showPaymentForm ? (
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentInput}
                  onChange={(e) => setPaymentInput(e.target.value)}
                  placeholder="Montant payé total"
                  className="flex-1"
                />
                <Button size="sm" onClick={handlePayment} disabled={updatePayment.isPending}>OK</Button>
                <Button size="sm" variant="outline" onClick={() => setShowPaymentForm(false)}>✕</Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full" onClick={() => setShowPaymentForm(true)}>
                Enregistrer un paiement
              </Button>
            )
          )}
        </div>

        {/* Actions de transition */}
        {transitions.length > 0 && (
          <div className="flex flex-col gap-2">
            {transitions.map(({ status, label }) => (
              <Button
                key={status}
                variant={status === 'cancelled' ? 'outline' : 'default'}
                className={status === 'cancelled' ? 'text-red-500 border-red-200' : ''}
                onClick={() => handleTransition(status)}
                disabled={transition.isPending}
              >
                {label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
