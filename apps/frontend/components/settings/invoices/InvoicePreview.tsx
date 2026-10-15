'use client';

import Image from 'next/image';
import { useWatch, type Control } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Download, Eye } from 'lucide-react';
import { FormSection } from '@/components/form/FormSection';
import { buttonVariants } from '@/components/ui/button';
import type { InvoiceSettings } from '@/lib/hooks/useInvoiceSettings';
import type { InvoiceSettingsValues } from './schema';
import { invoiceAccent } from './invoiceColor';

export function InvoicePreview({ control, settings }: { control: Control<InvoiceSettingsValues>; settings: InvoiceSettings }) {
  const t = useTranslations('invoice_settings');
  const [mode, chosen] = useWatch({ control, name: ['invoice_color_mode', 'invoice_color'] });
  const color = mode === 'neutral' ? '' : mode === 'custom' ? invoiceAccent(chosen) : settings.invoice_auto_color;
  const accent = color || '#2b2f2d';
  const tint = color ? `color-mix(in srgb, ${color} 7%, white)` : '#f4f4f2';
  return (
    <FormSection icon={Eye} title={t('preview')} order="max-lg:order-5">
      <div data-invoice-preview dir="ltr" data-accent={accent} aria-label={t('preview')} className="aspect-[794/1123] overflow-hidden rounded-xl border border-border" style={{ backgroundColor: '#ffffff', color: '#1f2421' }}>
        <div className="h-1.5" style={{ backgroundColor: accent }} />
        <div className="p-3.5" aria-hidden>
          <div className="flex items-start justify-between gap-2">
            {settings.logo_url ? <Image src={settings.logo_url} alt="" width={34} height={34} unoptimized className="size-8.5 rounded-lg object-contain" /> :
              <div className="flex size-8.5 items-center justify-center rounded-lg text-lg font-semibold" style={{ backgroundColor: accent, color: '#ffffff' }}>{settings.name.charAt(0)}</div>}
            <span className="text-base font-bold" style={{ color: accent }}>{t('invoice_title')}</span>
          </div>
          <p className="mt-2 truncate text-[0.625rem] font-semibold">{settings.name}</p>
          <div className="mt-4 flex gap-2">
            {[0, 1].map((i) => <div key={i} className="h-11.5 flex-1 rounded-md" style={{ backgroundColor: tint }} />)}
          </div>
          <div className="mt-3.5 h-3.5 rounded" style={{ backgroundColor: accent }} />
          {[0, 1, 2, 3].map((i) => <div key={i} className="mt-1.5 h-2.5 rounded" style={{ backgroundColor: '#eeece7' }} />)}
          <div className="ms-auto mt-3 h-4.5 w-[55%] rounded-md" style={{ backgroundColor: accent }} />
        </div>
      </div>
      <a href="/api/proxy/shop/invoice-settings/example/" download="exemple-facture.pdf" className={`${buttonVariants({ variant: 'outline' })} h-auto min-h-10 rounded-full px-3 py-2 text-center text-sm whitespace-normal`}>
        <Download size={17} aria-hidden className="shrink-0" />{t('download')}
      </a>
      <p className="text-xs text-muted-foreground">{t('saved_example')}</p>
    </FormSection>
  );
}
