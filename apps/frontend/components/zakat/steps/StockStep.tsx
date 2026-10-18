'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { TriangleAlert } from 'lucide-react';
import { SectionCard } from '@/components/ui/SectionCard';
import { useZakatSources, type ZakatSources } from '@/lib/hooks/useZakat';
import { CalcChoice } from '../choice/CalcChoice';
import { AmountField } from './AmountField';
import { StepHeading } from './StepHeading';
import { StockTableCard } from './StockTableCard';
import type { StepProps } from './types';

/** Formats sans prix d'achat : un seul article → sa fiche, sinon le catalogue. */
function MissingPrices({ missing }: { missing: ZakatSources['formats_without_purchase_price'] }) {
  const t = useTranslations('zakat.steps.stock');
  const products = new Set(missing.map((m) => m.product_id));
  const [first] = missing;
  const href = products.size === 1 && first ? `/products/${first.product_id}/edit` : '/products';
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl bg-amber-500/10 px-3.5 py-3 text-[0.84375rem] leading-normal text-amber-700 dark:text-amber-400">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        {t('missing_prices', { count: missing.length })}{' '}
        <Link href={href} className="font-semibold underline underline-offset-2">{t('complete_prices')}</Link>
      </p>
    </div>
  );
}

/** Biens d'usage : rappel et fiabilité de la source. */
function UsageNote() {
  const t = useTranslations('zakat.steps.stock');
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[0.875rem] border border-dashed border-border px-4.5 py-3.5 text-[0.84375rem]">
      <div>
        <p className="font-semibold text-foreground">{t('usage_title')}</p>
        <p className="mt-0.5 text-muted-foreground">{t('usage_text')}</p>
      </div>
      <span className="inline-flex min-h-5.5 items-center rounded-full bg-green-500/10 px-2 text-[0.71875rem] font-semibold text-green-700 dark:text-green-400">
        {t('usage_badge')}
      </span>
    </div>
  );
}

/**
 * Étape 3 : valeur du stock. Tant que le jour J n'est pas passé, la fiche suit le catalogue (détail des
 * articles) ; après, Mizan garde le stock de ce jour-là et le détail n'est plus disponible.
 */
export function StockStep({ calc, save, format }: StepProps) {
  const t = useTranslations('zakat');
  const { data: sources } = useZakatSources();
  const valuation = calc.choices.stock_valuation ?? 'sale';
  const live = calc.review.is_live;
  const amounts = { sale: format.money(calc.totals.stock_at_sale_price), purchase: format.money(calc.totals.stock_at_purchase_price) };

  return (
    <>
      <StepHeading title={t('steps.stock.table_title')} lead={t('choice.stock_valuation.question')} />
      <CalcChoice calc={calc} save={save} format={format} name="stock_valuation" amounts={amounts} questionIsHeading />
      {live && sources && sources.formats_without_purchase_price.length > 0 && (
        <MissingPrices missing={sources.formats_without_purchase_price} />
      )}
      {live && sources && (
        <StockTableCard sources={sources} valuation={valuation} format={format} />
      )}
      {!live && <p className="rounded-xl bg-muted px-3.5 py-3 text-[0.84375rem] text-foreground">{t('steps.stock.frozen')}</p>}
      <SectionCard title={t('steps.stock.extra_title')} description={t('steps.stock.extra_hint')}>
        <div className="p-5">
          <AmountField label={t('steps.stock.extra_label')} suffix={format.symbol} initial={format.amountInput(calc.stock_extra)}
            onSave={(amount) => save({ stock_extra: amount })} />
        </div>
      </SectionCard>
      <UsageNote />
    </>
  );
}
