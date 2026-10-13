'use client';

import { useTranslations } from 'next-intl';
import { useFormatNumber } from '@/lib/hooks/useFormat';
import { amount, margin, marginBox } from '../margin';
import type { FormatRow } from '../productFormSchema';

/** Marge sur la plage des formats dont les deux prix sont saisis (« Marge de 58 à 60 % selon le format »). */
export function FormatsMargin({ rows }: { rows: FormatRow[] }) {
  const t = useTranslations('articles.form');
  const formatNumber = useFormatNumber();
  const rates = rows.flatMap((r) => margin(amount(r.selling_price), amount(r.purchase_price))?.rate ?? []);
  if (rates.length === 0) return null;
  const [min, max] = [Math.min(...rates), Math.max(...rates)].map((n) => formatNumber(n, { maximumFractionDigits: 0 })) as [string, string];
  const style = marginBox(Math.min(...rates) < 0);
  return (
    <p className={style.box}>
      <span className={style.rate}>
        {min === max ? t('margin_rate', { margin: min }) : t('formats_margin_range', { min, max })}
      </span>
      <span className="text-foreground">{t(min === max ? 'formats_margin_same' : 'formats_margin_varies')}</span>
    </p>
  );
}
