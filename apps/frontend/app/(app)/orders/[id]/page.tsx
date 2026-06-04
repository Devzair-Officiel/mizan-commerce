'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight, CheckCircle2, CreditCard, FileEdit, Flag, History, ListChecks,
  PackageCheck, Phone, Plus, Receipt, StickyNote, Trash2, Truck, User, Wallet, XCircle,
  Pencil,
} from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingTextarea } from '@/components/ui/floating-fields';
import {
  useOrder, useOrderActivity, useTransitionOrder, useUpdatePayment,
  type Order, type OrderActivityEvent,
} from '@/lib/hooks/useOrders';
import { useOrderNotes, useCreateOrderNote, useDeleteNote } from '@/lib/hooks/useNotes';
import { useIssueInvoice } from '@/lib/hooks/useInvoices';
import { useShop } from '@/lib/hooks/useShop';
import { ApiError } from '@/lib/api-client';

/* ── config par statut (icône + classes badge) ── */
const STATUS_CONFIG: Record<string, {
  icon: React.ReactNode;
  badge: string;
}> = {
  draft:      { icon: <FileEdit  size={15} />, badge: 'bg-zinc-100 text-zinc-600' },
  to_prepare: { icon: <ListChecks size={15} />, badge: 'bg-blue-100 text-blue-700' },
  prepared:   { icon: <PackageCheck size={15} />, badge: 'bg-amber-100 text-amber-700' },
  shipped:    { icon: <Truck size={15} />, badge: 'bg-green-100 text-green-700' },
  cancelled:  { icon: <XCircle size={15} />, badge: 'bg-red-100 text-red-500' },
};

const PAYMENT_COLOR: Record<string, string> = {
  unpaid:  'text-red-500',
  partial: 'text-amber-500',
  paid:    'text-green-600',
};

const PAYMENT_PILL: Record<string, string> = {
  unpaid:  'bg-red-50 text-red-600 border border-red-100',
  partial: 'bg-amber-50 text-amber-700 border border-amber-100',
  paid:    'bg-green-50 text-green-700 border border-green-100',
};

/* ── Prochaine étape : CTA dynamique selon statut ── */
interface NextStep {
  title: string;
  subtitle: string;
  cta: string;
  next: string;
  icon: React.ReactNode;
  accent: string;
  btnClass: string;
}

const NEXT_STEP: Record<string, NextStep | null> = {
  draft: {
    title: 'Confirmer la commande',
    subtitle: 'Verrouille le stock et passe en préparation.',
    cta: 'Confirmer la commande',
    next: 'to_prepare',
    icon: <ListChecks size={18} />,
    accent: 'bg-blue-50 text-blue-700 border border-blue-100',
    btnClass: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  to_prepare: {
    title: 'Marquer comme prête',
    subtitle: 'Quand les articles sont prêts à être expédiés.',
    cta: 'Marquer prête',
    next: 'prepared',
    icon: <PackageCheck size={18} />,
    accent: 'bg-amber-50 text-amber-700 border border-amber-100',
    btnClass: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  prepared: {
    title: 'Marquer comme expédiée',
    subtitle: 'Quand la commande quitte la boutique.',
    cta: 'Marquer expédiée',
    next: 'shipped',
    icon: <Truck size={18} />,
    accent: 'bg-green-50 text-green-700 border border-green-100',
    btnClass: 'bg-green-600 hover:bg-green-700 text-white',
  },
  shipped: null,
  cancelled: null,
};

const REVERT_TRANSITION: Record<string, { status: string; label: string }> = {
  to_prepare: { status: 'draft',      label: 'Revenir en brouillon' },
  prepared:   { status: 'to_prepare', label: 'Revenir à « À préparer »' },
  shipped:    { status: 'prepared',   label: 'Revenir à « Prête »' },
  cancelled:  { status: 'draft',      label: 'Rouvrir en brouillon' },
};

const STATUS_ALLOWS_CANCEL = new Set(['draft', 'to_prepare', 'prepared']);

function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const REL_FMT = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });
const FULL_FMT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "à l'instant";
  const min = Math.round(sec / 60);
  if (min < 60) return REL_FMT.format(-min, 'minute');
  const hr = Math.round(min / 60);
  if (hr < 24) return REL_FMT.format(-hr, 'hour');
  const day = Math.round(hr / 24);
  if (day < 7) return REL_FMT.format(-day, 'day');
  if (day < 30) return REL_FMT.format(-Math.round(day / 7), 'week');
  if (day < 365) return REL_FMT.format(-Math.round(day / 30), 'month');
  return REL_FMT.format(-Math.round(day / 365), 'year');
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  to_prepare: 'À préparer',
  prepared: 'Prête',
  shipped: 'Expédiée',
  cancelled: 'Annulée',
};

const WA_STATUS_MSG: Record<string, string> = {
  draft:      'Votre commande est bien enregistrée.',
  to_prepare: 'Votre commande est en cours de préparation.',
  prepared:   'Votre commande est prête.',
  shipped:    'Votre commande a été expédiée.',
  cancelled:  'Votre commande a été annulée.',
};

function buildWhatsAppMessage(order: Order): string {
  const firstName = (order.customer_name ?? '').trim().split(/\s+/)[0] ?? '';
  const total = parseFloat(order.total_amount);
  const paid = parseFloat(order.amount_paid);
  const remaining = Math.max(0, total - paid);
  const date = DATE_FMT.format(new Date(order.created_at));

  const paymentLine =
    order.payment_status === 'paid'
      ? 'Paiement : réglé. Merci !'
      : order.payment_status === 'partial'
        ? `Acompte versé : ${paid.toFixed(2)} € — Reste à régler : ${remaining.toFixed(2)} €`
        : `Paiement : à régler (${total.toFixed(2)} €)`;

  return [
    firstName ? `Bonjour ${firstName},` : 'Bonjour,',
    '',
    WA_STATUS_MSG[order.status] ?? 'Mise à jour de votre commande.',
    '',
    `Commande n°${order.order_number} du ${date}`,
    `Total : ${total.toFixed(2)} €`,
    paymentLine,
    '',
    'À bientôt.',
  ].join('\n');
}

const PAYMENT_LABEL: Record<string, string> = {
  unpaid: 'Non payé',
  partial: 'Partiel',
  paid: 'Payé',
};

interface EventDisplay {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  body?: string;
}

function describeEvent(event: OrderActivityEvent): EventDisplay {
  switch (event.type) {
    case 'created':
      return {
        icon: <Flag size={14} />,
        iconBg: 'bg-zinc-100 text-zinc-600',
        title: 'Commande créée',
        body: event.data.order_number ? `#${event.data.order_number}` : undefined,
      };
    case 'status_change': {
      const from = event.data.from ? (STATUS_LABEL[event.data.from] ?? event.data.from) : '';
      const to = event.data.to ? (STATUS_LABEL[event.data.to] ?? event.data.to) : '';
      return {
        icon: <ArrowRight size={14} />,
        iconBg: 'bg-blue-50 text-blue-600',
        title: `Statut : ${from} → ${to}`,
      };
    }
    case 'payment_change': {
      const from = event.data.from ? (PAYMENT_LABEL[event.data.from] ?? event.data.from) : '';
      const to = event.data.to ? (PAYMENT_LABEL[event.data.to] ?? event.data.to) : '';
      const before = event.data.amount_paid_before;
      const after = event.data.amount_paid_after;
      const amountStr = before !== undefined && after !== undefined
        ? `${parseFloat(before ?? '0').toFixed(2)} € → ${parseFloat(after ?? '0').toFixed(2)} €`
        : undefined;
      return {
        icon: <CreditCard size={14} />,
        iconBg: 'bg-green-50 text-green-600',
        title: `Paiement : ${from} → ${to}`,
        body: amountStr,
      };
    }
    case 'note':
      return {
        icon: <StickyNote size={14} />,
        iconBg: 'bg-amber-50 text-amber-600',
        title: 'Note ajoutée',
        body: typeof event.data.content === 'string' ? event.data.content : undefined,
      };
  }
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: order, isLoading } = useOrder(id);
  const { data: activityData } = useOrderActivity(id);
  const { data: notesData } = useOrderNotes(id);
  const { data: shop } = useShop();
  const transition = useTransitionOrder(id);
  const updatePayment = useUpdatePayment(id);
  const createNote = useCreateOrderNote(id);
  const deleteNote = useDeleteNote(id);
  const issueInvoice = useIssueInvoice();
  const [showPaymentSheet, setShowPaymentSheet] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [editAmount, setEditAmount] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [showInvoiceSheet, setShowInvoiceSheet] = useState(false);
  const [invoiceTaxRate, setInvoiceTaxRate] = useState('');
  const [invoiceTermsDays, setInvoiceTermsDays] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  if (isLoading) return <><TopBar title="Commande" /><p className="p-4 text-sm text-zinc-400">Chargement…</p></>;
  if (!order) return <><TopBar title="Commande" /><p className="p-4 text-sm text-red-500">Commande introuvable.</p></>;

  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.draft;
  const nextStep = NEXT_STEP[order.status] ?? null;
  const canCancel = STATUS_ALLOWS_CANCEL.has(order.status);
  const totalAmount = parseFloat(order.total_amount);
  const subtotalAmount = parseFloat(order.subtotal);
  const paidAmount = parseFloat(order.amount_paid);
  const discountAmount = parseFloat(order.discount_amount);
  const shippingAmount = parseFloat(order.shipping_amount);
  const remaining = (totalAmount - paidAmount).toFixed(2);
  const paymentProgress = totalAmount > 0 ? Math.min(100, Math.round((paidAmount / totalAmount) * 100)) : 0;
  const hasAdjustments = discountAmount > 0 || shippingAmount > 0;
  const itemCount = order.items.reduce((acc, i) => acc + i.quantity, 0);
  const waPhone = order.customer_phone?.replace(/\D/g, '') ?? '';

  async function handleTransition(status: string) {
    if (status === 'cancelled' && !confirm('Annuler cette commande ?')) return;
    await transition.mutateAsync(status);
  }

  function openPaymentSheet(preset: number) {
    setAmountInput(preset % 1 === 0 ? String(preset) : preset.toFixed(2));
    setEditAmount(false);
    setShowPaymentSheet(true);
  }

  function closePaymentSheet() {
    setShowPaymentSheet(false);
    setAmountInput('');
    setEditAmount(false);
  }

  async function handleSubmitPayment() {
    if (!order) return;
    const val = parseFloat(amountInput);
    if (!amountInput || Number.isNaN(val) || val === 0) return;
    const newPaid = Math.max(0, parseFloat(order.amount_paid) + val).toFixed(2);
    await updatePayment.mutateAsync(newPaid);
    closePaymentSheet();
  }

  async function handleAddNote() {
    const trimmed = noteInput.trim();
    if (!trimmed) return;
    await createNote.mutateAsync(trimmed);
    setNoteInput('');
    setShowNoteForm(false);
  }

  async function handleDeleteNote(noteId: string) {
    if (!confirm('Supprimer cette note ?')) return;
    await deleteNote.mutateAsync(noteId);
  }

  function openInvoiceSheet() {
    setInvoiceTaxRate(shop?.default_tax_rate ?? '0');
    setInvoiceTermsDays(String(shop?.default_payment_terms_days ?? 30));
    setInvoiceNotes('');
    setInvoiceError(null);
    setShowInvoiceSheet(true);
  }

  async function handleIssueInvoice() {
    if (!order) return;
    setInvoiceError(null);
    try {
      const invoice = await issueInvoice.mutateAsync({
        order_id: order.id,
        tax_rate: invoiceTaxRate || undefined,
        payment_terms_days: invoiceTermsDays ? Number(invoiceTermsDays) : undefined,
        notes: invoiceNotes,
      });
      setShowInvoiceSheet(false);
      router.push(`/invoices/${invoice.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const existingId = (err.data as { existing_id?: string } | null)?.existing_id;
        if (existingId) {
          setShowInvoiceSheet(false);
          router.push(`/invoices/${existingId}`);
          return;
        }
      }
      setInvoiceError(
        err instanceof Error ? err.message : 'Erreur lors de l\'émission de la facture.',
      );
    }
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

        {/* Hero Card */}
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

        {/* Actions client rapides */}
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

        {/* Prochaine étape */}
        {nextStep && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 flex flex-col gap-3 shadow-sm">
            <div className="flex items-start gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${nextStep.accent}`}>
                {nextStep.icon}
              </span>
              <div className="flex flex-col gap-0.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Prochaine étape</p>
                <p className="text-sm font-semibold text-zinc-900">{nextStep.title}</p>
                <p className="text-xs text-zinc-500">{nextStep.subtitle}</p>
              </div>
            </div>
            <Button
              onClick={() => handleTransition(nextStep.next)}
              disabled={transition.isPending}
              className={`w-full inline-flex items-center justify-center gap-2 ${nextStep.btnClass}`}
            >
              {nextStep.cta}
              <ArrowRight size={16} />
            </Button>
          </div>
        )}

        {order.status === 'shipped' && (
          <div className="rounded-2xl border border-green-100 bg-green-50 p-4 flex items-center gap-3">
            <CheckCircle2 className="text-green-600 shrink-0" size={22} />
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-semibold text-green-800">Commande expédiée</p>
              <p className="text-xs text-green-700/80">Toutes les étapes sont terminées.</p>
            </div>
          </div>
        )}

        {/* Articles */}
        <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Articles
            </h2>
            <span className="text-xs text-zinc-400 tabular-nums">
              {itemCount} {itemCount > 1 ? 'unités' : 'unité'}
            </span>
          </div>
          {order.items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-zinc-400">Aucun article.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700 tabular-nums">
                    ×{item.quantity}
                  </span>
                  <div className="flex flex-1 flex-col min-w-0 gap-0.5">
                    <span className="text-sm font-medium text-zinc-900 truncate">{item.product_name}</span>
                    <span className="text-xs text-zinc-400 tabular-nums">{parseFloat(item.unit_price).toFixed(2)} €/u</span>
                  </div>
                  <span className="text-sm font-semibold text-zinc-900 tabular-nums shrink-0">
                    {parseFloat(item.line_total).toFixed(2)} €
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!hasAdjustments && order.items.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 bg-zinc-50/60 border-t border-zinc-100">
              <span className="text-sm font-semibold text-zinc-900">Total</span>
              <span className="text-base font-bold text-zinc-900 tabular-nums">
                {totalAmount.toFixed(2)} €
              </span>
            </div>
          )}
        </div>

        {/* Résumé conditionnel — uniquement si remise ou livraison */}
        {hasAdjustments && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 flex flex-col gap-2 shadow-sm">
            <div className="flex justify-between text-sm text-zinc-500">
              <span>Sous-total</span>
              <span className="tabular-nums">{subtotalAmount.toFixed(2)} €</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-zinc-500">
                <span>Remise</span>
                <span className="tabular-nums">− {discountAmount.toFixed(2)} €</span>
              </div>
            )}
            {shippingAmount > 0 && (
              <div className="flex justify-between text-sm text-zinc-500">
                <span>Livraison</span>
                <span className="tabular-nums">+ {shippingAmount.toFixed(2)} €</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-zinc-900 pt-2 border-t border-zinc-100">
              <span>Total</span>
              <span className="tabular-nums">{totalAmount.toFixed(2)} €</span>
            </div>
          </div>
        )}

        {/* Paiement */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 flex flex-col gap-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <Wallet size={14} />
              Paiement
            </h2>
            <span className={`text-sm font-semibold ${PAYMENT_COLOR[order.payment_status] ?? ''}`}>
              {order.payment_status_display}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-end justify-between">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-zinc-900 tabular-nums">
                  {paidAmount.toFixed(2)} €
                </span>
                <span className="text-sm text-zinc-400 tabular-nums">
                  / {totalAmount.toFixed(2)} €
                </span>
              </div>
              <span className="text-xs font-medium text-zinc-500 tabular-nums">
                {paymentProgress}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  order.payment_status === 'paid' ? 'bg-green-500'
                  : order.payment_status === 'partial' ? 'bg-amber-500'
                  : 'bg-zinc-300'
                }`}
                style={{ width: `${paymentProgress}%` }}
              />
            </div>
            {parseFloat(remaining) > 0 && (
              <p className="text-xs font-medium text-red-500 tabular-nums">
                Reste à payer : {remaining} €
              </p>
            )}
          </div>

          {order.status !== 'cancelled' && (
            parseFloat(remaining) > 0 ? (
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white inline-flex items-center justify-center gap-2"
                onClick={() => openPaymentSheet(parseFloat(remaining))}
                disabled={updatePayment.isPending}
              >
                <CreditCard size={16} />
                Encaisser un paiement
              </Button>
            ) : (
              <button
                type="button"
                onClick={() => openPaymentSheet(0)}
                className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 py-1"
              >
                <Pencil size={12} />
                Corriger un paiement reçu
              </button>
            )
          )}
        </div>

        {/* Facturation */}
        {order.status !== 'cancelled' && order.items.length > 0 && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 flex flex-col gap-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <Receipt size={14} />
                Facturation
              </h2>
              {order.invoice && (
                <span className="text-xs font-medium text-zinc-500">N° {order.invoice.number}</span>
              )}
            </div>

            {order.invoice ? (
              <Link
                href={`/invoices/${order.invoice.id}`}
                className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 hover:border-primary/40 transition-colors"
              >
                <CheckCircle2 className="text-green-600 shrink-0" size={18} />
                <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                  <p className="text-sm font-medium text-zinc-900">
                    Facture {order.invoice.status === 'paid' ? 'payée' : order.invoice.status === 'cancelled' ? 'annulée' : 'émise'}
                  </p>
                  <p className="text-xs text-zinc-500">Voir le détail et télécharger le PDF.</p>
                </div>
                <ArrowRight size={16} className="text-zinc-400 shrink-0" />
              </Link>
            ) : (
              <Button
                onClick={openInvoiceSheet}
                disabled={issueInvoice.isPending}
                className="w-full inline-flex items-center justify-center gap-2"
              >
                <Receipt size={16} />
                Émettre une facture
              </Button>
            )}
          </div>
        )}

        {/* Notes */}
        <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
            <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <StickyNote size={14} />
              Notes
              {notesData && notesData.count > 0 && (
                <span className="text-zinc-400 normal-case font-normal tracking-normal">
                  ({notesData.count})
                </span>
              )}
            </h2>
            {!showNoteForm && (
              <button
                type="button"
                onClick={() => setShowNoteForm(true)}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus size={13} />
                Ajouter
              </button>
            )}
          </div>

          {showNoteForm && (
            <div className="p-3 border-b border-zinc-100 flex flex-col gap-2">
              <FloatingTextarea
                id="note-content"
                label="Nouvelle note"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                rows={3}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={handleAddNote}
                  disabled={createNote.isPending || !noteInput.trim()}
                >
                  {createNote.isPending ? 'Enregistrement…' : 'Enregistrer'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setShowNoteForm(false); setNoteInput(''); }}
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}

          {notesData?.results.length ? (
            <ul className="divide-y divide-zinc-100">
              {notesData.results.map((note) => (
                <li key={note.id} className="px-4 py-3 flex flex-col gap-1.5">
                  <p className="text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed">
                    {note.content}
                  </p>
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>
                      {note.author_name ?? 'Anonyme'} · <span title={FULL_FMT.format(new Date(note.created_at))}>{relativeTime(note.created_at)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteNote(note.id)}
                      aria-label="Supprimer la note"
                      className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : !showNoteForm && (
            <p className="px-4 py-6 text-center text-sm text-zinc-400">
              Aucune note pour cette commande.
            </p>
          )}
        </div>

        {/* Timeline d'activité */}
        {activityData && activityData.events.length > 0 && (
          <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-zinc-100">
              <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <History size={14} />
                Activité
              </h2>
            </div>
            <ol className="divide-y divide-zinc-100">
              {activityData.events.map((event) => {
                const disp = describeEvent(event);
                return (
                  <li key={event.id} className="flex items-start gap-3 px-4 py-3">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${disp.iconBg}`}>
                      {disp.icon}
                    </span>
                    <div className="flex flex-1 flex-col min-w-0 gap-0.5">
                      <p className="text-sm font-medium text-zinc-900">{disp.title}</p>
                      {disp.body && (
                        <p className="text-xs text-zinc-500 whitespace-pre-wrap wrap-break-word">{disp.body}</p>
                      )}
                      <p className="text-xs text-zinc-400">
                        {event.actor_name ? `${event.actor_name} · ` : ''}
                        <span title={FULL_FMT.format(new Date(event.occurred_at))}>
                          {relativeTime(event.occurred_at)}
                        </span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {/* Retour arrière (avant la zone destructive) */}
        {REVERT_TRANSITION[order.status] && (
          <button
            onClick={() => handleTransition(REVERT_TRANSITION[order.status].status)}
            disabled={transition.isPending}
            className="text-xs text-muted-foreground underline underline-offset-2 text-center py-1 disabled:opacity-40"
          >
            ↩ {REVERT_TRANSITION[order.status].label}
          </button>
        )}

        {/* Zone destructive */}
        {canCancel && (
          <div className="mt-4 pt-4 border-t border-zinc-200 flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Zone sensible
            </p>
            <Button
              variant="outline"
              className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 inline-flex items-center justify-center gap-2"
              onClick={() => handleTransition('cancelled')}
              disabled={transition.isPending}
            >
              <XCircle size={16} />
              Annuler la commande
            </Button>
            <p className="text-xs text-zinc-400 px-1">
              Le stock réservé sera libéré. Cette action est réversible.
            </p>
          </div>
        )}
      </div>

      {/* BottomSheet de paiement */}
      <BottomSheet open={showPaymentSheet} onClose={closePaymentSheet} title="Encaisser un paiement">
        {(() => {
          const val = parseFloat(amountInput) || 0;
          const isNeg = val < 0;
          const remainingNum = parseFloat(remaining);
          const newPaid = Math.max(0, paidAmount + val);
          const newRemaining = Math.max(0, totalAmount - newPaid);

          const chips: { label: string; sub?: string; value: number }[] = [];
          if (remainingNum > 0) {
            chips.push({ label: 'Solde', sub: `${remainingNum.toFixed(2)} €`, value: remainingNum });
            if (remainingNum > 1) {
              const half = Math.round((remainingNum / 2) * 100) / 100;
              chips.push({ label: 'Moitié', sub: `${half.toFixed(2)} €`, value: half });
            }
          }
          for (const v of [10, 20, 50]) {
            if (remainingNum <= 0 || v < remainingNum) chips.push({ label: `${v} €`, value: v });
          }

          return (
            <div className="flex flex-col gap-5">
              {/* Big amount display */}
              <div className="flex flex-col items-center gap-1">
                {editAmount ? (
                  <input
                    autoFocus
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    onBlur={() => setEditAmount(false)}
                    className={`w-full text-center text-5xl font-bold tabular-nums bg-transparent border-b-2 border-zinc-200 focus:border-zinc-900 outline-none py-2 ${isNeg ? 'text-red-500' : 'text-zinc-900'}`}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditAmount(true)}
                    className={`text-5xl font-bold tabular-nums py-2 inline-flex items-center gap-2 ${isNeg ? 'text-red-500' : 'text-zinc-900'}`}
                  >
                    {val.toFixed(2)} €
                    <Pencil size={16} className="text-zinc-400" />
                  </button>
                )}
                <p className="text-xs text-zinc-500 tabular-nums">
                  Reste après : <span className="font-semibold text-zinc-700">{newRemaining.toFixed(2)} €</span>
                </p>
              </div>

              {/* Quick chips */}
              {chips.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center">
                  {chips.map((chip) => {
                    const selected = Math.abs(val - chip.value) < 0.01;
                    return (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => {
                          setAmountInput(chip.value % 1 === 0 ? String(chip.value) : chip.value.toFixed(2));
                          setEditAmount(false);
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold tabular-nums transition-colors ${
                          selected
                            ? 'bg-zinc-900 text-white'
                            : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                        }`}
                      >
                        {chip.label}{chip.sub && <span className="opacity-70 font-normal"> · {chip.sub}</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* CTA */}
              <Button
                className={`w-full inline-flex items-center justify-center gap-2 ${
                  isNeg ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
                onClick={handleSubmitPayment}
                disabled={updatePayment.isPending || val === 0 || Number.isNaN(val)}
              >
                {updatePayment.isPending
                  ? 'Enregistrement…'
                  : isNeg
                    ? `Corriger −${Math.abs(val).toFixed(2)} €`
                    : `Encaisser ${val.toFixed(2)} €`}
              </Button>

              {remainingNum <= 0 && !isNeg && (
                <p className="text-xs text-zinc-400 text-center">
                  La commande est déjà soldée. Utilisez un montant négatif pour corriger un paiement reçu.
                </p>
              )}
            </div>
          );
        })()}
      </BottomSheet>

      {/* BottomSheet émission facture */}
      <BottomSheet
        open={showInvoiceSheet}
        onClose={() => setShowInvoiceSheet(false)}
        title="Émettre une facture"
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs text-zinc-500">
            Les valeurs par défaut viennent des paramètres boutique. Ajustez-les si besoin pour
            cette facture.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <FloatingInput
              id="invoice-tax-rate"
              label="Taux TVA"
              type="number"
              step="0.01"
              min="0"
              max="100"
              inputMode="decimal"
              suffix="%"
              value={invoiceTaxRate}
              onChange={(e) => setInvoiceTaxRate(e.target.value)}
            />
            <FloatingInput
              id="invoice-terms-days"
              label="Délai de paiement"
              type="number"
              step="1"
              min="0"
              inputMode="numeric"
              suffix="jours"
              value={invoiceTermsDays}
              onChange={(e) => setInvoiceTermsDays(e.target.value)}
            />
          </div>
          <FloatingTextarea
            id="invoice-notes"
            label="Notes (optionnel)"
            value={invoiceNotes}
            onChange={(e) => setInvoiceNotes(e.target.value)}
            rows={3}
          />
          {invoiceError && (
            <p className="text-xs text-destructive">{invoiceError}</p>
          )}
          <Button
            onClick={handleIssueInvoice}
            disabled={issueInvoice.isPending}
            className="w-full inline-flex items-center justify-center gap-2"
          >
            <Receipt size={16} />
            {issueInvoice.isPending ? 'Émission…' : 'Émettre la facture'}
          </Button>
          <p className="text-[11px] text-zinc-400 text-center">
            Une fois émise, la facture est immuable. Seul le statut peut être modifié.
          </p>
        </div>
      </BottomSheet>
    </>
  );
}
