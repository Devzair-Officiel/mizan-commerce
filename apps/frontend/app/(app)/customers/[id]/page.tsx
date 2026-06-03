'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Phone, Mail, MapPin, CreditCard, ShoppingBag,
  Bell, PowerOff, UserPen, FileText, X, Copy, Navigation, ClipboardPlus, MoreHorizontal,
  Truck, History, CheckCircle2,
} from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import {
  useCustomer, useDeactivateCustomer, useReactivateCustomer,
  useCustomerActivityInfinite,
  type ActivityEvent, type ActivityType,
} from '@/lib/hooks/useCustomers';
import { useCreateReminder } from '@/lib/hooks/useReminders';
const PAYMENT_TITLE: Record<string, string> = {
  unpaid:  'Paiement en attente',
  partial: 'Paiement partiel',
  paid:    'Paiement reçu',
};

const PAYMENT_TONE: Record<string, string> = {
  unpaid:  'bg-red-500/10 text-red-500 dark:text-red-400',
  partial: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  paid:    'bg-green-500/10 text-green-600 dark:text-green-400',
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
  const [showMore, setShowMore] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityType | null>(null);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [nowMs] = useState(() => Date.now());

  const customerBadge = useMemo<{ label: string; classes: string } | null>(() => {
    if (!customer) return null;
    if (parseFloat(customer.pending_amount) > 0) {
      return {
        label: 'À relancer',
        classes: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 border border-amber-400/20',
      };
    }
    const daysSinceCreated = (nowMs - new Date(customer.created_at).getTime()) / 86_400_000;
    if (daysSinceCreated < 30 && customer.order_count === 0) {
      return {
        label: 'Nouveau client',
        classes: 'bg-primary/10 text-primary border border-primary/20',
      };
    }
    if (customer.order_count >= 3) {
      return {
        label: 'Client régulier',
        classes: 'bg-muted text-muted-foreground border border-border',
      };
    }
    return null;
  }, [customer, nowMs]);
  const {
    data: activityData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isActivityLoading,
  } = useCustomerActivityInfinite(id, activityFilter, pendingOnly);

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
      {/* Bottom sheet — Actions client */}
      <BottomSheet open={showMore} onClose={() => setShowMore(false)} title="Actions client">
        <div className="flex flex-col gap-1.5">
          {customer.email && (
            <ActionRow
              icon={<Mail size={18} />}
              label="Email"
              description={customer.email}
              onClick={() => { setShowMore(false); window.location.href = `mailto:${customer.email}`; }}
            />
          )}
          {customer.city && (
            <ActionRow
              icon={<MapPin size={18} />}
              label="Adresse"
              description={[customer.address_line, customer.city].filter(Boolean).join(', ')}
              onClick={() => { setShowMore(false); setShowAddress(true); }}
            />
          )}
          {customer.notes && (
            <ActionRow
              icon={<FileText size={18} />}
              label="Notes"
              onClick={() => { setShowMore(false); setShowNotes(true); }}
            />
          )}
          <ActionRow
            icon={<Bell size={18} />}
            label={relanceCreated ? 'Rappel créé aujourd’hui' : 'Programmer un rappel'}
            description={relanceCreated ? undefined : 'Demain à 9h00'}
            onClick={async () => { await handleMarquerRelancer(); setShowMore(false); }}
            disabled={createReminder.isPending || relanceCreated}
            tone={relanceCreated ? 'success' : 'default'}
          />
          <ActionRow
            icon={<UserPen size={18} />}
            label="Modifier la fiche"
            onClick={() => { setShowMore(false); router.push(`/customers/${id}/edit`); }}
          />
        </div>

        <div className="mt-3 pt-3 border-t border-border">
          {customer.is_active ? (
            <ActionRow
              icon={<PowerOff size={18} />}
              label="Désactiver le client"
              description="Le client n’apparaîtra plus dans la liste"
              onClick={async () => { setShowMore(false); await handleDeactivate(); }}
              disabled={deactivate.isPending}
              tone="danger"
            />
          ) : (
            <ActionRow
              icon={<PowerOff size={18} />}
              label="Réactiver le client"
              onClick={async () => { setShowMore(false); await reactivate.mutateAsync(id); }}
              disabled={reactivate.isPending}
              tone="success"
            />
          )}
        </div>
      </BottomSheet>

      <div className="flex flex-col gap-5 p-4">

        {/* Hero card */}
        <div
          className="rounded-3xl p-5 flex flex-col items-center gap-2"
          style={{ background: 'color-mix(in oklch, var(--primary) 7%, transparent)' }}
        >
          {/* Avatar */}
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-primary-foreground shadow-md ring-2 ring-background"
            style={{ background: 'var(--primary)' }}
          >
            {getInitials(customer.name)}
          </div>

          {/* Nom + tag */}
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-2xl font-semibold text-foreground capitalize">{customer.name}</p>
            {customerBadge && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${customerBadge.classes}`}>
                {customerBadge.label}
              </span>
            )}
          </div>

          {/* Barre d'actions — WhatsApp dominant + Appel + Plus */}
          <div className="flex w-full items-center gap-2 mt-2">
            {waPhone && (
              <a
                href={`https://wa.me/${waPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-2 h-12 rounded-full text-primary-foreground shadow-md active:scale-95 transition-transform"
                style={{ background: 'var(--primary)' }}
              >
                <WhatsAppIcon />
                <span className="text-sm font-semibold">WhatsApp</span>
              </a>
            )}
            {customer.phone && (
              <a
                href={`tel:${customer.phone}`}
                aria-label="Appeler"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary active:scale-95 transition-transform"
              >
                <Phone size={20} />
              </a>
            )}
            <button
              type="button"
              onClick={() => setShowMore(true)}
              aria-label="Plus d'actions"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary active:scale-95 transition-transform"
            >
              <MoreHorizontal size={22} />
            </button>
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

        {/* Cartes métier */}
        <div className="grid grid-cols-2 gap-3">
          {/* À encaisser — info / filtre */}
          {hasPending ? (
            <button
              type="button"
              onClick={() => setPendingOnly((v) => !v)}
              aria-pressed={pendingOnly}
              className={`rounded-2xl border bg-card p-4 flex flex-col gap-2 text-left transition-all active:scale-[0.98] ${
                pendingOnly
                  ? 'border-amber-400/60 ring-2 ring-amber-400/30'
                  : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">À encaisser</p>
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300">
                  <CreditCard size={14} />
                </div>
              </div>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {parseFloat(customer.pending_amount).toFixed(2)} €
              </p>
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                {pendingOnly ? 'Filtre actif — re-touche pour tout voir' : 'Touche pour filtrer'}
              </p>
            </button>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">À encaisser</p>
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-green-500/10 text-green-600 dark:text-green-400">
                  <CheckCircle2 size={14} />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {parseFloat(customer.pending_amount).toFixed(2)} €
              </p>
              <p className="text-xs font-medium text-green-600 dark:text-green-400">
                À jour
              </p>
            </div>
          )}

          {/* Nouvelle commande — CTA */}
          <Link
            href={`/orders/new?customer=${id}&from=/customers/${id}`}
            className="rounded-2xl bg-primary p-4 flex flex-col items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-transform"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/15 text-primary-foreground">
              <ClipboardPlus size={20} />
            </div>
            <p className="text-sm font-semibold text-primary-foreground">Nouvelle commande</p>
          </Link>
        </div>

        {/* Activité récente — timeline */}
        {(() => {
          const allItems = activityData?.pages.flatMap(p => p.results) ?? [];
          const totalCount = activityData?.pages[0]?.count ?? 0;
          const chips: { key: ActivityType | null; label: string }[] = [
            { key: null,       label: 'Tout' },
            { key: 'order',    label: 'Commandes' },
            { key: 'payment',  label: 'Paiements' },
            { key: 'shipment', label: 'Expéditions' },
            { key: 'note',     label: 'Notes' },
          ];
          return (
            <div className="rounded-2xl border border-border bg-card">
              {/* Header */}
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <div className="flex items-center gap-2">
                  <History size={15} className="text-muted-foreground" />
                  <h2 className="font-semibold text-sm text-foreground">Activité récente</h2>
                  {totalCount > 0 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {totalCount}
                    </span>
                  )}
                </div>
              </div>

              {/* Chips de filtre */}
              <div className="overflow-x-auto px-4 pb-3 -mx-px">
                <div className="flex gap-2 w-max">
                  {chips.map(({ key, label }) => {
                    const active = activityFilter === key;
                    return (
                      <button
                        key={String(key)}
                        type="button"
                        onClick={() => setActivityFilter(key)}
                        className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ease-out active:scale-[0.98] ${
                          active
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground active:bg-muted/70'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-border overflow-hidden rounded-b-2xl">
                {isActivityLoading ? (
                  <div className="flex flex-col divide-y divide-border">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <ActivitySkeletonRow key={i} />
                    ))}
                  </div>
                ) : !allItems.length ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <History size={20} />
                    </div>
                    <p className="text-sm font-medium text-foreground">Aucune activité</p>
                    <p className="text-xs text-muted-foreground">L’activité du client apparaîtra ici.</p>
                  </div>
                ) : (
                  <div className="flex flex-col divide-y divide-border">
                    {allItems.map((item) => (
                      <ActivityRow key={item.id} item={item} customerId={id} />
                    ))}
                    {hasNextPage && (
                      <button
                        onClick={() => fetchNextPage()}
                        disabled={isFetchingNextPage}
                        className="w-full py-3 text-xs font-medium text-primary transition-colors active:bg-muted"
                      >
                        {isFetchingNextPage ? 'Chargement…' : `Voir plus (${totalCount - allItems.length} restantes)`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      </div>
    </>
  );
}

const ACTIVITY_DATE_FMT = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function formatEventDate(iso: string): string {
  return ACTIVITY_DATE_FMT.format(new Date(iso));
}

function ActivityRow({ item, customerId }: { item: ActivityEvent; customerId: string }) {
  const date = formatEventDate(item.occurred_at);
  const fromQuery = `?from=/customers/${customerId}`;

  if (item.type === 'order') {
    return (
      <EventLink href={`/orders/${item.data.order_id}${fromQuery}`}>
        <EventIcon className="bg-primary/10 text-primary"><ShoppingBag size={16} /></EventIcon>
        <EventBody
          title="Commande créée"
          subtitle={`Commande ${item.data.order_number} · ${parseFloat(item.data.total_amount).toFixed(2)} €`}
          date={date}
        />
      </EventLink>
    );
  }

  if (item.type === 'payment') {
    const status = item.data.payment_status;
    return (
      <EventLink href={`/orders/${item.data.order_id}${fromQuery}`}>
        <EventIcon className={PAYMENT_TONE[status] ?? ''}><CreditCard size={16} /></EventIcon>
        <EventBody
          title={PAYMENT_TITLE[status] ?? 'Paiement'}
          subtitle={`${parseFloat(item.data.amount_paid).toFixed(2)} € · Commande ${item.data.order_number}`}
          date={date}
        />
      </EventLink>
    );
  }

  if (item.type === 'shipment') {
    return (
      <EventLink href={`/orders/${item.data.order_id}${fromQuery}`}>
        <EventIcon className="bg-blue-500/10 text-blue-600 dark:text-blue-400"><Truck size={16} /></EventIcon>
        <EventBody
          title="Expédition mise à jour"
          subtitle={`Commande ${item.data.order_number} · Expédiée`}
          date={date}
        />
      </EventLink>
    );
  }

  // note (exhaustive)
  const noteHref = item.data.order_id ? `/orders/${item.data.order_id}${fromQuery}` : null;
  const inner = (
    <>
      <EventIcon className="bg-muted text-muted-foreground"><FileText size={16} /></EventIcon>
      <EventBody
        title="Note ajoutée"
        subtitle={item.data.content}
        meta={item.data.author_name ?? undefined}
        date={date}
      />
    </>
  );
  return noteHref ? (
    <EventLink href={noteHref}>{inner}</EventLink>
  ) : (
    <div className="flex items-start gap-3 px-4 py-3">{inner}</div>
  );
}

function ActivitySkeletonRow() {
  return (
    <div className="flex items-start gap-3 px-4 py-3" aria-hidden>
      <div className="h-9 w-9 shrink-0 rounded-xl bg-muted animate-pulse mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="h-3.5 w-32 rounded bg-muted animate-pulse" />
        <div className="h-3 w-44 rounded bg-muted animate-pulse" />
      </div>
      <div className="h-3 w-12 rounded bg-muted animate-pulse mt-1" />
    </div>
  );
}

function EventLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-start gap-3 px-4 py-3 active:bg-muted transition-colors">
      {children}
    </Link>
  );
}

function EventIcon({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl mt-0.5 ${className}`}>
      {children}
    </div>
  );
}

function EventBody({
  title,
  subtitle,
  meta,
  date,
}: {
  title: string;
  subtitle: string;
  meta?: string;
  date: string;
}) {
  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="line-clamp-2 text-xs text-muted-foreground">
          {meta ? `${meta} · ` : ''}{subtitle}
        </span>
      </div>
      <span className="text-xs font-medium text-foreground/60 dark:text-foreground/55 shrink-0 mt-0.5">{date}</span>
    </>
  );
}

type ActionRowTone = 'default' | 'success' | 'danger';

function ActionRow({
  icon,
  label,
  description,
  onClick,
  disabled,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  tone?: ActionRowTone;
}) {
  const iconClasses =
    tone === 'danger'
      ? 'bg-red-500/10 text-red-500 dark:bg-red-500/15 dark:text-red-400'
      : tone === 'success'
        ? 'bg-green-500/10 text-green-600 dark:bg-green-500/15 dark:text-green-400'
        : 'bg-primary/10 text-primary';
  const labelClasses =
    tone === 'danger'
      ? 'text-red-500 dark:text-red-400'
      : tone === 'success'
        ? 'text-green-600 dark:text-green-400'
        : 'text-foreground';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors active:bg-muted disabled:opacity-60"
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClasses}`}>
        {icon}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`text-sm font-medium ${labelClasses}`}>{label}</span>
        {description && (
          <span className="truncate text-xs text-muted-foreground">{description}</span>
        )}
      </div>
    </button>
  );
}

