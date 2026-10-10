'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Phone, UserPlus } from 'lucide-react';
import { SectionCard } from '@/components/ui/SectionCard';
import { buttonVariants } from '@/components/ui/button';
import type { Order } from '@/lib/hooks/useOrders';
import { cn } from '@/lib/utils';
import { STATUS_ALLOWS_EDIT, WhatsAppIcon } from './constants';
import { templateFor } from './useOrderMenuActions';
import type { OrderDetailActions } from './useOrderDetailState';

const OUTLINE = cn(buttonVariants({ variant: 'outline' }), 'h-10 rounded-full bg-card px-4 font-medium');

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

/** Carte « Client » : identité, contact (WhatsApp, appel) et lien vers la fiche. */
export function OrderCustomerCard({ order, actions }: { order: Order; actions: OrderDetailActions }) {
  const t = useTranslations('orders.customerCard');

  if (!order.customer) {
    return (
      <SectionCard title={t('title')}>
        <div className="px-4 py-4 lg:px-5">
          <p className="text-sm text-muted-foreground">{t('none')}</p>
          {STATUS_ALLOWS_EDIT.has(order.status) && (
            <Link href={`/orders/${order.id}/edit`} className={cn(OUTLINE, 'mt-3')}>
              <UserPlus className="text-primary" aria-hidden />
              {t('associate')}
            </Link>
          )}
        </div>
      </SectionCard>
    );
  }

  const name = order.customer_name ?? '';
  const contact = [order.customer_phone, order.customer_city].filter(Boolean).join(', ');
  return (
    <SectionCard title={t('title')} rightLink={{ label: t('see_profile'), href: `/customers/${order.customer}` }}>
      <div className="px-4 py-4 lg:px-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary font-semibold text-secondary-foreground" aria-hidden>
            {initials(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[0.9375rem] font-semibold capitalize">{name}</p>
            {contact && <p className="mt-0.5 truncate text-[0.8125rem] text-muted-foreground" dir="auto">{contact}</p>}
          </div>
        </div>
        {order.customer_phone && (
          <div className="mt-3.5 grid grid-cols-2 gap-2">
            <button type="button" className={OUTLINE} onClick={() => actions.openWhatsApp(templateFor(order))}>
              <span className="text-primary"><WhatsAppIcon size={16} /></span>
              {t('whatsapp')}
            </button>
            <a href={`tel:${order.customer_phone}`} className={OUTLINE}>
              <Phone className="text-primary" aria-hidden />
              {t('call')}
            </a>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
