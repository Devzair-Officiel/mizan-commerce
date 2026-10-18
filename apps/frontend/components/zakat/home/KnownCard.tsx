'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import type { ZakatSources } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../useZakatFormat';

function KnownRow({ label, shortLabel, sub, shortSub, amount }: { label: string; shortLabel: string; sub: string; shortSub: string; amount: string }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0 lg:px-5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">
          <span className="lg:hidden">{shortLabel}</span><span className="max-lg:hidden">{label}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="lg:hidden">{shortSub}</span><span className="max-lg:hidden">{sub}</span>
        </p>
      </div>
      <span className="text-sm font-semibold whitespace-nowrap text-foreground tabular-nums">{amount}</span>
    </li>
  );
}

/** Ce que Mizan suit déjà au quotidien : stock à vendre et commandes non réglées. */
export function KnownCard({ sources, format }: { sources: ZakatSources; format: ZakatFormat }) {
  const t = useTranslations('zakat.home');
  const count = sources.active_formats_count;
  return (
    <SectionCard title={t('known_title')} description={(
      <><span className="lg:hidden">{t('known_hint_short')}</span><span className="max-lg:hidden">{t('known_hint')}</span></>
    )}>
      <ul>
        <KnownRow label={t('known_stock')} shortLabel={t('known_stock_short')}
          sub={t('known_stock_sub', { count })} shortSub={t('known_stock_sub_short', { count })}
          amount={format.money(sources.stock_sale_value)} />
        <KnownRow label={t('known_receivables')} shortLabel={t('known_receivables_short')}
          sub={t('known_receivables_sub', { count: sources.unpaid_orders.length })} shortSub={t('known_receivables_sub', { count: sources.unpaid_orders.length })}
          amount={format.money(sources.unpaid_total)} />
      </ul>
    </SectionCard>
  );
}
