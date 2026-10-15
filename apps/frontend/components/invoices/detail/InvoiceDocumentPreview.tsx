'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import { OrderNumber } from '@/components/orders/OrderNumber';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { Invoice } from '@/lib/hooks/useInvoices';

export function InvoiceDocumentPreview({ invoice: i }: { invoice: Invoice }) {
  const t = useTranslations('invoices.detail');
  const money = useFormatMoney();
  const color = i.presentation?.color || '#2b2f2d';
  return <SectionCard title={t('preview')}>
    <div className="p-4">
      <div data-invoice-document-preview data-accent={color} dir="ltr" className="overflow-hidden rounded-xl border border-border"
        style={{ backgroundColor: '#ffffff', color: '#1f2421' }}>
        <div className="h-1.5" style={{ backgroundColor: color }} />
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            {i.logo_url ? <Image src={i.logo_url} alt="" width={32} height={32} unoptimized className="size-8 rounded-lg object-contain" style={{ filter: i.presentation?.color ? undefined : 'grayscale(1)' }} /> :
              <span className="grid size-8 place-items-center rounded-lg text-sm font-bold" style={{ backgroundColor: color, color: '#ffffff' }}>{i.seller_name.charAt(0)}</span>}
            <span className="text-sm font-bold" style={{ color }}>{t('title')}</span>
          </div>
          <p className="text-[0.625rem] font-semibold break-words">{i.seller_name}</p>
          <p className="text-[0.625rem]"><OrderNumber>{i.number}</OrderNumber></p>
          <p className="text-[0.625rem]">{i.buyer_name}</p>
          <div className="h-3 rounded" style={{ backgroundColor: color }} />
          {i.lines.slice(0, 3).map(l => <div key={l.id} className="flex justify-between gap-2 text-[0.625rem]">
            <span className="truncate">{l.description}</span><span className="whitespace-nowrap tabular-nums">{money(l.line_subtotal_ht, i.currency)}</span>
          </div>)}
          <p className="self-end rounded-md px-3 py-2 text-xs font-bold tabular-nums" style={{ backgroundColor: color, color: '#ffffff' }}>{money(i.total_ttc, i.currency)}</p>
        </div>
      </div>
    </div>
  </SectionCard>;
}
