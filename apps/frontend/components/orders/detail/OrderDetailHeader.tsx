'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronLeft, Pencil } from 'lucide-react';
import { DetailActionsMenu } from '@/components/detail/DetailActionsMenu';
import { DetailPrimaryButton } from '@/components/detail/DetailPrimaryButton';
import { buttonVariants } from '@/components/ui/button';
import type { Order } from '@/lib/hooks/useOrders';
import { cn } from '@/lib/utils';
import { STATUS_ALLOWS_EDIT } from './constants';
import { OrderStatusBadge } from './OrderStatusBadge';
import { useDayTime } from './useDayTime';
import type { OrderAction } from './useOrderPrimaryAction';
import type { OrderMenuActions } from './useOrderMenuActions';

interface OrderDetailHeaderProps {
  order: Order;
  primary: OrderAction | null;
  menu: OrderMenuActions;
}

/** En-tête desktop : retour, titre + statut, création ; à droite Modifier, « ⋯ », action principale. */
export function OrderDetailHeader({ order, primary, menu }: OrderDetailHeaderProps) {
  const t = useTranslations('orders.detail');
  const tNav = useTranslations('layout.nav');
  const router = useRouter();
  const { parts } = useDayTime();
  const author = order.created_by_name;
  // Retour à la liste avec ses filtres (historique), ou à la liste nue si on arrive d'ailleurs.
  const back = () => (window.history.length > 1 ? router.back() : router.push('/orders'));

  return (
    <header className="hidden flex-wrap items-end justify-between gap-4 px-4 pt-2 lg:flex">
      <div className="min-w-0">
        <button type="button" onClick={back}
          className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ChevronLeft size={16} className="rtl:rotate-180" aria-hidden />
          {tNav('orders')}
        </button>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-semibold leading-snug tracking-tight">{t('title', { number: order.order_number })}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t('created', { ...parts(order.created_at), hasAuthor: author ? 'yes' : 'no', author: author ?? '' })}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {STATUS_ALLOWS_EDIT.has(order.status) && (
          <Link href={`/orders/${order.id}/edit`} className={cn(buttonVariants({ variant: 'outline' }), 'h-10 rounded-full bg-card px-4 font-medium')}>
            <Pencil aria-hidden />{t('edit')}
          </Link>
        )}
        <DetailActionsMenu actions={menu} variant="menu" />
        {primary && <DetailPrimaryButton action={primary} />}
      </div>
    </header>
  );
}
