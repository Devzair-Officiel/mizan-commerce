'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { NewSaleScreen } from '@/components/orders/new/NewSaleScreen';
import { useOrder, type Order } from '@/lib/hooks/useOrders';
import { useNewSaleForm } from '@/lib/hooks/useNewSaleForm';

const EDITABLE = ['to_prepare', 'prepared'];

/** Même écran que la Nouvelle commande, en mode modification (sans paiement ni statut). */
function EditSaleForm({ order }: { order: Order }) {
  const form = useNewSaleForm({ mode: 'edit', order });
  return <NewSaleScreen form={form} />;
}

function OrderMessage({ text, orderId, tone = 'muted' }: { text: string; orderId?: string; tone?: 'muted' | 'error' }) {
  const t = useTranslations('orders.edit');
  return (
    <div className="flex flex-col items-start gap-3 p-4">
      <p className={`text-sm ${tone === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>{text}</p>
      {orderId && (
        <Link href={`/orders/${orderId}`} className="text-sm font-semibold text-primary hover:underline">
          {t('back_to_order')}
        </Link>
      )}
    </div>
  );
}

export default function EditOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const t = useTranslations('orders.edit');
  const tDetail = useTranslations('orders.detail');
  const { data: order, isLoading } = useOrder(id);
  const title = order ? t('topbar_with_number', { number: order.order_number }) : t('topbar');

  return (
    <>
      <TopBar title={title} back backLabel={tDetail('topbar')} onBack={() => router.push(`/orders/${id}`)} hideSearch />
      {isLoading ? (
        <OrderMessage text={t('loading')} />
      ) : !order ? (
        <OrderMessage text={t('not_found')} tone="error" />
      ) : !EDITABLE.includes(order.status) ? (
        <OrderMessage text={t('read_only')} orderId={order.id} />
      ) : (
        <Suspense>
          <EditSaleForm order={order} />
        </Suspense>
      )}
    </>
  );
}
