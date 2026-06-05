'use client';

import { ShoppingCart, Clock, AlertTriangle, Bell } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { useDashboard } from '@/lib/hooks/useDashboard';
import { useMe } from '@/lib/hooks/useMe';
import { useShop } from '@/lib/hooks/useShop';
import { FreshIndicator } from '@/components/dashboard/FreshIndicator';
import { ZakatBanner } from '@/components/dashboard/ZakatBanner';
import { KpiCards } from '@/components/dashboard/KpiCards';
import { RevenueSparkline } from '@/components/dashboard/RevenueSparkline';
import { Section } from '@/components/dashboard/Section';
import { OrderRow, ReminderRow, SeeAllRow, StockRow } from '@/components/dashboard/rows';
import { computeZakatDays } from '@/components/dashboard/utils';

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
  const zakatDays = computeZakatDays(shop?.zakat_annual_date ?? null);

  return (
    <>
      <TopBar title="Accueil" />
      <div className="p-4 lg:px-8 lg:py-6 flex flex-col gap-4">

        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <h1 className="text-lg font-semibold text-foreground truncate">
              {firstName ? `Salam aleykoum, ${firstName}` : 'Salam aleykoum'}
            </h1>
            <p className="text-xs text-muted-foreground capitalize">{today}</p>
          </div>
          <FreshIndicator updatedAt={dataUpdatedAt} isFetching={isFetching} onRefresh={() => refetch()} />
        </div>

        {zakatDays !== null && zakatDays <= 30 && <ZakatBanner daysUntil={zakatDays} />}

        <KpiCards
          hasData={Boolean(data)}
          revenueToday={revenueToday}
          revenueYesterday={revenueYesterday}
          ordersCount={ordersCount}
          avgTicket={avgTicket}
          currency={currency}
        />

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
