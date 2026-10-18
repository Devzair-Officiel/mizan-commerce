'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import type { ZakatCalculation } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../useZakatFormat';

interface OutsideCardProps {
  calc: ZakatCalculation;
  format: ZakatFormat;
}

function OutsideRow({ title, text, amount }: { title: string; text: string; amount: string | null }) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-5 py-3">
        <p dir="auto" className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">{text}</p>
      </td>
      <td className="px-5 py-3 text-end text-sm whitespace-nowrap tabular-nums">
        {amount ?? <span className="text-muted-foreground">—</span>}
      </td>
    </tr>
  );
}

/** Desktop : ce qui est gardé pour mémoire sans entrer dans la base (créances douteuses, biens non comptés, biens d'usage). */
export function OutsideCard({ calc, format }: OutsideCardProps) {
  const t = useTranslations('zakat.result');
  const numbers = new Map(calc.review.receivable_orders.linked.map((order) => [order.order_id, order.order_number]));
  const doubtful = calc.receivable_items.filter((item) => item.doubtful);
  const notCounted = calc.other_assets.filter((asset) => !asset.counted);

  return (
    <div className="max-lg:hidden">
      <SectionCard title={t('outside_title')} description={t('outside_hint')}>
        <table className="w-full">
          <tbody>
            {doubtful.map((item, index) => {
              const number = item.order_id === null ? null : numbers.get(item.order_id);
              return (
                <OutsideRow key={`doubtful-${index}`} amount={format.money(item.amount)} text={t('outside_doubtful_text')}
                  title={number ? t('outside_doubtful_order', { number }) : t('outside_doubtful', { label: item.label })} />
              );
            })}
            {notCounted.map((asset, index) => (
              <OutsideRow key={`asset-${index}`} title={asset.label} text={t('outside_not_counted_text')} amount={format.money(asset.amount)} />
            ))}
            <OutsideRow title={t('outside_usage')} text={t('outside_usage_text')} amount={null} />
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}
