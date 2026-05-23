'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileEdit, ListChecks, PackageCheck, Truck, XCircle } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/ui/floating-fields';
import { useOrder, useTransitionOrder, useUpdatePayment } from '@/lib/hooks/useOrders';

/* ── config par statut (icône + classes badge + classes boutons) ── */
const STATUS_CONFIG: Record<string, {
  icon: React.ReactNode;
  badge: string;
  btnClass: string;
}> = {
  draft:      { icon: <FileEdit  size={15} />, badge: 'bg-zinc-100 text-zinc-600',   btnClass: 'bg-zinc-700 hover:bg-zinc-800 text-white' },
  to_prepare: { icon: <ListChecks size={15} />, badge: 'bg-blue-100 text-blue-700',  btnClass: 'bg-blue-600 hover:bg-blue-700 text-white' },
  prepared:   { icon: <PackageCheck size={15} />, badge: 'bg-amber-100 text-amber-700', btnClass: 'bg-amber-500 hover:bg-amber-600 text-white' },
  shipped:    { icon: <Truck size={15} />, badge: 'bg-green-100 text-green-700', btnClass: 'bg-green-600 hover:bg-green-700 text-white' },
  cancelled:  { icon: <XCircle size={15} />, badge: 'bg-red-100 text-red-500',   btnClass: '' },
};

const PAYMENT_COLOR: Record<string, string> = {
  unpaid:  'text-red-500',
  partial: 'text-amber-500',
  paid:    'text-green-600',
};

const NEXT_TRANSITIONS: Record<string, { status: string; label: string }[]> = {
  draft:      [{ status: 'to_prepare', label: 'Confirmer la commande' }],
  to_prepare: [{ status: 'prepared',   label: 'Marquer préparée' }, { status: 'cancelled', label: 'Annuler' }],
  prepared:   [{ status: 'shipped',    label: 'Marquer expédiée' }, { status: 'cancelled', label: 'Annuler' }],
  shipped:    [],
  cancelled:  [],
};

const REVERT_TRANSITION: Record<string, { status: string; label: string }> = {
  to_prepare: { status: 'draft',      label: 'Revenir en brouillon' },
  prepared:   { status: 'to_prepare', label: 'Revenir à « À préparer »' },
  shipped:    { status: 'prepared',   label: 'Revenir à « Préparée »' },
  cancelled:  { status: 'draft',      label: 'Rouvrir en brouillon' },
};

/* icône du statut cible (pour le bouton) */
const TRANSITION_ICON: Record<string, React.ReactNode> = {
  to_prepare: <ListChecks size={16} />,
  prepared:   <PackageCheck size={16} />,
  shipped:    <Truck size={16} />,
  cancelled:  <XCircle size={16} />,
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: order, isLoading } = useOrder(id);
  const transition = useTransitionOrder(id);
  const updatePayment = useUpdatePayment(id);
  const [paymentInput, setPaymentInput] = useState('0');
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  if (isLoading) return <><TopBar title="Commande" /><p className="p-4 text-sm text-zinc-400">Chargement…</p></>;
  if (!order) return <><TopBar title="Commande" /><p className="p-4 text-sm text-red-500">Commande introuvable.</p></>;

  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.draft;
  const transitions = NEXT_TRANSITIONS[order.status] ?? [];
  const remaining = (parseFloat(order.total_amount) - parseFloat(order.amount_paid)).toFixed(2);

  async function handleTransition(status: string) {
    if (status === 'cancelled' && !confirm('Annuler cette commande ?')) return;
    await transition.mutateAsync(status);
  }

  function stepPayment(delta: number) {
    const current = parseFloat(paymentInput) || 0;
    const next = current + delta;
    setPaymentInput(next % 1 === 0 ? String(next) : next.toFixed(2));
  }

  async function handlePayment() {
    if (!order) return;
    const val = parseFloat(paymentInput);
    if (!paymentInput || val === 0) return;
    const versement = parseFloat(paymentInput) || 0;
    const nouveauTotal = (parseFloat(order.amount_paid) + versement).toFixed(2);
    await updatePayment.mutateAsync(nouveauTotal);
    setPaymentInput('0');
    setShowPaymentForm(false);
  }

  return (
    <>
      <TopBar title={order.order_number} action={
        order.status === 'draft' && (
          <button onClick={() => router.push(`/orders/${id}/edit`)} className="text-sm font-medium text-primary">
            Modifier
          </button>
        )
      } />
      <div className="flex flex-col gap-4 p-4">

        {/* Statut + client */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cfg.badge}`}>
              {cfg.icon}
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
          {order.status !== 'cancelled' && (
            showPaymentForm ? (
              <div className="flex flex-col gap-2">
                {(() => {
                  const val = parseFloat(paymentInput) || 0;
                  const isNeg = val < 0;
                  return (
                    <>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => stepPayment(-1)}
                          className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-lg text-foreground active:bg-muted shrink-0"
                        >−</button>
                        <div className="flex-1">
                          <FloatingInput
                            id="payment-amount"
                            label={isNeg ? 'Correction (retrait)' : 'Montant du versement'}
                            type="number" step="0.01"
                            value={paymentInput}
                            onChange={(e) => setPaymentInput(e.target.value)}
                            className={isNeg ? 'border-red-400 text-red-500 focus:border-red-400 focus:ring-red-200' : ''}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => stepPayment(1)}
                          className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-lg text-foreground active:bg-muted shrink-0"
                        >+</button>
                      </div>
                      {isNeg && (
                        <p className="text-xs text-red-500 px-1">
                          Le montant payé passera de {order.amount_paid} € à {Math.max(0, parseFloat(order.amount_paid) + val).toFixed(2)} €
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          className={`flex-1 ${isNeg ? 'bg-red-500 hover:bg-red-600' : ''}`}
                          onClick={handlePayment}
                          disabled={updatePayment.isPending || val === 0}
                        >
                          {updatePayment.isPending ? 'Enregistrement…' : isNeg ? 'Appliquer la correction' : 'Valider le versement'}
                        </Button>
                        <Button variant="outline" onClick={() => { setShowPaymentForm(false); setPaymentInput('0'); }}>✕</Button>
                      </div>
                    </>
                  );
                })()}
                <Button
                  size="sm"
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => setPaymentInput(remaining)}
                  disabled={updatePayment.isPending}
                >
                  Régler le solde ({remaining} €)
                </Button>
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
            {transitions.map(({ status, label }) => {
              const isCancelBtn = status === 'cancelled';
              return (
                <Button
                  key={status}
                  variant={isCancelBtn ? 'outline' : 'default'}
                  className={
                    isCancelBtn
                      ? 'w-full text-red-500 border-red-200'
                      : `w-full inline-flex items-center gap-2 justify-center ${STATUS_CONFIG[status]?.btnClass ?? ''}`
                  }
                  onClick={() => handleTransition(status)}
                  disabled={transition.isPending}
                >
                  {!isCancelBtn && TRANSITION_ICON[status]}
                  {isCancelBtn && <XCircle size={16} />}
                  {label}
                </Button>
              );
            })}
          </div>
        )}

        {/* Retour arrière */}
        {REVERT_TRANSITION[order.status] && (
          <button
            onClick={() => handleTransition(REVERT_TRANSITION[order.status].status)}
            disabled={transition.isPending}
            className="text-xs text-muted-foreground underline underline-offset-2 text-center py-1 disabled:opacity-40"
          >
            ↩ {REVERT_TRANSITION[order.status].label}
          </button>
        )}
      </div>
    </>
  );
}
