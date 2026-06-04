'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronDown, ShoppingCart, Clock, AlertTriangle, Bell, Receipt, TrendingUp, TrendingDown, Coins, ArrowRight, RefreshCw } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { useDashboard, type RevenueDayPoint } from '@/lib/hooks/useDashboard';
import { formatStock, type ProductUnit } from '@/lib/hooks/useProducts';
import { useMe } from '@/lib/hooks/useMe';
import { useShop } from '@/lib/hooks/useShop';

export default function DashboardPage() {
  const { data, isLoading, isError, error, dataUpdatedAt, isFetching, refetch } = useDashboard();
  const { data: me } = useMe();
  const { data: shop } = useShop();

  const firstName = me?.full_name?.trim().split(/\s+/)[0] ?? '';
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const currency = shop?.currency ?? 'EUR';

  const revenueToday = Number(data?.today.revenue ?? 0);
  const revenueYesterday = Number(data?.today.revenue_yesterday ?? 0);
  const ordersCount = data?.today.orders_count ?? 0;
  const avgTicket = ordersCount > 0 ? revenueToday / ordersCount : 0;
  const delta = computeDelta(revenueToday, revenueYesterday);
  const zakatDays = computeZakatDays(shop?.zakat_annual_date ?? null);

  return (
    <>
      <TopBar title="Accueil" />
      <div className="p-4 lg:px-8 lg:py-6 flex flex-col gap-4">

        {/* Greeting */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <h1 className="text-lg font-semibold text-foreground truncate">
              {firstName ? `Salam aleykoum, ${firstName}` : 'Salam aleykoum'}
            </h1>
            <p className="text-xs text-muted-foreground capitalize">{today}</p>
          </div>
          <FreshIndicator updatedAt={dataUpdatedAt} isFetching={isFetching} onRefresh={() => refetch()} />
        </div>

        {/* Encart Zakat — visible uniquement si <= 30 jours */}
        {zakatDays !== null && zakatDays <= 30 && (
          <Link
            href="/zakat"
            className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/40 p-4 flex items-center gap-3 active:scale-[0.99] transition-transform"
          >
            <span className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 shrink-0">
              <Coins size={18} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {zakatDays === 0 ? "Zakat aujourd'hui" : `Zakat dans ${zakatDays} jour${zakatDays > 1 ? 's' : ''}`}
              </p>
              <p className="text-xs text-muted-foreground">Préparer le calcul de la zakat annuelle.</p>
            </div>
            <ArrowRight size={16} className="text-muted-foreground shrink-0" />
          </Link>
        )}

        {/* KPIs du jour */}
        <div className="grid grid-cols-3 gap-2 lg:gap-3">
          <Link
            href="/orders?period=today"
            className="rounded-2xl border border-border bg-card p-3 flex flex-col gap-1 active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-1 text-[10px] lg:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <TrendingUp size={12} />
              CA jour
            </div>
            <div className="text-lg lg:text-2xl font-bold text-foreground tabular-nums truncate">
              {data ? formatRevenue(revenueToday, currency) : '—'}
            </div>
            {data && delta && (
              <div className={`flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${
                delta.positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {delta.positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {delta.label}
              </div>
            )}
            {data && !delta && (
              <div className="text-[11px] text-muted-foreground">Aujourd'hui</div>
            )}
          </Link>
          <Link
            href="/orders?period=today"
            className="rounded-2xl border border-border bg-card p-3 flex flex-col gap-1 active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-1 text-[10px] lg:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Receipt size={12} />
              Ventes
            </div>
            <div className="text-lg lg:text-2xl font-bold text-foreground tabular-nums">
              {data ? ordersCount : '—'}
            </div>
            <div className="text-[11px] text-muted-foreground">Aujourd'hui</div>
          </Link>
          <div className="rounded-2xl border border-border bg-card p-3 flex flex-col gap-1">
            <div className="text-[10px] lg:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ticket moyen
            </div>
            <div className="text-lg lg:text-2xl font-bold text-foreground tabular-nums truncate">
              {data ? formatRevenue(avgTicket, currency) : '—'}
            </div>
            <div className="text-[11px] text-muted-foreground">Aujourd'hui</div>
          </div>
        </div>

        {/* CA des 7 derniers jours */}
        {data && <RevenueSparkline points={data.revenue_last_7_days} currency={currency} />}

        {isLoading && (
          <div className="flex flex-col gap-2 mt-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <p className="font-medium">Erreur de chargement</p>
            <p className="mt-1 text-xs text-destructive/80">
              {(error as { status?: number })?.status === 403
                ? 'Aucune boutique associée à ce compte.'
                : 'Impossible de contacter le serveur.'}
            </p>
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

            {/* Colonne principale — opérationnel */}
            <div className="lg:col-span-3 flex flex-col gap-4">
              <Section
                icon={<ShoppingCart size={15} />}
                title="À préparer"
                count={data.orders_to_prepare.count}
                emptyIcon={<ShoppingCart size={20} className="text-muted-foreground" />}
                emptyLabel="Tout est à jour"
                emptySub="Aucune commande à préparer."
                accentClass="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900"
                headerBg="bg-blue-50/60 dark:bg-blue-950/40"
                defaultOpen
              >
                {data.orders_to_prepare.items.slice(0, 3).map((o) => (
                  <OrderRow key={o.id} id={o.id} label={o.order_number} sub={o.customer_name} value={`${o.total_amount} ${currency}`} />
                ))}
                {data.orders_to_prepare.count > 3 && (
                  <SeeAllRow href="/orders?status=to_prepare" count={data.orders_to_prepare.count} />
                )}
              </Section>

              <Section
                icon={<Clock size={15} />}
                title="Paiements en attente"
                count={data.unpaid_orders.count}
                emptyIcon={<Clock size={20} className="text-muted-foreground" />}
                emptyLabel="Aucun impayé"
                emptySub="Tous les paiements sont à jour."
                accentClass="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900"
                headerBg="bg-amber-50/60 dark:bg-amber-950/40"
                defaultOpen
              >
                {data.unpaid_orders.items.slice(0, 3).map((o) => (
                  <OrderRow key={o.id} id={o.id} label={o.order_number} sub={o.customer_name} value={`${o.total_amount} ${currency}`} />
                ))}
                {data.unpaid_orders.count > 3 && (
                  <SeeAllRow href="/orders?payment_status=unpaid" count={data.unpaid_orders.count} />
                )}
              </Section>
            </div>

            {/* Colonne secondaire — stock & rappels */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <Section
                icon={<AlertTriangle size={15} />}
                title="Stock faible"
                count={data.low_stock_products.count}
                emptyIcon={<AlertTriangle size={20} className="text-muted-foreground" />}
                emptyLabel="Stocks OK"
                emptySub="Aucun produit en rupture ou sous le seuil."
                accentClass="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900"
                headerBg="bg-red-50/60 dark:bg-red-950/40"
                defaultOpen={false}
              >
                {data.low_stock_products.items.slice(0, 3).map((p) => (
                  <StockRow
                    key={p.variant_id}
                    id={p.id}
                    name={p.name}
                    variantName={p.variant_name}
                    qty={p.stock_quantity}
                    unit={p.unit}
                    baseQuantity={p.base_quantity}
                  />
                ))}
                {data.low_stock_products.count > 3 && (
                  <SeeAllRow href="/products?filter=low_stock" count={data.low_stock_products.count} />
                )}
              </Section>

              <Section
                icon={<Bell size={15} />}
                title="Rappels du jour"
                count={data.today_reminders.count}
                emptyIcon={<Bell size={20} className="text-muted-foreground" />}
                emptyLabel="Aucun rappel"
                emptySub="Rien de prévu aujourd'hui."
                accentClass="text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/50 border-purple-200 dark:border-purple-900"
                headerBg="bg-purple-50/60 dark:bg-purple-950/40"
                defaultOpen={false}
              >
                {data.today_reminders.items.slice(0, 3).map((r) => (
                  <ReminderRow key={r.id} title={r.title} due_at={r.due_at} />
                ))}
                {data.today_reminders.count > 3 && (
                  <SeeAllRow href="/reminders" count={data.today_reminders.count} />
                )}
              </Section>
            </div>

          </div>
        )}
      </div>
    </>
  );
}

function formatRevenue(value: number, currency: string): string {
  if (!Number.isFinite(value)) return `0 ${currency}`;
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${currency}`;
}

function computeDelta(today: number, yesterday: number): { label: string; positive: boolean } | null {
  if (yesterday <= 0) return null;
  const pct = ((today - yesterday) / yesterday) * 100;
  const rounded = Math.round(pct);
  if (rounded === 0) return { label: '= hier', positive: true };
  return {
    label: `${rounded > 0 ? '+' : ''}${rounded}% vs hier`,
    positive: rounded > 0,
  };
}

function FreshIndicator({ updatedAt, isFetching, onRefresh }: { updatedAt: number; isFetching: boolean; onRefresh: () => void }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const label = isFetching ? 'Actualisation…' : updatedAt ? formatRelative(updatedAt) : '';

  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isFetching}
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-60 shrink-0"
      aria-label="Actualiser"
    >
      <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function formatRelative(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "à l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

function RevenueSparkline({ points, currency }: { points: RevenueDayPoint[]; currency: string }) {
  const values = points.map((p) => Number(p.revenue) || 0);
  const max = Math.max(...values, 1);
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          CA — 7 derniers jours
        </div>
        <div className="text-xs font-semibold text-foreground tabular-nums">
          {formatRevenue(total, currency)}
        </div>
      </div>
      <div className="flex items-end gap-1.5">
        {values.map((v, i) => {
          const heightPct = (v / max) * 100;
          const isToday = i === values.length - 1;
          const date = new Date(points[i].date);
          const dayNum = date.getDate();
          return (
            <div key={points[i].date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <span className={`text-[9px] tabular-nums ${isToday ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                {v > 0 ? formatCompactRevenue(v) : '—'}
              </span>
              <div className="w-full h-16 flex flex-col justify-end">
                <div
                  className={`w-full rounded-t-md ${isToday ? 'bg-primary' : 'bg-muted-foreground/60'} transition-colors`}
                  style={{ height: `${Math.max(heightPct, 4)}%` }}
                  title={`${formatRevenue(v, currency)} — ${date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}`}
                />
              </div>
              <span className={`text-[10px] tabular-nums ${isToday ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                {String(dayNum).padStart(2, '0')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatCompactRevenue(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(value));
}

function computeZakatDays(annualDate: string | null): number | null {
  if (!annualDate) return null;
  const parts = annualDate.split('-');
  if (parts.length !== 3) return null;
  const month = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  if (Number.isNaN(month) || Number.isNaN(day)) return null;

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = new Date(now.getFullYear(), month, day);
  if (target < todayMidnight) {
    target = new Date(now.getFullYear() + 1, month, day);
  }
  const diff = Math.round((target.getTime() - todayMidnight.getTime()) / 86_400_000);
  return diff;
}

function Section({
  icon, title, count, emptyIcon, emptyLabel, emptySub,
  accentClass, headerBg, defaultOpen, children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  emptyIcon: React.ReactNode;
  emptyLabel: string;
  emptySub: string;
  accentClass: string;
  headerBg: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors ${headerBg}`}
      >
        <span className={`flex items-center justify-center w-7 h-7 rounded-full border text-xs shrink-0 ${accentClass}`}>
          {icon}
        </span>
        <span className="flex-1 text-left text-sm font-semibold text-foreground">{title}</span>
        {count > 0 && (
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold shrink-0 ${accentClass}`}>
            {count}
          </span>
        )}
        <ChevronDown
          size={16}
          className={`text-muted-foreground shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-border">
          {count === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
                {emptyIcon}
              </span>
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold text-foreground">{emptyLabel}</p>
                <p className="text-xs text-muted-foreground">{emptySub}</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {children}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrderRow({ id, label, sub, value }: { id: string; label: string; sub?: string | null; value: string }) {
  return (
    <Link
      href={`/orders/${id}`}
      className="flex items-center justify-between px-4 py-3 active:bg-muted/60 transition-colors"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-base font-medium text-foreground">{label}</span>
        {sub && <span className="text-sm text-muted-foreground">{sub}</span>}
      </div>
      <span className="text-base font-semibold text-foreground tabular-nums">{value}</span>
    </Link>
  );
}

function StockRow({
  id, name, variantName, qty, unit, baseQuantity,
}: {
  id: string;
  name: string;
  variantName: string;
  qty: string;
  unit: ProductUnit;
  baseQuantity: string;
}) {
  const num = parseFloat(qty);
  const isOut = num <= 0;
  return (
    <Link
      href={`/products/${id}`}
      className="flex items-center justify-between px-4 py-3 active:bg-muted/60 transition-colors gap-3"
    >
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-base font-medium text-foreground truncate">{name}</span>
        <span className="text-xs text-muted-foreground truncate">{variantName}</span>
      </div>
      <span className={`text-sm font-semibold tabular-nums shrink-0 ${isOut ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}>
        {isOut ? 'Rupture' : `${formatStock(qty, unit, { baseQuantity, packagingName: variantName })} restants`}
      </span>
    </Link>
  );
}

function ReminderRow({ title, due_at }: { title: string; due_at: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-base font-medium text-foreground flex-1 truncate pr-3">{title}</span>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {new Date(due_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
}

function SeeAllRow({ href, count }: { href: string; count: number }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-center px-4 py-2.5 text-sm font-medium text-muted-foreground active:bg-muted/60 transition-colors"
    >
      Voir tout ({count}) →
    </Link>
  );
}
