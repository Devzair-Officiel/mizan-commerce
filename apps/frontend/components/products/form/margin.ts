/** Montant saisi (« 12,50 ») ou `null` s'il est vide ou illisible. */
export function amount(value: string): number | null {
  const n = Number(value.trim().replace(',', '.'));
  return value.trim() && Number.isFinite(n) ? n : null;
}

/** Marge par unité vendue, en pourcentage du prix de vente ; `null` tant qu'un des deux prix manque. */
export function margin(selling: number | null, purchase: number | null) {
  return selling && purchase !== null ? { rate: ((selling - purchase) / selling) * 100, amount: selling - purchase } : null;
}

/** Encadré de marge : vert, rouge en cas de perte (texte renforcé sur la bande teintée). */
export const marginBox = (loss: boolean) => ({
  box: `flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl px-3.5 py-3 text-sm ${loss ? 'bg-red-500/10' : 'bg-green-500/10'}`,
  rate: `font-bold ${loss ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`,
});
