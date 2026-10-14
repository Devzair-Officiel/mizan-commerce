/**
 * Audit de l'onglet « Depuis une facture fournisseur » de /stock/entree selon la formule, à 1440px et 360px,
 * en français et en arabe, sur la boutique d'audit (articles et services) :
 * - en Pro : l'onglet reste visible, la carte « Disponible avec la formule Boutique+ » remplace l'envoi,
 *   aucune requête OCR n'est envoyée, « Saisir à la main » reste disponible ;
 * - de retour en Boutique+ : la carte disparaît, l'envoi de la facture revient.
 * La formule est réécrite dans la réponse `/subscriptions/current/` (comme le thème dans `/auth/me/`) :
 * aucun endpoint ne passe une boutique en Pro tant que Stripe n'est pas branché, la boutique reste en Boutique+.
 */
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';

const report = createReport();
const PRO = { code: 'pro', name: 'Pro' };

/** Réécrit la formule effective de la boutique (`pro`) ou laisse passer la vraie (`null`). */
async function routePlan(ctx, state) {
  await ctx.route(/\/api\/proxy\/subscriptions\/current\/?(\?.*)?$/, async (route) => {
    if (!state.pro) return route.continue();
    try {
      const response = await route.fetch();
      const subscription = await response.json();
      await route.fulfill({
        response,
        json: { ...subscription, effective_plan_code: PRO.code, plan: { ...subscription.plan, ...PRO } },
      });
    } catch {
      // Contexte fermé pendant la requête (fin d'audit) : plus personne ne l'attend.
    }
  });
}

/** Ce qu'affiche le panneau de l'onglet actif. */
async function panel(page, t, locale) {
  const tabpanel = page.getByRole('tabpanel');
  return {
    card: await tabpanel.getByRole('heading', { name: fmt(locale, 'settings.upgrade.title', { feature: 'ocr' }), exact: true }).isVisible(),
    text: await tabpanel.getByText(fmt(locale, 'settings.upgrade.text', { feature: 'ocr' }), { exact: true }).isVisible(),
    files: await tabpanel.locator('input[type=file]').count(),
  };
}

async function openInvoiceTab(page) {
  await page.goto(`${BASE}/stock/entree?mode=facture`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('tabpanel').waitFor({ timeout: 10000 });
}

const browser = await launch();
for (const viewport of VIEWPORTS) {
  const { ctx, page, watch, setLocale } = await openSession(browser, viewport);
  const state = { pro: false };
  await routePlan(ctx, state);
  const ocr = [];
  page.on('request', (req) => {
    if (new URL(req.url()).pathname.startsWith('/api/proxy/ocr/')) ocr.push(`${req.method()} ${new URL(req.url()).pathname}`);
  });
  for (const locale of ['fr', 'ar']) {
    if (!inMatrix(viewport, locale)) continue;
    const label = `${viewport.name}px ${locale}`;
    console.log(`\n=== ${label}`);
    await setLocale(locale);
    watch.setLabel(label);
    const before = watch.problems.length;
    const t = (key) => msg(locale, key);
    try {
      state.pro = true;
      ocr.length = 0;
      await openInvoiceTab(page);
      const invoiceTab = page.locator('#stock-entry-tab-invoice');
      const locked = await panel(page, t, locale);
      report.check(
        (await invoiceTab.isVisible()) && (await invoiceTab.getAttribute('aria-selected')) === 'true'
          && locked.card && locked.text && locked.files === 0,
        `${label} : en Pro, onglet facture visible, carte « ${fmt(locale, 'settings.upgrade.title', { feature: 'ocr' })} » à la place de l'envoi (${locked.files} champ fichier)`,
      );
      report.check(ocr.length === 0, `${label} : en Pro, aucune requête OCR${ocr.length ? ` (${ocr.join(', ')})` : ''}`);
      await page.locator('#stock-entry-tab-manual').click();
      await page.waitForURL(/\/stock\/entree$/);
      await page.waitForLoadState('networkidle');
      const manual = await panel(page, t, locale);
      report.check(
        (await page.locator('#stock-entry-tab-manual').getAttribute('aria-selected')) === 'true' && !manual.card,
        `${label} : en Pro, « ${t('stock.entry.mode.manual')} » reste disponible`,
      );
      state.pro = false;
      await openInvoiceTab(page);
      await page.getByRole('tabpanel').locator('input[type=file]').first().waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
      const unlocked = await panel(page, t, locale);
      report.check(!unlocked.card && unlocked.files > 0, `${label} : de retour en Boutique+, l'envoi de la facture revient, plus de carte`);
    } catch (error) {
      report.check(false, `${label} : interrompu — ${error.message.split('\n')[0]}`);
    } finally {
      state.pro = false;
    }
    const problems = watch.problems.slice(before);
    report.check(problems.length === 0, `${label} : console propre, défilement jamais bloqué${problems.map((p) => `\n      ${p}`).join('')}`);
  }
  await ctx.close();
}
await browser.close();
report.finish();
