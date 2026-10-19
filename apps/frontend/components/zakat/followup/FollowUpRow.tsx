'use client';

import { useTranslations } from 'next-intl';
import { compareDecimal } from '@/lib/decimal';
import type { FollowUpItem } from '@/lib/hooks/useZakatFollowUps';
import { PersonalTag } from '../steps/PersonalTag';
import { useZakatFormat } from '../useZakatFormat';
import { DoubtfulChoice } from './DoubtfulChoice';
import { FollowUpActions } from './FollowUpActions';
import { FollowUpFacts } from './FollowUpFacts';
import { FollowUpStateBadge } from './FollowUpStateBadge';
import type { RunFollowUp } from './useFollowUpRun';

interface FollowUpRowProps {
  item: FollowUpItem;
  run: RunFollowUp;
  pending: boolean;
  /** Écran Résultat : choix D4 modifiable après coup, « Encaissée », retours en arrière. */
  full: boolean;
  onCollect: () => void;
}

/** Choix D4 à l'écran : à faire (accueil), ou modifiable tant qu'une option compte quelque chose (Résultat). */
function showsChoice(item: FollowUpItem, full: boolean): boolean {
  if (item.options === null) return false;
  if (item.state === 'choice_needed') return true;
  const counted = item.state === 'to_pay' || item.state === 'paid' || item.state === 'nothing_due';
  return full && counted && Object.values(item.options).some((amount) => compareDecimal(amount, '0') > 0);
}

/** Une créance suivie (montants dans la devise de sa fiche) : qui, d'où, ce qui est encaissé et dû, puis le geste attendu. */
export function FollowUpRow({ item, run, pending, full, onCollect }: FollowUpRowProps) {
  const t = useTranslations('zakat.followup');
  const format = useZakatFormat(item.currency);
  const title = item.customer_name || item.label || t('order', { number: item.order_number ?? '' });
  const where = { kind: item.kind, year: String(item.hawl_year) };
  const sub = item.order_number ? t('sub_order', { ...where, number: item.order_number }) : t('sub_manual', where);

  return (
    <li className="flex flex-col gap-2.5 border-b border-border px-4 py-3.5 last:border-b-0 lg:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground"><span dir="auto">{title}</span>{item.scope === 'personal' && <PersonalTag />}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
        </div>
        <FollowUpStateBadge item={item} />
      </div>
      <FollowUpFacts item={item} format={format} />
      {item.options && showsChoice(item, full) && (
        <DoubtfulChoice item={item} options={item.options} format={format} disabled={pending}
          onChange={(option) => run(item, { action: 'option', option })} />
      )}
      <FollowUpActions item={item} format={format} run={run} pending={pending} full={full} onCollect={onCollect} />
    </li>
  );
}
