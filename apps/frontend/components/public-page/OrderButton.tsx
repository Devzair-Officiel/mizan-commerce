'use client';

import { contactHref, contactLabel } from '@/lib/contact-url';
import { buildOrderMessage } from '@/lib/order-message';
import type { PublicContact } from '@/lib/public-page-types';

interface Props {
  contact: PublicContact;
  itemName: string;
  priceLabel: string | null;
  shopName: string;
  messageTemplate: string;
}

export function OrderButton({ contact, itemName, priceLabel, shopName, messageTemplate }: Props) {
  const message = buildOrderMessage(messageTemplate, {
    shop_name: shopName,
    item_name: itemName,
    price_label: priceLabel,
  });
  const href = contactHref(contact, contact.type === 'whatsapp' ? message : undefined);
  const label = contact.type === 'whatsapp' ? 'Commander sur WhatsApp' : `Contacter via ${contactLabel(contact)}`;

  return (
    <a
      href={href}
      target={contact.type === 'phone' ? undefined : '_blank'}
      rel="noopener noreferrer"
      className="inline-flex w-full items-center justify-center rounded-full px-3 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
      style={{ backgroundColor: 'var(--page-primary)' }}
    >
      {label}
    </a>
  );
}
