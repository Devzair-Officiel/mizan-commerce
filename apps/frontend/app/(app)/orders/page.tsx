'use client';

import { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Receipt, Plus, AlertCircle, Clock, ChevronRight } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { useOrders, type OrderSummary } from '@/lib/hooks/useOrders';

const STATUS_BAR: Record<string, string> = {
  draft:      'bg-zinc-300 dark:bg-zinc-600',
  to_prepare: 'bg-blue-500',
  prepared:   'bg-amber-500',
  shipped:    'bg-green-500',
  cancelled:  'bg-red-500',
};

const STATUS_TEXT: Record<string, string> = {
  draft:      'text-muted-foreground',
  to_prepare: 'text-blue-700 dark:text-blue-400',
  prepared:   'text-amber-700 dark:text-amber-400',
  shipped:    'text-green-700 dark:text-green-400',
  cancelled:  'text-red-600 dark:text-red-400',
};

const PAYMENT_LABEL: Record<string, string> = {
  unpaid:  'Non payé',
  partial: 'Partiel',
  paid:    'Payé',
};

const PAYMENT_COLOR: Record<string, string> = {
  unpaid:  'text-red-500 dark:text-red-400',
  partial: 'text-amber-600 dark:text-amber-400',
  paid:    'text-green-600 dark:text-green-400',
};

const STATUSES: { value: string; label: string; dot: string | null; activeClass: string }[] = [
  { value: '',           label: 'Toutes',     dot: null,           activeClass: 'bg-foreground text-background' },
  { value: 'draft',      label: 'Brouillons', dot: 'bg-zinc-400',  activeClass: 'bg-zinc-500 text-white' },
  { value: 'to_prepare', label: 'À préparer', dot: 'bg-blue-500',  activeClass: 'bg-blue-600 text-white' },
  { value: 'prepared',   label: 'Prêtes',     dot: 'bg-amber-500', activeClass: 'bg-amber-500 text-white' },
  { value: 'shipped',    label: 'Expédiées',  dot: 'bg-green-500', activeClass: 'bg-green-600 text-white' },
  { value: 'cancelled',  label: 'Annulées',   dot: 'bg-red-500',   activeClass: 'bg-red-600 text-white' },
];

type Bucket = 'today' | 'yesterday' | 'this_week' | 'older';

const BUCKET_LABEL: Record<Bucket, string> = {
  today:     "Aujourd'hui",
  yesterday: 'Hier',
  this_week: 'Cette semaine',
  older:     'Plus ancien',
};

const BUCKET_ORDER: Bucket[] = ['today', 'yesterday', 'this_week', 'older'];

function bucketOf(iso: string): Bucket {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOf = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.floor((startToday - startOf) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays <= 6) return 'this_week';
  return 'older';
}

const TIME_FMT = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const SHORT_DATE_FMT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

function rowDate(iso: string, bucket: Bucket): string {
  const d = new Date(iso);
  if (bucket === 'today' || bucket === 'yesterday') return TIME_FMT.format(d);
  return SHORT_DATE_FMT.format(d);
}

interface AlertInfo {
  icon: React.ReactNode;
  colorClass: string;
  label: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function getAlert(order: OrderSummary): AlertInfo | null {
  const ageDays = (Date.now() - new Date(order.created_at).getTime()) / DAY_MS;

  if (order.status === 'shipped' && order.payment_status !== 'paid') {
    return {
      icon: <AlertCircle size={13} />,
      colorClass: 'text-red-500 dark:text-red-400',
      label: 'Expédiée non payée',
    };
  }
  if (order.status === 'prepared' && ageDays >= 3) {
    return {
      icon: <Clock size={13} />,
      colorClass: 'text-amber-600 dark:text-amber-400',
      label: 'À expédier',
    };
  }
  if (order.status === 'draft' && ageDays >= 7) {
    return {
      icon: <Clock size={13} />,
      colorClass: 'text-muted-foreground',
      label: 'Brouillon ancien',
    };
  }
  return null;
}

function OrdersList() {
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
  const [alertsOnly, setAlertsOnly] = useState(false);
  const { data, isLoading } = useOrders({ status: statusFilter || undefined });

  const allOrders = data?.results ?? [];
  const alertCount = useMemo(() => allOrders.filter((o) => getAlert(o) !== null).length, [allOrders]);

  const visibleOrders = useMemo(
    () => (alertsOnly ? allOrders.filter((o) => getAlert(o) !== null) : allOrders),
    [allOrders, alertsOnly],
  );

  const grouped = useMemo(() => {
    const groups: Record<Bucket, OrderSummary[]> = { today: [], yesterday: [], this_week: [], older: [] };
    for (const o of visibleOrders) groups[bucketOf(o.created_at)].push(o);
    return groups;
  }, [visibleOrders]);

  const totalCount = visibleOrders.length;
  const hasResults = !isLoading && totalCount > 0;

  return (
    <>
      {/* Filtres statut */}
      <div className="-mx-4 lg:-mx-8 px-4 lg:px-8 overflow-x-auto no-scrollbar">
        <div className="flex gap-2 pr-4">
          {STATUSES.map(({ value, label, dot, activeClass }) => {
            const isActive = statusFilter === value;
            return (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors active:scale-95 ${
                  isActive ? activeClass : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {!isActive && dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bannière alertes — visible si au moins une commande nécessite attention */}
      {alertCount > 0 && (
        <button
          type="button"
          onClick={() => setAlertsOnly((v) => !v)}
          aria-pressed={alertsOnly}
          className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors active:scale-[0.98] ${
            alertsOnly
              ? 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10'
              : 'border-border bg-card hover:bg-muted/50'
          }`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
            <AlertCircle size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {alertCount} commande{alertCount > 1 ? 's' : ''} {alertCount > 1 ? 'nécessitent' : 'nécessite'} ton attention
            </p>
            <p className="text-xs text-muted-foreground">
              {alertsOnly ? 'Filtre actif · clique pour tout voir' : 'Clique pour les afficher seules'}
            </p>
          </div>
          <ChevronRight size={16} className="text-muted-foreground shrink-0" />
        </button>
      )}

      {/* Compteur + nouvelle */}
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? 'Chargement…'
            : `${totalCount} commande${totalCount > 1 ? 's' : ''}${statusFilter || alertsOnly ? ' · filtré' : ''}`}
        </p>
        <Link
          href="/orders/new"
          className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm active:scale-95 transition-transform self-start"
        >
          <Plus size={16} strokeWidth={2.4} />
          Nouvelle commande
        </Link>
      </div>

      {/* Liste */}
      {!isLoading && totalCount === 0 && <EmptyState filtered={!!statusFilter || alertsOnly} />}

      {hasResults && (
        <div className="flex flex-col gap-5">
          {BUCKET_ORDER.map((bucket) => {
            const orders = grouped[bucket];
            if (orders.length === 0) return null;
            return (
              <section key={bucket} className="flex flex-col gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
                  {BUCKET_LABEL[bucket]}
                  <span className="text-muted-foreground/60 normal-case font-normal tracking-normal ml-1.5">
                    ({orders.length})
                  </span>
                </h2>
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  {orders.map((order, i) => (
                    <OrderRow key={order.id} order={order} bucket={bucket} first={i === 0} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function OrderRow({ order, bucket, first }: { order: OrderSummary; bucket: Bucket; first: boolean }) {
  const total = parseFloat(order.total_amount).toFixed(2);
  const time = rowDate(order.created_at, bucket);
  const itemLabel = `${order.item_count} ${order.item_count > 1 ? 'articles' : 'article'}`;
  const alert = getAlert(order);

  return (
    <Link
      href={`/orders/${order.id}`}
      className={`flex items-stretch gap-3 px-4 py-3.5 active:bg-muted transition-colors ${
        first ? '' : 'border-t border-border'
      }`}
    >
      <div className={`w-1 rounded-full shrink-0 ${STATUS_BAR[order.status] ?? STATUS_BAR.draft}`} />

      <div className="flex-1 min-w-0 self-center">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground capitalize truncate">
            {order.customer_name ?? 'Sans client'}
          </span>
          <span className="text-[11px] text-muted-foreground/70 tabular-nums shrink-0">
            #{order.order_number}
          </span>
          {alert && (
            <span
              aria-label={alert.label}
              title={alert.label}
              className={`inline-flex shrink-0 ${alert.colorClass}`}
            >
              {alert.icon}
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5 truncate">
          <span className={`font-medium ${STATUS_TEXT[order.status] ?? STATUS_TEXT.draft}`}>
            {order.status_display}
          </span>
          <span className="text-muted-foreground"> · {time} · {itemLabel}</span>
        </p>
      </div>

      <div className="flex flex-col items-end shrink-0 self-center leading-tight">
        <span className="text-sm font-semibold text-foreground tabular-nums">{total} €</span>
        <span className={`text-[11px] font-medium ${PAYMENT_COLOR[order.payment_status] ?? ''}`}>
          {PAYMENT_LABEL[order.payment_status] ?? order.payment_status}
        </span>
      </div>
    </Link>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Receipt size={20} className="text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">
        {filtered ? 'Aucune commande pour ce filtre' : 'Aucune commande'}
      </p>
      <p className="text-xs text-muted-foreground text-center max-w-[16rem]">
        {filtered
          ? 'Essaie un autre statut ou retire le filtre.'
          : 'Crée ta première commande pour démarrer.'}
      </p>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <>
      <TopBar title="Commandes" titleClassName="text-3xl" />
      <div className="flex flex-col gap-4 p-4 lg:px-8 lg:py-6 pb-28">
        <Suspense>
          <OrdersList />
        </Suspense>
      </div>
    </>
  );
}
