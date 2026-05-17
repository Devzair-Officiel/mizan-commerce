'use client';

import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { useDashboard } from '@/lib/hooks/useDashboard';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const { data, isLoading, isError } = useDashboard();

  return (
    <>
      <TopBar title="Accueil" />
      <div className="flex flex-col gap-4 p-4">
        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-2">
          <Link href="/orders/new">
            <Button variant="outline" className="w-full flex-col h-16 gap-1 text-xs">
              <span className="text-lg">＋</span>
              Nouvelle vente
            </Button>
          </Link>
          <Link href="/products/new">
            <Button variant="outline" className="w-full flex-col h-16 gap-1 text-xs">
              <span className="text-lg">📦</span>
              Ajouter produit
            </Button>
          </Link>
          <Link href="/customers/new">
            <Button variant="outline" className="w-full flex-col h-16 gap-1 text-xs">
              <span className="text-lg">👤</span>
              Ajouter client
            </Button>
          </Link>
        </div>

        {isLoading && <p className="text-sm text-zinc-500 text-center py-8">Chargement…</p>}
        {isError && <p className="text-sm text-red-500 text-center py-4">Erreur de chargement.</p>}

        {data && (
          <>
            <DashboardBlock
              title="À préparer"
              count={data.orders_to_prepare.count}
              href="/orders?status=to_prepare"
              emptyLabel="Aucune commande à préparer"
              color="blue"
            >
              {data.orders_to_prepare.items.map((o) => (
                <Link key={o.id} href={`/orders/${o.id}`} className="flex justify-between text-sm py-1">
                  <span className="font-medium">{o.order_number}</span>
                  <span className="text-zinc-500">{o.total_amount} €</span>
                </Link>
              ))}
            </DashboardBlock>

            <DashboardBlock
              title="Paiements en attente"
              count={data.unpaid_orders.count}
              href="/orders?payment_status=unpaid"
              emptyLabel="Aucun paiement en attente"
              color="amber"
            >
              {data.unpaid_orders.items.map((o) => (
                <Link key={o.id} href={`/orders/${o.id}`} className="flex justify-between text-sm py-1">
                  <span className="font-medium">{o.order_number}</span>
                  <span className="text-zinc-500">{o.total_amount} €</span>
                </Link>
              ))}
            </DashboardBlock>

            <DashboardBlock
              title="Stock faible"
              count={data.low_stock_products.count}
              href="/products?filter=low_stock"
              emptyLabel="Tous les stocks sont OK"
              color="red"
            >
              {data.low_stock_products.items.map((p) => (
                <Link key={p.id} href={`/products/${p.id}`} className="flex justify-between text-sm py-1">
                  <span className="font-medium">{p.name}</span>
                  <span className={p.stock_quantity === 0 ? 'text-red-500' : 'text-amber-500'}>
                    {p.stock_quantity === 0 ? 'Rupture' : `${p.stock_quantity} restants`}
                  </span>
                </Link>
              ))}
            </DashboardBlock>

            <DashboardBlock
              title="Rappels du jour"
              count={data.today_reminders.count}
              href="/reminders"
              emptyLabel="Aucun rappel aujourd'hui"
              color="purple"
            >
              {data.today_reminders.items.map((r) => (
                <div key={r.id} className="flex justify-between text-sm py-1">
                  <span className="font-medium">{r.title}</span>
                  <span className="text-zinc-500 text-xs">{new Date(r.due_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </DashboardBlock>
          </>
        )}
      </div>
    </>
  );
}

const COLOR_MAP = {
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  amber: 'bg-amber-50 border-amber-200 text-amber-700',
  red: 'bg-red-50 border-red-200 text-red-700',
  purple: 'bg-purple-50 border-purple-200 text-purple-700',
} as const;

function DashboardBlock({
  title,
  count,
  href,
  emptyLabel,
  color,
  children,
}: {
  title: string;
  count: number;
  href: string;
  emptyLabel: string;
  color: keyof typeof COLOR_MAP;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-zinc-900 text-sm">{title}</h2>
        {count > 0 && (
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${COLOR_MAP[color]}`}>
            {count}
          </span>
        )}
      </div>
      {count === 0 ? (
        <p className="text-sm text-zinc-400">{emptyLabel}</p>
      ) : (
        <div className="divide-y divide-zinc-100">
          {children}
          {count > 3 && (
            <Link href={href} className="block pt-2 text-xs text-zinc-400 hover:text-zinc-600">
              Voir tout ({count}) →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
