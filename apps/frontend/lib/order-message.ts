/**
 * URS-078 : interpolation du template de message d'intérêt configuré par
 * le commerçant. Placeholders supportés :
 * - `{shop_name}` : nom affiché de la boutique
 * - `{item_name}` : nom de l'article ciblé
 * - `{price}` : prix formaté entre parenthèses (vide si masqué/absent)
 *
 * Un template vide retombe sur la formulation par défaut historique.
 */
export const DEFAULT_ORDER_MESSAGE_TEMPLATE =
  'Bonjour {shop_name}, je suis intéressé(e) par : {item_name}{price}.';

export interface OrderMessageVars {
  shop_name: string;
  item_name: string;
  /** Label de prix déjà formaté (ex. "12,50 €"), ou null si masqué/absent. */
  price_label: string | null;
}

export function buildOrderMessage(
  template: string | null | undefined,
  vars: OrderMessageVars,
): string {
  const tpl = (template && template.trim()) || DEFAULT_ORDER_MESSAGE_TEMPLATE;
  const priceFragment = vars.price_label ? ` (${vars.price_label})` : '';
  return tpl
    .replaceAll('{shop_name}', vars.shop_name)
    .replaceAll('{item_name}', vars.item_name)
    .replaceAll('{price}', priceFragment);
}
