'use client';

import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/Switch';
import type { OtherAsset, ZakatCalculation } from '@/lib/hooks/useZakat';
import { cn } from '@/lib/utils';
import type { ZakatFormat } from '../../useZakatFormat';
import { AddLineButton } from '../AddLineButton';
import { AssetTable } from './AssetTable';

interface AssetListCardProps {
  calc: ZakatCalculation;
  format: ZakatFormat;
  onToggle: (index: number, counted: boolean) => void;
  onEdit: (index: number) => void;
  onAdd: () => void;
}

/** Mobile : la ligne se touche pour modifier ; une ligne non comptée passe en gris. */
function AssetRow({ asset, format, onToggle, onEdit }: { asset: OtherAsset; format: ZakatFormat; onToggle: (counted: boolean) => void; onEdit: () => void }) {
  const t = useTranslations('zakat');
  return (
    <li className={cn('flex items-center gap-3 border-b border-border px-4 py-1.5 last:border-b-0', !asset.counted && 'text-muted-foreground')}>
      <button type="button" onClick={onEdit} className="min-h-11 min-w-0 flex-1 py-1.5 text-start outline-none focus-visible:ring-3 focus-visible:ring-primary/30">
        <span dir="auto" className={cn('block text-sm font-semibold', asset.counted && 'text-foreground')}>{asset.label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {t(`asset_category.${asset.category}`)}{!asset.counted && <> · {t('steps.other.not_counted')}</>}
        </span>
      </button>
      <span className={cn('text-sm font-semibold whitespace-nowrap tabular-nums', asset.counted && 'text-foreground')}>{format.money(asset.amount)}</span>
      <Switch checked={asset.counted} onChange={onToggle} label={t('steps.other.counted_aria')} />
    </li>
  );
}

/** Biens ajoutés pour l'année : valeur au jour J, compté ou non, total des lignes comptées (serveur). */
export function AssetListCard({ calc, format, onToggle, onEdit, onAdd }: AssetListCardProps) {
  const t = useTranslations('zakat.steps.other');
  const assets = calc.other_assets;
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="header-band border-b border-border px-4 py-4 lg:px-5">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">{t('list_title', { year: String(calc.hawl_year) })}</h2>
        <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted-foreground">
          <span className="max-lg:hidden">{t('list_hint')}</span>
          <span className="lg:hidden">{t('list_hint_short')}</span>
        </p>
      </div>
      {assets.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground lg:px-5">{t('empty')}</p>
      ) : (
        <>
          <AssetTable assets={assets} total={calc.totals.other_assets} format={format} onToggle={onToggle} onEdit={onEdit} />
          <ul className="lg:hidden">
            {assets.map((asset, index) => (
              <AssetRow key={`${asset.category}-${index}`} asset={asset} format={format}
                onToggle={(next) => onToggle(index, next)} onEdit={() => onEdit(index)} />
            ))}
          </ul>
          <p className="flex justify-between gap-3 border-t border-border bg-muted/50 px-4 py-2.5 text-[0.84375rem] lg:hidden">
            <span>{t('total')}</span>
            <span className="font-semibold whitespace-nowrap tabular-nums">{format.money(calc.totals.other_assets)}</span>
          </p>
        </>
      )}
      <div className="px-5 pt-4 pb-5 max-lg:hidden">
        <AddLineButton label={t('add')} onClick={onAdd} />
      </div>
    </section>
  );
}
