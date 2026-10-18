'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import type { StockLine, StockValuation, ZakatSources } from '@/lib/hooks/useZakat';
import { isDefaultVariant } from '@/lib/products';
import type { ZakatFormat } from '../useZakatFormat';
import { NUM, TD, TFOOT, TH } from './tableStyles';

interface StockTableCardProps {
  sources: ZakatSources;
  valuation: StockValuation;
  format: ZakatFormat;
}

const priceOf = (line: StockLine, valuation: StockValuation) => (valuation === 'sale' ? line.sale_price : line.purchase_price);
const valueOf = (line: StockLine, valuation: StockValuation) => (valuation === 'sale' ? line.sale_value : line.purchase_value);

/** Les cinq articles qui pèsent le plus (Q4), le total de tout le stock et le lien vers la page Stock. */
export function StockTableCard({ sources, valuation, format }: StockTableCardProps) {
  const t = useTranslations('zakat.steps.stock');
  const lines = sources.top_stock_lines[valuation];
  const count = sources.active_formats_count;
  // Valeur de tout le catalogue (hors marchandises saisies), calculée par le serveur.
  const total = valuation === 'sale' ? sources.stock_sale_value : sources.stock_purchase_value;
  const money = (value: string | null) => (value === null ? '—' : format.money(value));
  const packaging = (line: StockLine) => (isDefaultVariant(line.packaging_name) ? null : line.packaging_name);

  return (
    <SectionCard title={t('table_title')} description={t('table_hint')}
      rightLink={count > lines.length ? { label: t('see_all', { count }), href: '/stock' } : undefined}>
      {lines.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <>
          <table className="w-full border-collapse max-lg:hidden">
            <thead className="header-band">
              <tr>
                <th className={TH}>{t('col_item')}</th>
                <th className={`${TH} text-end`}>{t('col_qty')}</th>
                <th className={`${TH} text-end`}>{t('col_price', { valuation })}</th>
                <th className={`${TH} text-end`}>{t('col_value')}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.variant_id} className="group">
                  <td className={TD}>
                    <div className="font-semibold text-foreground">{line.product_name}</div>
                    {packaging(line) && <div className="text-[0.78125rem] text-muted-foreground">{packaging(line)}</div>}
                  </td>
                  <td className={`${TD} ${NUM}`}>{format.quantity(line.quantity)}</td>
                  <td className={`${TD} ${NUM}`}>{money(priceOf(line, valuation))}</td>
                  <td className={`${TD} ${NUM} font-semibold text-foreground`}>{money(valueOf(line, valuation))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className={TFOOT} colSpan={3}>{t('total', { count })}</td>
                <td className={`${TFOOT} ${NUM}`}>{format.money(total)}</td>
              </tr>
            </tfoot>
          </table>
          <ul className="lg:hidden">
            {lines.map((line) => (
              <li key={line.variant_id} className="flex items-start justify-between gap-3 border-b border-border px-5 py-3 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold text-foreground">{line.product_name}</div>
                  <div className="text-[0.78125rem] text-muted-foreground tabular-nums">
                    {packaging(line) && <>{packaging(line)} · </>}{format.quantity(line.quantity)} × {money(priceOf(line, valuation))}
                  </div>
                </div>
                <span className="font-semibold whitespace-nowrap text-foreground tabular-nums">{money(valueOf(line, valuation))}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 bg-muted/50 px-5 py-3 text-sm font-semibold">
              <span>{t('total', { count })}</span>
              <span className="whitespace-nowrap tabular-nums">{format.money(total)}</span>
            </li>
          </ul>
        </>
      )}
    </SectionCard>
  );
}
