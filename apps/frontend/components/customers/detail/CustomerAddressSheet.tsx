'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Navigation } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { Customer } from '@/lib/hooks/useCustomers';

interface CustomerAddressSheetProps {
  open: boolean;
  onClose: () => void;
  customer: Customer;
}

export function CustomerAddressSheet({ open, onClose, customer }: CustomerAddressSheetProps) {
  const t = useTranslations('customers.addressSheet');
  return (
    <BottomSheet open={open} onClose={onClose} title={t('title')}>
      {open && <AddressBody customer={customer} onClose={onClose} />}
    </BottomSheet>
  );
}

function AddressBody({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const t = useTranslations('customers.addressSheet');
  const [copied, setCopied] = useState(false);
  const fullAddress = [customer.address_line, customer.postal_code, customer.city].filter(Boolean).join(', ');

  function handleCopy() {
    navigator.clipboard.writeText(fullAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      <p className="text-sm text-foreground mb-4">{fullAddress}</p>
      <div className="flex flex-col gap-2">
        <button
          onClick={handleCopy}
          className="flex items-center gap-3 w-full rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm font-medium text-foreground active:scale-95 transition-transform"
        >
          <Copy size={18} className="text-primary shrink-0" />
          {copied ? t('copied') : t('copy')}
        </button>
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className="flex items-center gap-3 w-full rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm font-medium text-foreground active:scale-95 transition-transform"
        >
          <Navigation size={18} className="text-primary shrink-0" />
          {t('open_maps')}
        </a>
      </div>
    </>
  );
}
