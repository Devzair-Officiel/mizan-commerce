'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Phone, Mail, MapPin, CreditCard, ShoppingBag,
  Bell, PowerOff, UserPen, FileText, X, Copy, Navigation, ClipboardPlus,
} from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useCustomer, useDeactivateCustomer, useReactivateCustomer } from '@/lib/hooks/useCustomers';
import { useCustomerOrdersInfinite } from '@/lib/hooks/useOrders';
import { useCreateReminder } from '@/lib/hooks/useReminders';
const STATUS_LABEL: Record<string, string> = {
  draft:      'Brouillon',
  to_prepare: 'À préparer',
  prepared:   'Préparée',
  shipped:    'Expédiée',
  cancelled:  'Annulée',
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

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: customer, isLoading } = useCustomer(id);
  const createReminder = useCreateReminder();
  const deactivate = useDeactivateCustomer();
  const reactivate = useReactivateCustomer();
  const todayKey = `relance_${id}_${new Date().toISOString().slice(0, 10)}`;
  const [relanceCreated, setRelanceCreated] = useState(() => {
    try { return localStorage.getItem(todayKey) === '1'; } catch { return false; }
  });
  const [flashVisible, setFlashVisible] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showAddress, setShowAddress] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [paymentFilter, setPaymentFilter] = useState<string | null>(null);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const {
    data: ordersData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useCustomerOrdersInfinite(id, { status: statusFilter, payment_status: paymentFilter });

  function handleCopyAddress() {
    const addr = [customer?.address_line, customer?.city, customer?.postal_code].filter(Boolean).join(', ');
    navigator.clipboard.writeText(addr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleDeactivate() {
    if (!confirm('Désactiver ce client ? Il n\'apparaîtra plus dans la liste.')) return;
    await deactivate.mutateAsync(id);
    router.push('/customers');
  }

  async function handleMarquerRelancer() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await createReminder.mutateAsync({
      title: `Relancer ${customer?.name ?? 'le client'}`,
      due_at: tomorrow.toISOString(),
      category: 'customer_followup',
      customer: id,
    });
    setRelanceCreated(true);
    setFlashVisible(true);
    setTimeout(() => setFlashVisible(false), 3000);
    try { localStorage.setItem(todayKey, '1'); } catch { /* ignore */ }
  }

  if (isLoading) return <><TopBar title="Client" /><p className="p-4 text-sm text-muted-foreground">Chargement…</p></>;
  if (!customer) return <><TopBar title="Client" /><p className="p-4 text-sm text-red-500">Client introuvable.</p></>;

  const hasPending = parseFloat(customer.pending_amount) > 0;
  const waPhone = customer.phone?.replace(/\D/g, '');

  return (
    <>
      <TopBar title={customer.name} />

      {/* Flash notification */}
      <div
        className="fixed left-4 right-4 z-50 transition-all duration-300"
        style={{
          top: flashVisible ? '72px' : '56px',
          opacity: flashVisible ? 1 : 0,
          pointerEvents: 'none',
        }}
      >
        <div
          className="flex items-center gap-3 rounded-2xl px-4 py-3 shadow-xl backdrop-blur-sm"
          style={{ background: 'color-mix(in oklch, var(--primary) 78%, transparent)' }}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
            <Bell size={16} className="text-primary-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-primary-foreground">Rappel créé</p>
            <p className="text-xs text-primary-foreground/75">Demain à 9h00 — {customer.name}</p>
          </div>
          <button
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-primary-foreground"
            style={{ pointerEvents: 'auto' }}
            onClick={() => setFlashVisible(false)}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-4 p-4">

        {/* Hero card */}
        <div
          className="relative rounded-3xl p-6 flex flex-col items-center gap-3"
          style={{ background: 'color-mix(in oklch, var(--primary) 10%, transparent)' }}
        >
          <button
            onClick={handleMarquerRelancer}
            disabled={createReminder.isPending || relanceCreated}
            className="absolute top-4 left-4"
          >
            <div className={`flex h-11 w-11 items-center justify-center rounded-full active:scale-95 transition-transform ${relanceCreated ? 'bg-green-100 text-green-600' : 'bg-primary/15 text-primary'}`}>
              <Bell size={21} />
            </div>
          </button>
          <Link href={`/customers/${id}/edit`} className="absolute top-4 right-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary active:scale-95 transition-transform">
              <UserPen size={21} />
            </div>
          </Link>
          {/* Avatar */}
          <div
            className="flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold text-primary-foreground shadow-lg ring-4 ring-background"
            style={{ background: 'var(--primary)' }}
          >
            {getInitials(customer.name)}
          </div>

          {/* Nom */}
          <div className="text-center">
            <p className="text-3xl font-bold text-foreground capitalize">{customer.name}</p>
          </div>

          {/* Boutons contact rapide */}
          <div className="flex w-full mt-1">
            {customer.phone && (
              <ContactButton href={`tel:${customer.phone}`} label="Appel">
                <Phone size={20} />
              </ContactButton>
            )}
            {customer.email && (
              <ContactButton href={`mailto:${customer.email}`} label="Email">
                <Mail size={20} />
              </ContactButton>
            )}
            {customer.city && (
              <button onClick={() => setShowAddress(true)} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex items-center justify-center rounded-full text-primary-foreground shadow-md active:scale-95 transition-transform" style={{ background: 'var(--primary)', width: 'clamp(40px, 11vw, 52px)', height: 'clamp(40px, 11vw, 52px)' }}>
                  <MapPin size={20} />
                </div>
                <span className="text-xs text-muted-foreground">Adresse</span>
              </button>
            )}
            {waPhone && (
              <ContactButton href={`https://wa.me/${waPhone}`} label="WhatsApp">
                <WhatsAppIcon />
              </ContactButton>
            )}
            {customer.notes && (
              <button onClick={() => setShowNotes(true)} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex items-center justify-center rounded-full text-primary-foreground shadow-md active:scale-95 transition-transform" style={{ background: 'var(--primary)', width: 'clamp(40px, 11vw, 52px)', height: 'clamp(40px, 11vw, 52px)' }}>
                  <FileText size={20} />
                </div>
                <span className="text-xs text-muted-foreground">Notes</span>
              </button>
            )}
          </div>
        </div>

        {/* Bottom sheet — Notes */}
        <BottomSheet open={showNotes} onClose={() => setShowNotes(false)} title="Notes">
          <p className="text-sm text-foreground leading-relaxed">{customer.notes}</p>
        </BottomSheet>

        {/* Bottom sheet — Adresse */}
        <BottomSheet open={showAddress} onClose={() => setShowAddress(false)} title="Adresse">
          <p className="text-sm text-foreground mb-4">
            {[customer.address_line, customer.postal_code, customer.city].filter(Boolean).join(', ')}
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleCopyAddress}
              className="flex items-center gap-3 w-full rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm font-medium text-foreground active:scale-95 transition-transform"
            >
              <Copy size={18} className="text-primary shrink-0" />
              {copied ? 'Copié ✓' : 'Copier l\'adresse'}
            </button>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent([customer.address_line, customer.postal_code, customer.city].filter(Boolean).join(', '))}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShowAddress(false)}
              className="flex items-center gap-3 w-full rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm font-medium text-foreground active:scale-95 transition-transform"
            >
              <Navigation size={18} className="text-primary shrink-0" />
              Ouvrir dans Maps
            </a>
          </div>
        </BottomSheet>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">En attente</p>
              <div className={`flex h-7 w-7 items-center justify-center rounded-xl ${hasPending ? 'bg-red-100' : 'bg-primary/10'}`}>
                <CreditCard size={14} className={hasPending ? 'text-red-500' : 'text-primary'} />
              </div>
            </div>
            <p className={`text-2xl font-bold ${hasPending ? 'text-red-500' : 'text-foreground'}`}>
              {parseFloat(customer.pending_amount).toFixed(2)} €
            </p>
          </div>

          <Link
            href={`/orders/new?customer=${id}`}
            className="rounded-2xl border border-primary/30 bg-primary/10 p-4 flex flex-col gap-2 active:scale-95 transition-transform"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-primary">Nouvelle</p>
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow">
                <ClipboardPlus size={14} />
              </div>
            </div>
            <p className="text-3xl font-bold text-primary">+</p>
          </Link>
        </div>

        {/* Historique commandes */}
        {(() => {
          const allOrders = ordersData?.pages.flatMap(p => p.results) ?? [];
          const totalCount = ordersData?.pages[0]?.count ?? 0;
          const hasActiveFilter = statusFilter !== null || paymentFilter !== null;
          return (
            <div className="rounded-2xl border border-border bg-card">

              {/* Header */}
              <div className="flex items-center justify-between px-4 pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <ShoppingBag size={15} className="text-muted-foreground" />
                  <h2 className="font-semibold text-sm text-foreground">Historique</h2>
                  {totalCount > 0 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {totalCount}
                    </span>
                  )}
                </div>
                {hasActiveFilter && (
                  <button
                    onClick={() => { setStatusFilter(null); setPaymentFilter(null); setShowStatusPicker(false); setShowPaymentPicker(false); }}
                    className="flex items-center gap-1 text-xs text-primary font-medium"
                  >
                    <X size={12} />
                    Effacer
                  </button>
                )}
              </div>

              {/* Filtres */}
              <div className="flex gap-2 px-4 pb-3">
                {/* Statut picker */}
                <div className="relative flex-1">
                  <button
                    onClick={() => { setShowStatusPicker(v => !v); setShowPaymentPicker(false); }}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                      statusFilter ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground'
                    }`}
                  >
                    <span>{statusFilter ? (STATUS_LABEL[statusFilter] ?? statusFilter) : 'Statut'}</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`shrink-0 transition-transform ${showStatusPicker ? 'rotate-180' : ''}`}>
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  {showStatusPicker && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowStatusPicker(false)} />
                      <div className="absolute left-0 top-full mt-1 z-20 w-40 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                        {([
                          { key: null,         label: 'Tous' },
                          { key: 'draft',      label: 'Brouillon' },
                          { key: 'to_prepare', label: 'À préparer' },
                          { key: 'prepared',   label: 'Préparé' },
                          { key: 'shipped',    label: 'Expédié' },
                          { key: 'cancelled',  label: 'Annulé' },
                        ] as { key: string | null; label: string }[]).map(({ key, label }) => (
                          <button
                            key={String(key)}
                            onClick={() => { setStatusFilter(key); setShowStatusPicker(false); }}
                            className={`flex w-full items-center justify-between px-3 py-2.5 text-xs transition-colors ${
                              statusFilter === key ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground hover:bg-muted'
                            }`}
                          >
                            {label}
                            {statusFilter === key && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Paiement picker */}
                <div className="relative flex-1">
                  <button
                    onClick={() => { setShowPaymentPicker(v => !v); setShowStatusPicker(false); }}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                      paymentFilter === 'unpaid'  ? 'border-red-200 bg-red-50 text-red-500' :
                      paymentFilter === 'partial' ? 'border-amber-200 bg-amber-50 text-amber-600' :
                      paymentFilter === 'paid'    ? 'border-green-200 bg-green-50 text-green-600' :
                      'border-border bg-muted text-muted-foreground'
                    }`}
                  >
                    <span>{paymentFilter ? (PAYMENT_LABEL[paymentFilter] ?? paymentFilter) : 'Paiement'}</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`shrink-0 transition-transform ${showPaymentPicker ? 'rotate-180' : ''}`}>
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  {showPaymentPicker && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowPaymentPicker(false)} />
                      <div className="absolute right-0 top-full mt-1 z-20 w-36 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                        {([
                          { key: null,      label: 'Tous',     dot: '' },
                          { key: 'unpaid',  label: 'Non payé', dot: 'bg-red-500' },
                          { key: 'partial', label: 'Partiel',  dot: 'bg-amber-500' },
                          { key: 'paid',    label: 'Payé',     dot: 'bg-green-500' },
                        ] as { key: string | null; label: string; dot: string }[]).map(({ key, label, dot }) => (
                          <button
                            key={String(key)}
                            onClick={() => { setPaymentFilter(key); setShowPaymentPicker(false); }}
                            className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-xs transition-colors ${
                              paymentFilter === key ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground hover:bg-muted'
                            }`}
                          >
                            {dot && <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />}
                            {!dot && <span className="h-2 w-2 shrink-0" />}
                            {label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="border-t border-border overflow-hidden rounded-b-2xl">
                {!allOrders.length ? (
                  <p className="text-sm text-muted-foreground px-4 py-4">Aucune commande.</p>
                ) : (
                  <div className="flex flex-col divide-y divide-border">
                    {allOrders.map((order) => (
                      <Link key={order.id} href={`/orders/${order.id}`} className="flex items-center justify-between px-4 py-3 active:bg-muted transition-colors">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium text-foreground">{order.order_number}</span>
                          <span className="text-xs text-muted-foreground">{STATUS_LABEL[order.status] ?? order.status}</span>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-sm font-semibold text-foreground">{parseFloat(order.total_amount).toFixed(2)} €</span>
                          <span className={`text-xs font-medium ${PAYMENT_COLOR[order.payment_status] ?? ''}`}>
                            {PAYMENT_LABEL[order.payment_status] ?? order.payment_status}
                          </span>
                        </div>
                      </Link>
                    ))}
                    {hasNextPage && (
                      <button
                        onClick={() => fetchNextPage()}
                        disabled={isFetchingNextPage}
                        className="w-full py-3 text-xs font-medium text-primary transition-colors active:bg-muted"
                      >
                        {isFetchingNextPage ? 'Chargement…' : `Voir plus (${totalCount - allOrders.length} restantes)`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {customer.is_active ? (
          <Button
            variant="outline"
            className="w-full gap-2 text-red-500 border-red-200"
            onClick={handleDeactivate}
            disabled={deactivate.isPending}
          >
            <PowerOff size={18} />
            {deactivate.isPending ? 'Désactivation…' : 'Désactiver le client'}
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full gap-2 text-green-600 border-green-200"
            onClick={() => reactivate.mutateAsync(id)}
            disabled={reactivate.isPending}
          >
            <PowerOff size={18} />
            {reactivate.isPending ? 'Réactivation…' : 'Réactiver le client'}
          </Button>
        )}

      </div>
    </>
  );
}

function ContactButton({ href, label, children }: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="flex flex-1 flex-col items-center gap-1.5"
      target={href.startsWith('http') ? '_blank' : undefined}
      rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
    >
      <div
        className="flex items-center justify-center rounded-full text-primary-foreground shadow-md active:scale-95 transition-transform"
        style={{ background: 'var(--primary)', width: 'clamp(40px, 11vw, 52px)', height: 'clamp(40px, 11vw, 52px)' }}
      >
        {children}
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </a>
  );
}
