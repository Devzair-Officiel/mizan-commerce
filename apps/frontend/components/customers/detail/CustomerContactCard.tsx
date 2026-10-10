'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Mail, MapPin, Phone } from 'lucide-react';
import { SectionCard } from '@/components/ui/SectionCard';
import { buttonVariants } from '@/components/ui/button';
import { WhatsAppIcon } from '@/components/orders/detail/constants';
import type { Customer } from '@/lib/hooks/useCustomers';
import { cn } from '@/lib/utils';
import type { CustomerDetailActions } from './useCustomerDetailState';

const OUTLINE = cn(buttonVariants({ variant: 'outline' }), 'h-10 rounded-full bg-card px-4 font-medium');
const LINE = 'flex min-h-11 w-full items-center gap-3 px-4 text-start text-sm transition-colors hover:bg-muted/50 lg:px-5';

function Line({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <><span className="shrink-0 text-muted-foreground" aria-hidden>{icon}</span><span className="min-w-0 truncate" dir="auto">{children}</span></>;
}

/** Carte « Coordonnées » : téléphone, e-mail, adresse (copier, ouvrir dans Maps), WhatsApp et appel. */
export function CustomerContactCard({ customer, actions }: { customer: Customer; actions: CustomerDetailActions }) {
  const t = useTranslations('customers.detail');
  const address = [customer.address_line, customer.postal_code, customer.city].filter(Boolean).join(', ');
  const empty = !customer.phone && !customer.email && !address;

  return (
    <SectionCard title={t('contact_title')}>
      {empty ? (
        <div className="px-4 py-4 lg:px-5">
          <p className="text-sm text-muted-foreground">{t('contact_empty')}</p>
          <Link href={`/customers/${customer.id}/edit`} className={cn(OUTLINE, 'mt-3')}>{t('contact_add')}</Link>
        </div>
      ) : (
        <div className="flex flex-col py-1.5">
          {customer.phone && <a href={`tel:${customer.phone}`} className={LINE}><Line icon={<Phone size={16} />}><span dir="ltr">{customer.phone}</span></Line></a>}
          {customer.email && <a href={`mailto:${customer.email}`} className={LINE}><Line icon={<Mail size={16} />}>{customer.email}</Line></a>}
          {address && <button type="button" onClick={actions.openAddress} className={LINE}><Line icon={<MapPin size={16} />}>{address}</Line></button>}
        </div>
      )}
      {customer.phone && (
        <div className="grid grid-cols-2 gap-2 border-t border-border px-4 py-3.5 lg:px-5">
          <button type="button" className={OUTLINE} onClick={() => actions.openWhatsApp('free')}>
            <span className="text-primary"><WhatsAppIcon size={16} /></span>
            {t('whatsapp')}
          </button>
          <a href={`tel:${customer.phone}`} className={OUTLINE}>
            <Phone className="text-primary" aria-hidden />
            {t('call')}
          </a>
        </div>
      )}
    </SectionCard>
  );
}
