'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useOrder, useTransitionOrder, useUpdatePayment, type Order } from '@/lib/hooks/useOrders';
import { useIssueInvoice } from '@/lib/hooks/useInvoices';
import type { PreparedMessageTemplate } from '@/lib/hooks/usePreparedMessages';
import { ApiError } from '@/lib/api-client';

export type OrderConfirmKind = 'cancel' | 'reactivate';

/** Gestes disponibles sur la page : partagés par l'action principale, le menu « ⋯ » et les cartes. */
export interface OrderDetailActions {
  transition: (status: string) => void;
  openPayment: (preset: number) => void;
  openInvoice: () => void;
  confirm: (kind: OrderConfirmKind) => void;
  openWhatsApp: (template: PreparedMessageTemplate) => void;
  /** Une transition est en cours : les boutons qui en déclenchent une sont désactivés. */
  pending: boolean;
}

export interface InvoiceInput { taxRate: string; termsDays: string; notes: string }

/** Émission de facture : feuille, erreur, redirection vers la facture (créée ou déjà existante). */
function useInvoiceSheet(order: Order | undefined) {
  const router = useRouter();
  const t = useTranslations('orders.detail');
  const issueInvoice = useIssueInvoice();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit({ taxRate, termsDays, notes }: InvoiceInput) {
    if (!order) return;
    setError(null);
    try {
      const invoice = await issueInvoice.mutateAsync({
        order_id: order.id,
        tax_rate: taxRate || undefined,
        payment_terms_days: termsDays ? Number(termsDays) : undefined,
        notes,
      });
      setOpen(false);
      router.push(`/invoices/${invoice.id}`);
    } catch (err) {
      const existingId = err instanceof ApiError && err.status === 409
        ? (err.data as { existing_id?: string } | null)?.existing_id : undefined;
      if (existingId) {
        setOpen(false);
        router.push(`/invoices/${existingId}`);
        return;
      }
      setError(err instanceof Error ? err.message : t('invoice_error_generic'));
    }
  }

  return {
    open, error, submit, isPending: issueInvoice.isPending,
    show: () => { setError(null); setOpen(true); },
    close: () => setOpen(false),
  };
}

/** Encaissement : le montant saisi s'ajoute au déjà payé (négatif pour corriger). */
function usePaymentSheet(id: string, order: Order | undefined) {
  const updatePayment = useUpdatePayment(id);
  const [preset, setPreset] = useState<string | null>(null);

  async function submit(amountInput: string) {
    if (!order) return;
    const val = parseFloat(amountInput);
    if (!amountInput || Number.isNaN(val) || val === 0) return;
    const newPaid = Math.max(0, parseFloat(order.amount_paid) + val).toFixed(2);
    await updatePayment.mutateAsync(newPaid);
    setPreset(null);
  }

  return {
    open: preset !== null, preset: preset ?? '', submit, isPending: updatePayment.isPending,
    show: (amount: number) => setPreset(amount % 1 === 0 ? String(amount) : amount.toFixed(2)),
    close: () => setPreset(null),
  };
}

/** État de la page détail d'une commande : données, mutations et fenêtres ouvertes. */
export function useOrderDetailState(id: string) {
  const { data: order, isLoading } = useOrder(id);
  const transition = useTransitionOrder(id);
  const payment = usePaymentSheet(id, order);
  const invoice = useInvoiceSheet(order);
  // Le type reste connu pendant l'animation de fermeture (titre stable).
  const [confirmKind, setConfirmKind] = useState<OrderConfirmKind>('cancel');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [whatsApp, setWhatsApp] = useState<PreparedMessageTemplate | null>(null);

  const actions: OrderDetailActions = {
    transition: (status) => { transition.mutate(status); },
    openPayment: payment.show,
    openInvoice: invoice.show,
    confirm: (kind) => { setConfirmKind(kind); setConfirmOpen(true); },
    openWhatsApp: setWhatsApp,
    pending: transition.isPending,
  };

  return {
    order, isLoading, actions, payment, invoice,
    confirm: {
      kind: confirmKind,
      open: confirmOpen,
      close: () => setConfirmOpen(false),
      run: (status: string) => transition.mutateAsync(status).then(() => undefined),
    },
    whatsApp: { template: whatsApp, close: () => setWhatsApp(null) },
  };
}

export type OrderDetailState = ReturnType<typeof useOrderDetailState>;
