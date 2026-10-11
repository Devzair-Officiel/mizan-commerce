import { useTranslations } from 'next-intl';
import { Check, ShieldCheck, X } from 'lucide-react';
import { EXCLUDED_ITEMS, type ExcludedItem } from '@/lib/hooks/useZakat';

export function ExcludedItemsList({ acknowledged }: { acknowledged: ExcludedItem[] }) {
  const t = useTranslations('zakat');
  return (
    <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-primary" size={16} />
        <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
          {t('detail.excluded_title')}
        </p>
      </div>
      <ul className="flex flex-col gap-1 text-xs">
        {EXCLUDED_ITEMS.map((item) => {
          const ack = acknowledged.includes(item);
          return (
            <li key={item} className="flex items-center gap-2">
              {ack ? (
                <Check size={12} className="text-primary shrink-0" />
              ) : (
                <X size={12} className="text-muted-foreground/50 shrink-0" />
              )}
              <span className={ack ? 'text-foreground' : 'text-muted-foreground/60'}>
                {t(`excluded_item.${item}`)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted-foreground mt-1">
        {t('detail.excluded_help')}
      </p>
    </div>
  );
}
