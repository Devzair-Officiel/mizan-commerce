/**
 * Helpers de formatage locale-aware (Intl).
 *
 * Principe : aucune locale n'est devinée. L'appelant fournit la locale, soit
 * via le hook `useFormat*` (qui lit `useLocale()`), soit en passant la valeur
 * de `getLocale()` côté serveur.
 *
 * Choix produit confirmé : on garde **les chiffres occidentaux (0123…)** même
 * en arabe. Ça reflète l'usage commercial réel des boutiques visées et évite
 * l'ambiguïté quand un client lit un montant à voix haute. La locale `ar` est
 * donc résolue en `ar-u-nu-latn` (extension Unicode BCP-47 `nu` = numbering
 * system).
 */

import type { Locale } from '@/i18n/locales';

/**
 * Override BCP-47 par locale.
 * `ar-u-nu-latn` force le système de numération latin tout en gardant le mois
 * écrit en arabe et la séparation conventionnelle. Pour `fr`/`en` on laisse
 * Intl résoudre naturellement.
 */
const BCP47_OVERRIDE: Partial<Record<Locale, string>> = {
  ar: 'ar-u-nu-latn',
};

function bcp47(locale: Locale): string {
  return BCP47_OVERRIDE[locale] ?? locale;
}

// ── Nombres ─────────────────────────────────────────────────────────────────

export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat(bcp47(locale), options).format(value);
}

// ── Monnaie ─────────────────────────────────────────────────────────────────

/**
 * Format monétaire "1 234,56 EUR" / "1,234.56 EUR" / "1٬234٫56 EUR" selon la locale.
 *
 * On utilise `style: 'decimal'` + suffixe manuel plutôt que `style: 'currency'`
 * car la devise vient de `shop.currency` (chaîne libre — EUR, MAD, XOF…) et
 * doit s'afficher à l'identique partout. `style: 'currency'` introduirait des
 * variations (symbole vs code, position du symbole) que les commerçants ne
 * veulent pas voir bouger d'un écran à l'autre.
 */
export function formatMoney(
  value: string | number,
  currency: string,
  locale: Locale,
  options?: Pick<Intl.NumberFormatOptions, 'minimumFractionDigits' | 'maximumFractionDigits'>,
): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(num)) return `0 ${currency}`;
  const max = options?.maximumFractionDigits ?? 2;
  const min = Math.min(options?.minimumFractionDigits ?? 2, max);
  const formatted = new Intl.NumberFormat(bcp47(locale), {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  }).format(num);
  return `${formatted} ${currency}`;
}

// ── Dates ───────────────────────────────────────────────────────────────────

function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(
  value: string | number | Date,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(bcp47(locale), options).format(date);
}

export function formatDateTime(
  value: string | number | Date,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  return formatDate(value, locale, options);
}
