/** Lot 7c-2 : sous-navigation Solo, Boutique, barre collante et largeur des pages de réglages. */
import { VIEWPORTS, inMatrix, createReport, launch, openSession } from './lib/session.mjs';
import { msg, fmt } from './lib/messages.mjs';
import { api } from './lib/products.mjs';
import { nestedInteractive } from './lib/watch.mjs';
import { settingsPlan, settingsGoto, settingsOverflow } from './lib/settings.mjs';

const report = createReport();
const browser = await launch();
const paths = ['/settings', '/settings/team', '/settings/invoices', '/settings/messages', '/settings/public-page', '/settings/subscription'];

async function navigation(page, locale, label, mobile) {
  const nav = page.locator('[data-settings-nav]');
  const other = page.locator('[data-other-settings]');
  const source = mobile ? other : nav;
  report.check(mobile ? !await nav.isVisible() && await other.isVisible() : await nav.isVisible() && !await other.isVisible(),
    `${label} : sous-navigation desktop seule, « Autres réglages » sur mobile seul`);
  const hrefs = await source.locator('a').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
  report.check(hrefs.join() === paths.slice(mobile ? 1 : 0).join(), `${label} : destinations dans l'ordre prévu`);
  const locked = await source.locator('[data-settings-lock]').allTextContents();
  const planName = msg(locale, 'settings.subscription.plans.boutique.name');
  report.check(locked.length === 2 && locked.every((text) => text === planName), `${label} : Solo, Équipe et Page publique visibles avec cadenas et formule traduite`);
  if (!mobile) {
    report.check(await nav.getAttribute('aria-label') === msg(locale, 'settings.navigation.label')
      && (await nav.boundingBox()).width === 208
      && await nav.locator('[aria-current=page]').getAttribute('href') === '/settings', `${label} : nav nommée, 208 px, Boutique active`);
    await page.evaluate(() => window.scrollTo(0, 400));
    report.check(Math.abs((await nav.boundingBox()).y - 32) < 2, `${label} : sous-navigation collante`);
  }
  await source.locator('a[href="/settings/team"]').click();
  await page.getByRole('heading', { name: fmt(locale, 'settings.upgrade.title', { feature: 'multi_user', plan: 'boutique', kind: 'both' }), exact: true }).waitFor();
  report.check(new URL(page.url()).pathname === '/settings/team'
    && (mobile || await nav.locator('[aria-current=page]').getAttribute('href') === '/settings/team'), `${label} : le lien verrouillé ouvre la page et sa carte de mise à niveau`);
  await settingsGoto(page);
  await (mobile ? page.locator('[data-other-settings]') : nav).locator('a[href="/settings/public-page"]').click();
  await page.getByRole('heading', { name: fmt(locale, 'settings.upgrade.title', { feature: 'public_pages', plan: 'boutique', kind: 'both' }), exact: true }).waitFor();
  report.check(new URL(page.url()).pathname === '/settings/public-page', `${label} : Page publique verrouillée accessible`);
}

async function boutique(page, locale, label, original) {
  await settingsGoto(page);
  const field = page.locator('#name');
  await field.waitFor();
  const form = page.locator('[data-settings-content] form');
  const headings = await form.getByRole('heading').filter({ visible: true }).allTextContents();
  // La zakat a ses propres réglages (/zakat/reglages) : plus de carte ici.
  report.check(headings.includes(msg(locale, 'settings.identity.title')) && headings.includes(msg(locale, 'settings.preferences.title'))
    && !headings.includes(msg(locale, 'zakat.home.title')) && await page.locator('#catalog_kind').isVisible(),
  `${label} : cartes Identité et Préférences à plat, plus de carte Zakat, logo en tête`);
  const bar = page.locator('[data-settings-actions]');
  report.check(await bar.count() === 0, `${label} : aucune barre ni action masquée au clavier sans modification`);
  await field.fill(`${original.name} audit`);
  await bar.waitFor();
  for (const scroll of [0, 500]) {
    await page.evaluate((y) => window.scrollTo(0, y), scroll);
    const [b, c] = [await bar.boundingBox(), await page.locator('[data-settings-content]').boundingBox()];
    report.check(b.x >= c.x && b.x + b.width <= c.x + c.width + 1 && b.y >= 0 && b.y + b.height <= page.viewportSize().height,
      `${label} : barre visible en défilement (${scroll}), limitée à la colonne de contenu`);
  }
  await bar.getByRole('button', { name: msg(locale, 'settings.actions.cancel'), exact: true }).click();
  report.check(await bar.count() === 0 && await field.inputValue() === original.name, `${label} : Annuler restaure les valeurs et retire la barre`);
  await field.fill(`${original.name} audit`);
  const saved = page.waitForResponse((r) => r.url().includes('/api/proxy/shop') && r.request().method() === 'PATCH' && (r.status() < 300 || r.status() >= 400));
  await bar.getByRole('button', { name: msg(locale, 'settings.actions.save'), exact: true }).click();
  report.check((await saved).ok(), `${label} : enregistrement par l'API`);
  await bar.waitFor({ state: 'detached' });
  await page.reload();
  await field.waitFor();
  report.check(await field.inputValue() === `${original.name} audit`, `${label} : modification conservée au rechargement`);
  await api(page, 'shop/', { method: 'PATCH', data: { name: original.name } });
}

async function widthChecks(page, locale, label, mobile) {
  const viewport = page.viewportSize();
  for (const screenWidth of mobile ? [viewport.width] : [1024, viewport.width]) {
    await page.setViewportSize({ ...viewport, width: screenWidth });
    for (const path of ['/settings/invoices', '/settings/messages', '/settings/public-page', '/settings/subscription']) {
      await settingsGoto(page, path);
      const overflow = await settingsOverflow(page);
      report.check(!overflow.document && overflow.elements.length === 0, `${label} (écran ${screenWidth}px) : ${path}, aucun débordement${overflow.elements.map((e) => `\n      ${e}`).join('')}`);
      if (path !== '/settings/subscription' || mobile || screenWidth !== viewport.width) continue;
      // Même viewport, deux largeurs réelles de colonne : la grille dépend du conteneur.
      const content = page.locator('[data-settings-content]');
      for (const width of [840, 920]) {
        await content.evaluate((el, w) => { el.style.width = `${w}px`; }, width);
        const columns = await page.locator('[data-plan]').filter({ visible: true }).evaluateAll((els) => {
          const tops = els.map((el) => Math.round(el.getBoundingClientRect().top));
          return [...new Set(tops)].map((y) => tops.filter((t) => t === y).length).join('+');
        });
        report.check(columns === (width < 880 ? '2+2' : '4'), `${label} : conteneur ${width}px → formules ${columns}`);
      }
      await content.evaluate((el) => { el.style.width = ''; });
    }
  }
  await page.setViewportSize(viewport);
}

try {
  for (const viewport of VIEWPORTS) {
    const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
    const state = { code: 'solo' };
    await settingsPlan(ctx, state);
    // Éditeur complet, sans créer ni publier de vitrine sur le serveur.
    await ctx.route(/\/api\/proxy\/public-page\/?(\?.*)?$/, (route) => route.fulfill({ json: { exists: true, page: {
      id: 'audit-settings', slug: 'audit-settings', display_name: 'Boutique Audit', is_active: true,
      is_published: false, is_live: false, tagline: '', description: '', logo_object_key: '', logo_url: null,
      cover_object_key: '', cover_url: null, theme: 'classic', primary_color: '#123456', order_message_template: '',
      published_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      sections: [], catalog_items: [], contact_buttons: [],
    } } }));
    await ctx.route(/\/boutique\/audit-settings\?/, (route) => route.fulfill({ contentType: 'text/html', body: '<html lang="fr"><body>Aperçu audit</body></html>' }));
    const original = await api(page, 'shop/');
    for (const locale of ['fr', 'ar']) for (const theme of ['light', 'dark']) {
      if (!inMatrix(viewport, locale, theme)) continue;
      const label = `${viewport.name}px ${locale} ${theme}`;
      console.log(`\n=== ${label}`);
      await setLocale(locale); setTheme(theme); watch.setLabel(label);
      try {
        state.code = 'solo';
        await settingsGoto(page);
        await page.locator('[data-settings-lock]').first().waitFor({ state: 'attached' });
        await page.screenshot({ path: `results/settings-nav-${viewport.name}-${locale}-${theme}-solo.png`, fullPage: true });
        await navigation(page, locale, label, viewport.mobile);
        await boutique(page, locale, label, original);
        state.code = 'boutique';
        await widthChecks(page, locale, label, viewport.mobile);
        const nested = await nestedInteractive(page);
        report.check(nested.length === 0, `${label} : aucun élément interactif imbriqué (${nested.join(', ')})`);
        await settingsGoto(page);
        await page.screenshot({ path: `results/settings-${viewport.name}-${locale}-${theme}.png`, fullPage: true });
      } catch (error) {
        report.check(false, `${label} : interrompu — ${error.message.split('\n')[0]}`);
      } finally {
        await api(page, 'shop/', { method: 'PATCH', data: { name: original.name } });
      }
    }
    report.check(watch.problems.length === 0, `${viewport.name}px : console propre, défilement libre${watch.problems.map((p) => `\n      ${p}`).join('')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
report.finish();
