/**
 * Attentes sur un état précis, à la place des pauses fixes (`waitForTimeout`).
 */

/** Animations et transitions de l'élément et de ses descendants terminées (ouverture d'une fenêtre, d'un menu). */
export function animationsDone(locator) {
  return locator.first().evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))));
}

/** Prochain changement du DOM de la page (`timeout` ms au plus ; aussitôt si la page est en cours de remplacement). */
export function domChange(page, timeout = 1000) {
  return page.evaluate((ms) => new Promise((resolve) => {
    const done = () => { observer.disconnect(); clearTimeout(timer); resolve(); };
    const observer = new MutationObserver(done);
    const timer = setTimeout(done, ms);
    observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  }), timeout).catch(() => {});
}

/** Focus arrivé sur le champ (2 s au plus) : true s'il y est. */
export function focusReached(locator) {
  return locator.evaluate((el) => new Promise((resolve) => {
    const start = Date.now();
    const poll = () => (el === document.activeElement ? resolve(true) : Date.now() - start > 2000 ? resolve(false) : requestAnimationFrame(poll));
    poll();
  }));
}

/**
 * Boîte de dialogue du navigateur (confirmation de sortie) attendue après `action`, refusée : son
 * message, ou '' si rien ne s'est ouvert (4 s).
 */
export async function dismissedDialog(page, action) {
  const dialog = page.waitForEvent('dialog', { timeout: 4000 }).then(async (d) => {
    const message = d.message();
    await d.dismiss();
    return message;
  }, () => '');
  await action();
  return dialog;
}
