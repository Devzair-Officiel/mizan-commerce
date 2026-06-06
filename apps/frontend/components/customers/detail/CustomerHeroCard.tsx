'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { MoreHorizontal, Phone } from 'lucide-react';
import type { Customer } from '@/lib/hooks/useCustomers';
import { PreparedMessageDialog } from '@/components/messages/PreparedMessageDialog';
import { getInitials, WhatsAppIcon } from './constants';

interface CustomerHeroCardProps {
  customer: Customer;
  badge: { label: string; classes: string } | null;
  onOpenMore: () => void;
}

export function CustomerHeroCard({ customer, badge, onOpenMore }: CustomerHeroCardProps) {
  const t = useTranslations('customers.hero');
  const tWa = useTranslations('messages.prepared');
  const waPhone = customer.phone?.replace(/\D/g, '');
  const [waOpen, setWaOpen] = useState(false);

  const firstName = customer.name.trim().split(/\s+/)[0] ?? '';
  const initialMessage = firstName
    ? tWa('greeting_named', { name: firstName })
    : tWa('greeting');

  return (
    <div
      className="rounded-3xl p-5 flex flex-col items-center gap-2"
      style={{ background: 'color-mix(in oklch, var(--primary) 7%, transparent)' }}
    >
      <div
        className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-primary-foreground shadow-md ring-2 ring-background"
        style={{ background: 'var(--primary)' }}
      >
        {getInitials(customer.name)}
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <p className="text-2xl font-semibold text-foreground capitalize">{customer.name}</p>
        {badge && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.classes}`}>
            {badge.label}
          </span>
        )}
      </div>

      <div className="flex w-full items-center gap-2 mt-2">
        {waPhone && (
          <button
            type="button"
            onClick={() => setWaOpen(true)}
            className="flex flex-1 items-center justify-center gap-2 h-12 rounded-full text-primary-foreground shadow-md active:scale-95 transition-transform"
            style={{ background: 'var(--primary)' }}
          >
            <WhatsAppIcon />
            <span className="text-sm font-semibold">{t('whatsapp')}</span>
          </button>
        )}
        {customer.phone && (
          <a
            href={`tel:${customer.phone}`}
            aria-label={t('phone_aria')}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary active:scale-95 transition-transform"
          >
            <Phone size={20} />
          </a>
        )}
        <button
          type="button"
          onClick={onOpenMore}
          aria-label={t('more_aria')}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary active:scale-95 transition-transform"
        >
          <MoreHorizontal size={22} />
        </button>
      </div>

      {waPhone && (
        <PreparedMessageDialog
          open={waOpen}
          onClose={() => setWaOpen(false)}
          templateType="free"
          contextType="customer"
          contextId={customer.id}
          customerId={customer.id}
          recipientPhone={customer.phone ?? ''}
          initialMessage={initialMessage}
          WhatsAppIcon={WhatsAppIcon}
        />
      )}
    </div>
  );
}
