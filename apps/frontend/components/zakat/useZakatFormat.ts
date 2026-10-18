'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/lib/hooks/useFormat';
import { isZeroDecimal } from '@/lib/decimal';
import type { HijriDate } from '@/lib/hooks/useZakat';

/** Les dates de la zakat sont des jours (« 2027-02-22 ») : lues en UTC pour ne pas glisser d'un jour. */
const DAY = { timeZone: 'UTC' } as const;

/** « € », « $ », « د.م. » ; le code ISO si Intl ne connaît pas la devise. */
function currencySymbol(locale: string, currency: string): string {
  try {
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

/** Montants (chaînes du serveur, jamais recalculés) et dates grégorienne / hégirienne. */
export function useZakatFormat(currency: string) {
  const t = useTranslations('zakat');
  const f = useFormat();
  return useMemo(() => ({
    money: (value: string) => f.money(value, currency),
    /** Montant retiré de la base (dettes) : « − 7 490,00 € ». */
    minus: (value: string) => `− ${f.money(value, currency)}`,
    /** Unité affichée dans les champs de montant. */
    symbol: currencySymbol(f.locale, currency),
    /** Montant du serveur repris dans un champ (« 1234.50 » → « 1234,50 » en français), vide s'il vaut zéro. */
    amountInput: (value: string) => (isZeroDecimal(value) ? '' : value.replace('.', f.locale === 'fr' ? ',' : '.')),
    /** « 22 février 2027 » */
    date: (iso: string) => f.date(iso, { ...DAY, day: 'numeric', month: 'long', year: 'numeric' }),
    /** Instant du serveur (« modifié le ») : le jour dans le fuseau de l'appareil. */
    instantDate: (iso: string) => f.date(iso, { day: 'numeric', month: 'long', year: 'numeric' }),
    /** « lundi 22 février 2027 » */
    longDate: (iso: string) => f.date(iso, { ...DAY, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    /** « 14 février » */
    shortDate: (iso: string) => f.date(iso, { day: 'numeric', month: 'long' }),
    /** « 15 ramadan 1448 » */
    hijri: (h: HijriDate) => t('common.hijri_date', { day: h.day, month: t(`hijri_month.${h.month}`), year: String(h.year) }),
    /** Part de la boutique « 33.33 » → « 33,33 » : mise en forme seule, aucun calcul. */
    percent: (value: string) => f.number(Number(value), { maximumFractionDigits: 2 }),
    /** Quantité en stock « 12.500 » → « 12,5 » (vrac : trois décimales au plus). */
    quantity: (value: string) => f.number(Number(value), { maximumFractionDigits: 3 }),
    /** « seuil, dettes à déduire et valeur du stock » */
    list: (items: string[]) => new Intl.ListFormat(f.locale, { type: 'conjunction' }).format(items),
  }), [currency, f, t]);
}

export type ZakatFormat = ReturnType<typeof useZakatFormat>;
