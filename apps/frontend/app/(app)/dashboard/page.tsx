'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, ShoppingCart, Clock, AlertTriangle, Bell } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { useDashboard } from '@/lib/hooks/useDashboard';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const { data, isLoading, isError, error } = useDashboard();

  return (
    <>
      <TopBar title="Accueil" />
      <div className="p-4 lg:px-8 lg:py-6">

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-2 lg:gap-3 mb-4 lg:mb-6">
          <Link href="/orders/new">
            <Button variant="outline" className="w-full flex-col h-16 gap-1 text-sm">
              <span className="text-lg">＋</span>
              Nouvelle vente
            </Button>
          </Link>
          <Link href="/products/new">
            <Button variant="outline" className="w-full flex-col h-16 gap-1 text-sm">
              <span className="text-lg">📦</span>
              Ajouter produit
            </Button>
          </Link>
          <Link href="/customers/new">
            <Button variant="outline" className="w-full flex-col h-16 gap-1 text-sm">
              <span className="text-lg">👤</span>
              Ajouter client
            </Button>
          </Link>
        </div>

        {isLoading && (
          <div className="flex flex-col gap-2 mt-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 rounded-2xl bg-zinc-100 animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-medium">Erreur de chargement</p>
            <p className="mt-1 text-xs text-red-500">
              {(error as { status?: number })?.status === 403
                ? 'Aucune boutique associée à ce compte.'
                : 'Impossible de contacter le serveur.'}
            </p>
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

            {/* Colonne principale — commandes */}
            <div className="lg:col-span-3 flex flex-col gap-4">
              <Section
                icon={<ShoppingCart size={15} />}
                title="À préparer"
                count={data.orders_to_prepare.count}
                href="/orders?status=to_prepare"
                emptyLabel="Aucune commande à préparer"
                accentClass="text-blue-600 bg-blue-50 border-blue-200"
                headerBg="bg-blue-50/60 dark:bg-blue-950/50"
                defaultOpen={false}
              >
                {data.orders_to_prepare.items.map((o) => (
                  <OrderRow key={o.id} id={o.id} label={o.order_number} sub={o.customer_name} value={`${o.total_amount} €`} />
                ))}
                {data.orders_to_prepare.count > 10 && (
                  <SeeAllRow href="/orders?status=to_prepare" count={data.orders_to_prepare.count} />
                )}
              </Section>

              <Section
                icon={<Clock size={15} />}
                title="Paiements en attente"
                count={data.unpaid_orders.count}
                href="/orders?payment_status=unpaid"
                emptyLabel="Aucun paiement en attente"
                accentClass="text-amber-600 bg-amber-50 border-amber-200"
                headerBg="bg-amber-50/60 dark:bg-amber-950/50"
                defaultOpen={false}
              >
                {data.unpaid_orders.items.map((o) => (
                  <OrderRow key={o.id} id={o.id} label={o.order_number} sub={o.customer_name} value={`${o.total_amount} €`} />
                ))}
                {data.unpaid_orders.count > 10 && (
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
                href="/products?filter=low_stock"
                emptyLabel="Tous les stocks sont OK"
                accentClass="text-red-600 bg-red-50 border-red-200"
                headerBg="bg-red-50/60 dark:bg-red-950/50"
                defaultOpen={false}
              >
                {data.low_stock_products.items.map((p) => (
                  <StockRow
                    key={p.id}
                    id={p.id}
                    name={p.name}
                    qty={p.stock_quantity}
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
                href="/reminders"
                emptyLabel="Aucun rappel aujourd'hui"
                accentClass="text-purple-600 bg-purple-50 border-purple-200"
                headerBg="bg-purple-50/60 dark:bg-purple-950/50"
                defaultOpen={false}
              >
                {data.today_reminders.items.map((r) => (
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

function Section({
  icon,
  title,
  count,
  emptyLabel,
  accentClass,
  headerBg,
  defaultOpen,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  href: string;
  emptyLabel: string;
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
            <p className="px-4 py-3 text-sm text-muted-foreground">{emptyLabel}</p>
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

function StockRow({ id, name, qty }: { id: string; name: string; qty: number }) {
  return (
    <Link
      href={`/products/${id}`}
      className="flex items-center justify-between px-4 py-3 active:bg-muted/60 transition-colors"
    >
      <span className="text-base font-medium text-foreground flex-1 truncate pr-3">{name}</span>
      <span className={`text-sm font-semibold tabular-nums shrink-0 ${qty === 0 ? 'text-red-500' : 'text-amber-500'}`}>
        {qty === 0 ? 'Rupture' : `${qty} restants`}
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
