/**
 * Fonctions de formule (`FEATURE_MIN_PLAN` côté backend) réellement livrées : seules elles
 * s'annoncent comme perdues lors d'une descente de formule (`lost_features` de l'aperçu).
 * Les autres (pages publiques, fidélité, inventaire visuel, QR codes, partenariats, journal
 * d'audit, support prioritaire) ne se promettent pas et ne se retirent donc pas.
 *
 * À étendre à chaque fonction livrée, voir docs/plan_avancement.md.
 *
 * `zakat_history` n'y est pas : l'historique de la zakat n'est restreint à aucune formule.
 * `invoices`, `whatsapp` et `auto_reminders` (Solo) ne se perdent pas d'une formule payante à
 * l'autre : sans libellé, ils ne s'affichent pas.
 */
export const SHIPPED_FEATURES: ReadonlySet<string> = new Set([
  'multi_user',
  'roles_permissions',
  'invoice_branding',
  'daily_digest',
  'exports',
  'ocr',
  'invoices',
  'whatsapp',
  'auto_reminders',
]);
