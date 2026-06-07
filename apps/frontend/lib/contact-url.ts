import type { PublicContact, PublicContactType } from './public-page-types';

const LABELS: Record<PublicContactType, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  instagram: 'Instagram',
  phone: 'Téléphone',
};

export function contactLabel(contact: Pick<PublicContact, 'type' | 'label'>): string {
  return contact.label.trim() || LABELS[contact.type];
}

export function contactHref(
  contact: Pick<PublicContact, 'type' | 'value'>,
  prefilledMessage?: string,
): string {
  const value = contact.value.trim();
  switch (contact.type) {
    case 'whatsapp': {
      const digits = value.replace(/[^\d]/g, '');
      const msg = prefilledMessage ? `?text=${encodeURIComponent(prefilledMessage)}` : '';
      return `https://wa.me/${digits}${msg}`;
    }
    case 'telegram': {
      const handle = value.replace(/^@/, '');
      return `https://t.me/${handle}`;
    }
    case 'instagram': {
      const handle = value.replace(/^@/, '');
      return `https://instagram.com/${handle}`;
    }
    case 'phone':
      return `tel:${value.replace(/\s/g, '')}`;
  }
}
