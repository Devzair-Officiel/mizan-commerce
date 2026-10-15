'use client';

import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function InvoicePdfButton({ id, className }: { id: string; className?: string }) {
  const t = useTranslations('invoices.detail');
  return <a href={`/api/proxy/invoices/${id}/pdf/`} download
    className={cn(buttonVariants(), 'h-10 rounded-full px-4 font-semibold', className)}>
    <Download aria-hidden size={17} />{t('download_pdf')}
  </a>;
}
