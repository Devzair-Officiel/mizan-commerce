/**
 * Gabarit de formulaire v3 (`components/form/`) : cartes en deux colonnes sur desktop, tout
 * visible ; cartes empilées sur mobile, les facultatives repliables (un <button> dans un <h2>).
 */

export const visibleButton = (page, name) => page.getByRole('button', { name, exact: true }).filter({ visible: true });
// Nom accessible du champ (l'astérisque des champs obligatoires est aria-hidden).
export const textbox = (page, name) => page.getByRole('textbox', { name, exact: true });
export const isFocused = (locator) => locator.evaluate((el) => el === document.activeElement);

/** En-tête repliable (mobile) de la carte `title`. */
export const cardToggle = (page, title) => page.locator('form section h2 > button').filter({ hasText: title });

/** Mobile : ouvre la carte facultative `title`. Desktop : rien à faire, tout est visible. */
export async function openCard(page, ctx, title) {
  if (!ctx.viewport.mobile) return;
  const toggle = cardToggle(page, title);
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
}

/** Mobile : referme la carte et renvoie son en-tête (titre et résumé). Desktop : chaîne vide. */
export async function closeCard(page, ctx, title) {
  if (!ctx.viewport.mobile) return '';
  const toggle = cardToggle(page, title);
  if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click();
  return toggle.innerText();
}

/** Ouvre la carte, remplit ses champs, la referme : son résumé est renvoyé (mobile). */
export async function fillCard(page, ctx, title, fill) {
  await openCard(page, ctx, title);
  await fill();
  return closeCard(page, ctx, title);
}

/** Cartes du formulaire : titre, position, état de l'en-tête repliable (null pour une carte obligatoire). */
export function cards(page) {
  return page.locator('form section[aria-labelledby]').evaluateAll((els) => els.map((el) => {
    const box = el.getBoundingClientRect();
    const toggle = el.querySelector('h2 > button');
    return {
      title: document.getElementById(el.getAttribute('aria-labelledby')).textContent.trim(),
      top: Math.round(box.top + window.scrollY),
      left: Math.round(box.left),
      expanded: toggle?.getAttribute('aria-expanded') ?? null,
      toggleVisible: Boolean(toggle?.offsetParent),
    };
  }));
}

/**
 * Disposition : desktop, `side` dans la colonne latérale, le reste dans la principale, en haut
 * côte à côte, aucun en-tête repliable, tous les champs visibles ; mobile, cartes empilées dans
 * l'ordre `order`, les facultatives repliées.
 */
export async function layoutOk(page, ctx, { order, side }) {
  const list = await cards(page);
  if (ctx.viewport.mobile) {
    const stacked = [...list].sort((a, b) => a.top - b.top).map((c) => c.title);
    return stacked.join('|') === order.join('|') && list.every((c) => c.expanded === null || c.expanded === 'false');
  }
  const aside = list.filter((c) => side.includes(c.title));
  const main = list.filter((c) => !side.includes(c.title));
  // Champs atteignables au clavier (hors champ caché d'un menu Base UI, `tabindex=-1`) : tous visibles.
  const hidden = await page.locator('form').evaluate((form) => [...form.querySelectorAll('input, textarea, button[role=combobox]')]
    .filter((el) => el.tabIndex >= 0 && el.getAttribute('aria-hidden') !== 'true' && !['hidden', 'file'].includes(el.type) && !el.checkVisibility()).length);
  return aside.length === side.length && list.length === order.length && list.every((c) => !c.toggleVisible) && hidden === 0
    && aside.every((c) => c.left === aside[0].left) && main.every((c) => c.left === main[0].left)
    && aside[0].left !== main[0].left && Math.abs(aside[0].top - main[0].top) <= 2;
}
