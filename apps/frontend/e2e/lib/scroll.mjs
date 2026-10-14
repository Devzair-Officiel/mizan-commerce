/**
 * Défilement de la page : après chaque interaction d'un audit (clic, saisie, touche, navigation),
 * une fois toute fenêtre et tout menu refermés, la page doit encore défiler et il ne doit rien rester
 * de bloquant sur html, body et le contenu principal (overflow, pointer-events, inert, aria-hidden,
 * verrou de défilement de Base UI, position ou hauteur posées par un verrou).
 * Fenêtre ou menu encore ouvert : la page est verrouillée exprès, rien n'est vérifié.
 */

import { domChange } from './wait.mjs';

/** Fenêtre, menu ou liste d'options ouvert et visible dans la fenêtre du navigateur. */
function overlayOpen() {
  return [...document.querySelectorAll('[role=dialog], [role=alertdialog], [role=menu], [role=listbox]')].some((el) => {
    if (el.closest('[aria-hidden=true]')) return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.right > 0 && box.bottom > 0
      && box.left < innerWidth && box.top < innerHeight && getComputedStyle(el).visibility !== 'hidden';
  });
}

/** Restes de verrou sur html, body et le contenu principal (et ses ancêtres). */
function leftovers() {
  const html = document.documentElement;
  const main = document.querySelector('main');
  const out = [];
  for (const el of [html, document.body]) {
    const name = el.tagName.toLowerCase();
    const style = getComputedStyle(el);
    if (['hidden', 'clip'].includes(style.overflowY)) out.push(`${name} overflow-y: ${style.overflowY}`);
    if (style.pointerEvents === 'none') out.push(`${name} pointer-events: none`);
  }
  if (html.hasAttribute('data-base-ui-scroll-locked')) out.push('html data-base-ui-scroll-locked');
  if (document.body.style.position || document.body.style.height) {
    out.push(`body style « ${document.body.getAttribute('style')} »`);
  }
  for (let el = main; el && el !== html; el = el.parentElement) {
    const name = el === main ? 'main' : `${el.tagName.toLowerCase()} (ancêtre de main)`;
    if (el.inert) out.push(`${name} inert`);
    if (el.getAttribute('aria-hidden') === 'true') out.push(`${name} aria-hidden`);
    if (getComputedStyle(el).pointerEvents === 'none') out.push(`${name} pointer-events: none`);
  }
  return out;
}

/**
 * Point neutre pour la molette : dans la page, hors élément interactif, hors élément fixe
 * (notifications, barres), hors zone qui défile pour son propre compte. null si aucun.
 * L'élément qui a le focus ne doit pas non plus passer sous le pointeur quand la page défile de
 * `dy` : sa sortie (mouseleave) refermerait ce que le clavier vient d'ouvrir (bulle d'un graphique).
 */
function wheelPoint(dy) {
  const INTERACTIVE = 'a, button, input, select, textarea, iframe, label, [contenteditable], [tabindex]:not([tabindex="-1"]), '
    + '[role=button], [role=link], [role=menuitem], [role=option], [role=tab], [role=checkbox], [role=switch], [role=slider]';
  const blocked = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (['fixed', 'sticky'].includes(s.position)) return true;
      if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) return true;
      if (n.matches(INTERACTIVE)) return true;
    }
    return false;
  };
  for (const y of [0.5, 0.4, 0.6, 0.3, 0.7, 0.8]) {
    for (const x of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      const px = Math.round(innerWidth * x);
      const py = Math.round(innerHeight * y);
      const el = document.elementFromPoint(px, py);
      const focused = document.activeElement !== document.body ? document.activeElement : null;
      const passing = py + dy >= 0 && py + dy < innerHeight ? document.elementFromPoint(px, py + dy) : null;
      if (el && !blocked(el) && !(focused && passing && focused.contains(passing))) return { x: px, y: py };
    }
  }
  return null;
}

/** La molette fait-elle défiler la page ? null si la page est trop courte pour défiler. */
async function wheelScrolls(page) {
  const start = await page.evaluate(() => {
    const se = document.scrollingElement;
    if (se.scrollHeight - se.clientHeight < 40) return null;
    return { top: scrollY, down: scrollY + innerHeight < se.scrollHeight - 30 };
  });
  if (!start) return null;
  const dy = start.down ? 120 : -120;
  const point = await page.evaluate(wheelPoint, dy);
  if (!point) return null;
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, dy);
  const moved = await page.waitForFunction((top) => Math.abs(scrollY - top) > 1, start.top, { timeout: 1000 })
    .then(() => true, () => false);
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), start.top);
  return moved;
}

/** Un onglet ouvert par la page (wa.me) est-il encore ouvert ? */
async function popupOpen(page) {
  for (const other of page.context().pages()) {
    if (other !== page && !other.isClosed() && await other.opener() === page) return true;
  }
  return false;
}

/**
 * Problèmes de défilement de la page ([] si elle défile, ou si une fenêtre/un menu est ouvert).
 * Molette sans effet pendant qu'un onglet ouvert par la page est au premier plan : le navigateur
 * retarde ou perd les événements de la page d'origine, rien n'est conclu ; l'action suivante, une
 * fois l'onglet refermé, refait le contrôle.
 */
export async function scrollIssues(page, { timeout = 2000 } = {}) {
  const until = Date.now() + timeout;
  for (;;) {
    // Fenêtre en train de s'ouvrir (verrou posé avant qu'elle soit visible) ou de se fermer (verrou
    // libéré au tour suivant de la boucle d'événements) : nouveau contrôle au prochain changement
    // du DOM, pendant 2 s au plus.
    if (await page.evaluate(overlayOpen)) return [];
    let issues = await page.evaluate(leftovers);
    if (issues.length === 0 && await wheelScrolls(page) === false) {
      if (await popupOpen(page)) return [];
      issues = ['la molette ne fait pas défiler la page'];
    }
    const left = until - Date.now();
    if (issues.length === 0 || left <= 0) return issues;
    await domChange(page, left);
  }
}

const ACTIONS = {
  locator: ['click', 'dblclick', 'tap', 'fill', 'press', 'pressSequentially', 'check', 'uncheck', 'setChecked', 'selectOption', 'setInputFiles'],
  page: ['goto', 'goBack', 'goForward', 'reload', 'click', 'fill', 'press', 'tap', 'check', 'selectOption'],
  keyboard: ['press', 'type'],
};
const reporters = new WeakMap();
let locatorPatched = false;

/** Remplace `obj[name]` : l'action, puis le contrôle de défilement de `pageOf(this)`. */
function wrap(obj, name, pageOf, describe) {
  const original = obj[name];
  obj[name] = async function (...args) {
    const result = await original.apply(this, args);
    const page = pageOf(this);
    const report = page && reporters.get(page);
    if (report) await report(`${name} ${describe(this, args)}`);
    return result;
  };
}

/**
 * Contrôle de défilement après chaque interaction sur `page` ; les problèmes sont remis à
 * `add` (la console surveillée de la session : chaque audit les compte avec ceux de la console).
 */
export function guardScroll(page, add) {
  let last = '';
  reporters.set(page, async (action) => {
    let issues = [];
    try {
      issues = await scrollIssues(page);
    } catch {
      return; // Page en cours de navigation ou fermée : rien à vérifier.
    }
    const text = issues.length ? `défilement bloqué après ${action} : ${issues.join(', ')}` : '';
    if (text && text !== last) add(text);
    last = text;
  });
  if (!locatorPatched) {
    const proto = Object.getPrototypeOf(page.locator('body'));
    for (const name of ACTIONS.locator) wrap(proto, name, (l) => l.page(), (l) => String(l).slice(0, 120));
    locatorPatched = true;
  }
  for (const name of ACTIONS.page) wrap(page, name, (p) => p, (_, [arg]) => (typeof arg === 'string' ? arg.slice(0, 120) : ''));
  for (const name of ACTIONS.keyboard) wrap(page.keyboard, name, () => page, (_, [key]) => key);
}
