'use client';

import { useTranslations } from 'next-intl';
import { compareDecimal } from '@/lib/decimal';
import type { FollowUpItem } from '@/lib/hooks/useZakatFollowUps';
import type { ZakatFormat } from '../useZakatFormat';

/**
 * Ce que le serveur a calculé, une phrase par fait : encaissé (avec la date saisie, jamais pour
 * une commande), part de la zakat, dû, versé. Versé au-delà du dû recalculé : les deux montants.
 */
export function FollowUpFacts({ item, format }: { item: FollowUpItem; format: ZakatFormat }) {
  const t = useTranslations('zakat.followup.fact');
  if (item.state === 'cancelled') return <p className="text-[0.8125rem] text-muted-foreground tabular-nums">{t('amount', { amount: format.money(item.amount) })}</p>;
  const collected = { collected: format.money(item.collected), amount: format.money(item.amount) };
  const counted = item.state !== 'pending' && item.state !== 'ignored';
  const facts = [
    item.collected_on ? t('collected_on', { ...collected, date: format.date(item.collected_on) }) : t('collected', collected),
    item.part !== null ? t('part', { part: format.money(item.part) }) : null,
    counted && compareDecimal(item.due, '0') > 0 ? t('due', { due: format.money(item.due) }) : null,
    compareDecimal(item.paid, item.due) > 0 ? t('overpaid', { paid: format.money(item.paid), due: format.money(item.due) })
      : compareDecimal(item.paid, '0') > 0 ? t('paid', { paid: format.money(item.paid) }) : null,
  ];
  return (
    <div className="flex flex-col gap-0.5 text-[0.8125rem] leading-snug text-muted-foreground tabular-nums">
      {facts.map((fact) => fact && <p key={fact}>{fact}</p>)}
    </div>
  );
}
