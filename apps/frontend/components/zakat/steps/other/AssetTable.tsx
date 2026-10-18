'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/Switch';
import type { OtherAsset } from '@/lib/hooks/useZakat';
import { cn } from '@/lib/utils';
import type { ZakatFormat } from '../../useZakatFormat';
import { NUM, TD, TFOOT, TH } from '../tableStyles';

interface AssetTableProps {
  assets: OtherAsset[];
  /** Total des lignes comptées, calculé par le serveur. */
  total: string;
  format: ZakatFormat;
  onToggle: (index: number, counted: boolean) => void;
  onEdit: (index: number) => void;
}

/** Desktop : bien, catégorie, montant, interrupteur « Compté » et modification. */
export function AssetTable({ assets, total, format, onToggle, onEdit }: AssetTableProps) {
  const t = useTranslations('zakat');
  return (
    <table className="w-full border-collapse max-lg:hidden">
      <thead className="header-band">
        <tr>
          <th className={TH}>{t('steps.other.col_asset')}</th>
          <th className={TH}>{t('steps.other.col_category')}</th>
          <th className={`${TH} text-end`}>{t('steps.other.col_amount')}</th>
          <th className={TH}>{t('steps.other.col_counted')}</th>
          <th className={TH} />
        </tr>
      </thead>
      <tbody>
        {assets.map((asset, index) => (
          // Lignes sans identifiant : l'ordre de la fiche sert de clé.
          <tr key={`${asset.category}-${index}`} className={cn('group', !asset.counted && 'text-muted-foreground')}>
            <td dir="auto" className={cn(TD, 'font-semibold', asset.counted && 'text-foreground')}>{asset.label}</td>
            <td className={TD}>{t(`asset_category.${asset.category}`)}</td>
            <td className={cn(TD, NUM, 'font-semibold', asset.counted && 'text-foreground')}>{format.money(asset.amount)}</td>
            <td className={`${TD} py-0`}>
              <Switch checked={asset.counted} onChange={(next) => onToggle(index, next)} label={t('steps.other.counted_aria')} />
            </td>
            <td className={`${TD} w-14 py-0 text-end`}>
              <button type="button" onClick={() => onEdit(index)} aria-label={t('steps.other.edit_line', { label: asset.label })}
                className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30">
                <Pencil className="size-4" aria-hidden />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td className={TFOOT} colSpan={2}>{t('steps.other.total')}</td>
          <td className={`${TFOOT} ${NUM}`}>{format.money(total)}</td>
          <td className={TFOOT} colSpan={2} />
        </tr>
      </tfoot>
    </table>
  );
}
