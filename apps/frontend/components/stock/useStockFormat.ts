'use client';

import { useTranslations } from 'next-intl';
import { bucketOf } from '@/components/orders/list/bucket';
import { useFormat } from '@/lib/hooks/useFormat';
import { isDefaultVariant } from '@/lib/products';

/**
 * Formats partagés des écrans du stock : quantités (jusqu'à 3 décimales, vrac),
 * dates relatives (« Aujourd'hui, 11:20 », « Hier », « 6 oct. ») et libellé
 * d'un format (« Sandales cuir naturel, Pointure 41 »).
 */
export function useStockFormat() {
  const t = useTranslations('stock.common');
  const f = useFormat();
  const sameYear = (iso: string) => new Date(iso).getFullYear() === new Date().getFullYear();
  const dayOptions = (iso: string): Intl.DateTimeFormatOptions => (
    { day: 'numeric', month: 'short', year: sameYear(iso) ? undefined : 'numeric' }
  );

  return {
    /** Signe moins typographique (« −2 ») plutôt que le trait d'union. */
    quantity: (value: string | number, signed?: boolean) => f.number(Number(value), {
      maximumFractionDigits: 3, signDisplay: signed ? 'exceptZero' : 'auto',
    }).replace('-', '\u2212'),
    /** Heure seule (cartes déjà groupées par jour). */
    time: (iso: string): string => f.dateTime(iso, { hour: '2-digit', minute: '2-digit' }),
    /** Date d'un mouvement, avec l'heure. */
    dateTime(iso: string): string {
      const bucket = bucketOf(iso);
      const time = f.dateTime(iso, { hour: '2-digit', minute: '2-digit' });
      if (bucket === 'today') return t('today_at', { time });
      if (bucket === 'yesterday') return t('yesterday_at', { time });
      return f.dateTime(iso, { ...dayOptions(iso), hour: '2-digit', minute: '2-digit' });
    },
    /** Jour seulement (dernier mouvement d'un format). */
    day(iso: string): string {
      const bucket = bucketOf(iso);
      if (bucket === 'today') return t('today');
      if (bucket === 'yesterday') return t('yesterday');
      return f.date(iso, dayOptions(iso));
    },
    variantLabel: (productName: string, packagingName: string): string => (
      isDefaultVariant(packagingName) ? productName : t('variant_label', { product: productName, format: packagingName })
    ),
  };
}
