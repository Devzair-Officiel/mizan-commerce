/**
 * Aides communes aux audits des fenêtres d'export (commandes, stock) : contrôle segmenté, boutons
 * pleins, fenêtre qui tient sans défiler, réponses du proxy, PDF reçu intact, Web Share simulé.
 */
import { animationsDone } from './wait.mjs';

// Radio masqué visuellement (`sr-only`) : on clique sur son libellé, comme un utilisateur.
export const choose = (input) => input.locator('xpath=..').click();
export const flat = (text) => text.replace(/\s+/g, ' ').trim();
export const toast = (page, text) => page.locator('[data-sonner-toast]').filter({ hasText: text }).first();

/** Boutons pleins (fond opaque) de la fenêtre : un seul attendu, l'action de l'étape. */
export const filledButtons = (dialog) => dialog.evaluate((root) => [...root.querySelectorAll('button')]
  .filter((b) => b.checkVisibility() && !/^(transparent|rgba\(0, 0, 0, 0\))$|\/ 0\)$/.test(getComputedStyle(b).backgroundColor))
  .map((b) => b.innerText.trim()));

/** Ce qui dépasse de l'écran ou défile dans la fenêtre ; vide si elle tient. */
export async function fitIssue(dialog) {
  await animationsDone(dialog);
  return dialog.evaluate((root) => {
    const box = root.getBoundingClientRect();
    if (box.top < 0 || box.bottom > innerHeight + 1) return `fenêtre ${Math.round(box.top)}→${Math.round(box.bottom)}`;
    const scrolled = [root, ...root.querySelectorAll('*')].find((el) => el.scrollHeight > el.clientHeight + 1
      && /(auto|scroll)/.test(getComputedStyle(el).overflowY));
    return scrolled ? `défile de ${scrolled.scrollHeight - scrolled.clientHeight}px` : '';
  });
}

/** Réponse finale d'un rendu (la barre oblique finale passe par une redirection 308 de Next.js). */
export const finalResponse = (kind, part) => (response) => new RegExp(`/api/proxy/exports/${kind}/${part}/?(\\?|$)`).test(response.url())
  && (response.status() < 300 || response.status() >= 400);

// Le corps d'une réponse lue par fetch n'est pas relu par Playwright : on contrôle les octets reçus.
export const binaryPdf = (head, tail) => head === '%PDF' && tail.includes('%%EOF');

/** Web Share niveau 2 simulé (mobile) : le fichier partagé est gardé dans `window.__shared`. */
export function fakeShare() {
  window.__shared = null;
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: (data) => !!data?.files?.length });
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: async ({ files: [file], text: message = null }) => {
      // latin1 : octets bruts, comme le fichier téléchargé.
      const text = async (blob) => new TextDecoder('latin1').decode(await blob.arrayBuffer());
      window.__shared = {
        name: file.name, type: file.type, size: file.size, head: await text(file.slice(0, 4)), tail: await text(file.slice(-1024)), text: message,
      };
    },
  });
}
