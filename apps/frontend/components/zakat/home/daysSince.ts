const DAY_MS = 86_400_000;

/** Prix du gramme signalé au-delà d'une semaine : le cours des métaux bouge. */
export const PRICE_STALE_DAYS = 7;

/** Jours entiers écoulés depuis un instant ISO, jamais négatif. */
export function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / DAY_MS));
}
