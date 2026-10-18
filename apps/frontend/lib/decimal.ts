/**
 * Comparaisons de montants décimaux reçus du serveur (« 1234.50 ») sans passer par `parseFloat` :
 * le frontend n'additionne rien, il compare seulement ce que le serveur a calculé.
 */

/** « 12,5 » → « 12.5 » : la virgule saisie devient le séparateur attendu par l'API. */
export function normalizeDecimal(value: string): string {
  return value.trim().replace(',', '.');
}

function parts(value: string): { negative: boolean; whole: string; fraction: string } {
  const v = normalizeDecimal(value);
  const negative = v.startsWith('-');
  const [rawWhole = '0', rawFraction = ''] = v.replace(/^[-+]/, '').split('.');
  return { negative, whole: rawWhole.replace(/^0+(?=\d)/, ''), fraction: rawFraction.replace(/0+$/, '') };
}

/** -1, 0 ou 1 selon que `a` est plus petit, égal ou plus grand que `b`. */
export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  const x = parts(a);
  const y = parts(b);
  const xZero = /^0*$/.test(x.whole) && x.fraction === '';
  const yZero = /^0*$/.test(y.whole) && y.fraction === '';
  const xSign = xZero ? 0 : x.negative ? -1 : 1;
  const ySign = yZero ? 0 : y.negative ? -1 : 1;
  if (xSign !== ySign) return xSign < ySign ? -1 : 1;
  if (xSign === 0) return 0;
  let magnitude: -1 | 0 | 1 = 0;
  if (x.whole.length !== y.whole.length) magnitude = x.whole.length < y.whole.length ? -1 : 1;
  else if (x.whole !== y.whole) magnitude = x.whole < y.whole ? -1 : 1;
  else {
    const width = Math.max(x.fraction.length, y.fraction.length);
    const xf = x.fraction.padEnd(width, '0');
    const yf = y.fraction.padEnd(width, '0');
    if (xf !== yf) magnitude = xf < yf ? -1 : 1;
  }
  return (xSign === -1 ? -magnitude : magnitude) as -1 | 0 | 1;
}

export function isZeroDecimal(value: string): boolean {
  return compareDecimal(value, '0') === 0;
}

/** Montant saisi : chiffres, deux décimales au plus (virgule ou point). */
export const AMOUNT_PATTERN = /^\d{1,10}(?:[.,]\d{1,2})?$/;

/** Pourcentage ou ratio serveur (« 0.4321 ») → largeur CSS, bornée entre 0 et 100 %. */
export function ratioToPercent(ratio: string | null): string {
  if (ratio === null) return '0%';
  const { negative, whole, fraction } = parts(ratio);
  if (negative) return '0%';
  if (whole !== '0' && whole !== '') return '100%';
  const digits = (fraction + '0000').slice(0, 4);
  return `${digits.slice(0, 2).replace(/^0(?=\d)/, '')}.${digits.slice(2)}%`;
}
