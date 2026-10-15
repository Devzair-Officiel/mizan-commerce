'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { formatIban, formatInvoicePhone, formatSiret, formatTaxId, formatVatNumber } from '@/lib/invoiceFormatting';
import { PartyCard } from './PartyCard';

export function InvoiceSellerCard({ invoice }: { invoice: Invoice }) {
  const t = useTranslations('invoices.detail');
  const labels = useTranslations('invoice_settings');
  const p = invoice.presentation;
  const siret = p?.siret;
  const bank = p?.payment_methods?.includes('transfer');
  const taxId = invoice.seller_tax_id;
  return (
    <PartyCard title={t('seller')} name={invoice.seller_name} address={invoice.seller_address}
      mark={invoice.logo_url ? <Image src={invoice.logo_url} alt={t('seller_logo')} width={64} height={64} unoptimized className="size-16 rounded-xl object-contain" /> : undefined} extras={[
      p?.activity,
      siret ? `${labels('siret')} ${formatSiret(siret)}` : undefined,
      taxId && taxId.replace(/\s/g, '') !== siret?.replace(/\s/g, '') ? formatTaxId(taxId) : undefined,
      p?.vat_number ? `${labels('vat_number')} ${formatVatNumber(p.vat_number)}` : undefined,
      ...(p?.contacts ?? []).map((c) => c.type === 'phone' ? formatInvoicePhone(c.value, invoice.seller_country) : c.value),
      bank && p?.iban ? `${labels('iban')} ${formatIban(p.iban)}` : undefined,
      bank && p?.bic ? `${labels('bic')} ${p.bic}` : undefined,
    ]} />
  );
}
