/** Quantité d'un conditionnement (« 500ml », « 1,5L », « 100g », « x6 ») : fait partie du nom. */
const UNIT_QUANTITY = /^(?:x\d+|\d+(?:[.,]\d+)?(?:mg|g|kg|ml|cl|dl|l|cm|mm|m|pcs?|x))$/i;
/** Mention qui annonce un code (« Réf. », « Code : », « Art. », « # »). */
const CODE_PREFIX = /^(?:r[ée]f\.?:?|code:?|art\.?:?|n°|#)$/i;
const DIGITS = /\d/g;

/** Code fournisseur, référence ou code-barres : chiffres avec 3 chiffres au moins ou un séparateur, ou série de chiffres. */
function isCode(token: string): boolean {
  if (UNIT_QUANTITY.test(token)) return false;
  if (CODE_PREFIX.test(token)) return true;
  const digits = token.match(DIGITS)?.length ?? 0;
  if (digits === 0) return false;
  if (/^\d+$/.test(token)) return digits >= 4;
  return digits >= 3 || /[-_/.:]/.test(token);
}

/**
 * Nom d'article proposé à partir du libellé lu : sans les codes en début et en fin
 * (« SAC-4412 Sac toile naturelle 3760001234567 » → « Sac toile naturelle »), espaces réduits.
 * Rend le libellé tel quel (espaces réduits) s'il n'est fait que de codes.
 */
export function cleanInvoiceLabel(label: string): string {
  const tokens = label.split(/\s+/).filter((token) => token !== '' && !/^[-–—|/:;,.]+$/.test(token));
  let start = 0;
  let end = tokens.length;
  while (start < end && isCode(tokens[start] ?? '')) start += 1;
  while (end > start && isCode(tokens[end - 1] ?? '')) end -= 1;
  const kept = tokens.slice(start, end);
  return (kept.length > 0 ? kept : tokens).join(' ').slice(0, 200);
}
