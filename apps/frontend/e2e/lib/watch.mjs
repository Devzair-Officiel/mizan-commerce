/**
 * Console surveillée : toute erreur ou tout avertissement en console (hydratation,
 * clés manquantes, éléments imbriqués…) et toute exception non rattrapée fait
 * échouer l'audit.
 *
 * Exceptions autorisées : uniquement les messages de développement de Next.js /
 * React qui ne viennent pas de notre code (outillage du serveur de dev).
 * L'aperçu de la page publique (iframe sandbox sans allow-same-origin, origine
 * opaque) ne peut pas ouvrir le WebSocket de rechargement à chaud du serveur de dev :
 * erreur attendue en développement, voir components/public-page-admin/PreviewCard.tsx.
 */
const ALLOWED = [
  /\[Fast Refresh\]/, // rechargement à chaud du serveur de dev
  /\[HMR\]/, // idem
  /Download the React DevTools/, // invitation de React en développement
  /WebSocket connection to '[^']*\/_next\/webpack-hmr/, // HMR refusé à l'iframe d'aperçu (origine opaque)
];

const INTERACTIVE =
  'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=menuitem], [role=option], [role=checkbox], [role=switch], [role=tab]';

/** Collecte les problèmes de console de `page`, étiquetés par l'étape en cours. */
export function watchConsole(page) {
  const problems = [];
  let label = '';
  page.on('console', (m) => {
    const type = m.type();
    if (type !== 'error' && type !== 'warning') return;
    const text = m.text();
    if (ALLOWED.some((r) => r.test(text))) return;
    const url = m.location()?.url?.replace(/^https?:\/\/[^/]+/, '');
    const short = text.split('\n').slice(0, 3).join(' ⏎ ').slice(0, 400);
    problems.push(`[${label}] console.${type}: ${short}${url ? ` (${url})` : ''}`);
  });
  page.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${e.message.slice(0, 400)}`));
  return { problems, setLabel: (l) => { label = l; } };
}

/** Éléments interactifs imbriqués dans un autre élément interactif (DOM courant). */
export async function nestedInteractive(page) {
  return page.evaluate((sel) => {
    const describe = (n) => {
      const role = n.getAttribute('role') ? `[role=${n.getAttribute('role')}]` : '';
      const name = n.getAttribute('aria-label') ? `[aria-label="${n.getAttribute('aria-label')}"]` : '';
      return `${n.tagName.toLowerCase()}${role}${name} « ${(n.textContent || '').trim().slice(0, 40)} »`;
    };
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const parent = el.parentElement?.closest(sel);
      if (parent) out.push(`${describe(el)}  DANS  ${describe(parent)}`);
    }
    return [...new Set(out)];
  }, INTERACTIVE);
}
