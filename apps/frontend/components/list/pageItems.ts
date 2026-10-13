export type PageItem = number | 'gap';

/**
 * Pages affichées dans le pied de tableau : toutes jusqu'à 7, sinon la
 * première, la dernière, la courante et ses voisines. Une ellipse ne cache
 * jamais une seule page : on affiche la page à la place.
 */
export function pageItems(current: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const shown = new Set([1, totalPages, current - 1, current, current + 1]);
  if (current <= 2) shown.add(3);
  if (current >= totalPages - 1) shown.add(totalPages - 2);
  const pages = [...shown].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const items: PageItem[] = [];
  pages.forEach((page, i) => {
    const prev = pages[i - 1];
    if (prev !== undefined && page - prev === 2) items.push(prev + 1);
    else if (prev !== undefined && page - prev > 2) items.push('gap');
    items.push(page);
  });
  return items;
}
