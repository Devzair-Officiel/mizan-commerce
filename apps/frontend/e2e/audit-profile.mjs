/** Lot 7c-3 : profil en cartes, validation et actions existantes, fr clair 1440 / ar sombre 360. */
import { BASE, VIEWPORTS, inMatrix, createReport, launch, openSession } from './lib/session.mjs';
import { msg } from './lib/messages.mjs';
import { api } from './lib/products.mjs';
import { nestedInteractive } from './lib/watch.mjs';

const report = createReport();
const browser = await launch();
async function goto(page, path = '/profile') {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
}

try {
  for (const viewport of VIEWPORTS) {
    const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
    const original = await api(page, 'auth/me/');
    const state = { theme: 'light', verified: false, passwordError: true, passwordRequests: 0, resendRequests: 0 };
    await ctx.route(/\/api\/proxy\/auth\/me\/?(\?.*)?$/, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      try {
        const response = await route.fetch();
        const me = await response.json();
        await route.fulfill({ response, json: { ...me, theme_mode: state.theme, email_verified_at: state.verified ? '2026-01-01T00:00:00Z' : null } });
      } catch { /* Contexte fermé pendant une requête. */ }
    });
    await ctx.route(/\/api\/proxy\/auth\/verify-email\/resend\/?$/, (route) => {
      state.resendRequests++;
      return route.fulfill({ json: { detail: 'Audit', already_verified: false } });
    });
    const serverError = 'Audit: current password rejected';
    await ctx.route(/\/api\/proxy\/auth\/change-password\/?$/, (route) => {
      state.passwordRequests++;
      return route.fulfill({ status: state.passwordError ? 400 : 200,
        json: state.passwordError ? { old_password: serverError } : { detail: 'Audit' } });
    });
    try {
      for (const locale of ['fr', 'ar']) for (const theme of ['light', 'dark']) {
        if (!inMatrix(viewport, locale, theme)) continue;
        const label = `${viewport.name}px ${locale} ${theme}`;
        const t = (key) => msg(locale, `profile.${key}`);
        console.log(`\n=== ${label}`);
        await setLocale(locale); setTheme(theme); state.theme = theme; state.verified = false;
        watch.setLabel(label);
        await goto(page);
        const header = page.locator('[data-profile-header]');
        report.check((await header.textContent()).includes(original.full_name) && (await header.textContent()).includes(original.email)
          && (await header.textContent()).includes(msg(locale, `team.role.${original.membership.role}`))
          && (await header.textContent()).includes(original.membership.shop_name), `${label} : initiales, nom, rôle, boutique et email du compte`);
        const group = page.locator('[data-profile-cards]');
        const boxes = await group.evaluate((el) => [...el.children].map((card) => card.getBoundingClientRect().toJSON()));
        const width = (await page.locator('[data-profile-page]').boundingBox()).width;
        report.check(width <= 881 && boxes.length === 2 && (viewport.mobile ? boxes[1].y > boxes[0].y + boxes[0].height : Math.abs(boxes[0].y - boxes[1].y) < 1),
          `${label} : largeur ~880 px maximum (${width.toFixed(2)}), deux cartes ${viewport.mobile ? 'empilées' : 'côte à côte'} (${boxes.map((b) => `${b.x.toFixed(2)},${b.y.toFixed(2)}`).join(' ; ')})`);
        const inputs = page.locator('[data-profile-form]');
        report.check(await inputs.locator('#email').isDisabled() && await inputs.locator('#email').getAttribute('readonly') !== null,
          `${label} : email en lecture seule`);
        const banner = page.locator('[data-email-verification]');
        report.check((await banner.boundingBox()).y > (await header.boundingBox()).y + (await header.boundingBox()).height,
          `${label} : avertissement de vérification sous l'identité`);
        const buttons = await page.locator('[data-profile-cards] button, [data-email-verification] button').filter({ visible: true }).all();
        report.check(!viewport.mobile || (await Promise.all(buttons.map(async (b) => (await b.boundingBox()).height >= 48))).every(Boolean),
          `${label} : boutons de 48 px sur mobile`);
        await banner.getByRole('button', { name: t('email_verification.resend_link'), exact: true }).click();
        await banner.getByText(t('email_verification.sent'), { exact: true }).waitFor();
        report.check(state.resendRequests > 0, `${label} : renvoi du lien existant, état « Lien renvoyé » (envoi simulé)`);
        const save = inputs.getByRole('button', { name: t('save'), exact: true });
        report.check(await save.isDisabled(), `${label} : enregistrement désactivé sans modification`);
        await inputs.locator('#full_name').fill('');
        await save.click();
        await inputs.getByText(t('name_required'), { exact: true }).waitFor();
        report.check(await inputs.locator('#full_name').getAttribute('aria-invalid') === 'true'
          && (await api(page, 'auth/me/')).full_name === original.full_name, `${label} : validation Zod du nom, erreur reliée au champ`);
        await inputs.locator('#full_name').fill(`${original.full_name} Audit`);
        await save.click();
        await inputs.getByText(t('profile_saved'), { exact: true }).waitFor();
        await header.getByRole('heading', { name: `${original.full_name} Audit`, exact: true }).waitFor();
        report.check((await api(page, 'auth/me/')).full_name === `${original.full_name} Audit`, `${label} : informations enregistrées, en-tête actualisé`);
        await api(page, 'auth/me/', { method: 'PATCH', data: { full_name: original.full_name, phone: original.phone } });
        await goto(page);
        const passwords = page.locator('[data-password-form]');
        const change = passwords.getByRole('button', { name: t('change_password'), exact: true });
        await passwords.locator('#old_password').fill('audit-current-password');
        await passwords.locator('#new_password').fill('audit-new-password');
        await passwords.locator('#confirm').fill('different-password');
        const before = state.passwordRequests;
        await change.click();
        await passwords.getByText(t('password_mismatch'), { exact: true }).waitFor();
        report.check(state.passwordRequests === before, `${label} : confirmations différentes refusées par Zod sans appel API`);
        await passwords.getByRole('button', { name: t('show_password'), exact: true }).first().click();
        report.check(await passwords.locator('#old_password').getAttribute('type') === 'text', `${label} : PasswordField affiche le mot de passe`);
        await passwords.getByRole('button', { name: t('hide_password'), exact: true }).click();
        await passwords.locator('#confirm').fill('audit-new-password');
        state.passwordError = true;
        await change.click();
        await passwords.getByText(serverError, { exact: true }).waitFor();
        report.check(await passwords.locator('#old_password').getAttribute('aria-invalid') === 'true', `${label} : erreur serveur conservée sous le mot de passe actuel`);
        state.passwordError = false;
        await change.click();
        await passwords.getByText(t('password_saved'), { exact: true }).waitFor();
        report.check(await passwords.locator('#old_password').inputValue() === '' && await passwords.locator('#new_password').inputValue() === ''
          && await passwords.locator('#confirm').inputValue() === '', `${label} : succès et remise à zéro existants (mot de passe simulé)`);
        await goto(page);
        report.check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} : aucun débordement horizontal`);
        report.check((await nestedInteractive(page)).length === 0, `${label} : aucun élément interactif imbriqué`);
        await page.screenshot({ path: `results/profile-${viewport.name}-${locale}-${theme}.png`, fullPage: true });
        state.verified = true;
        await goto(page);
        report.check(await page.locator('[data-email-verification]').count() === 0, `${label} : avertissement absent pour un compte vérifié`);
        await goto(page, '/settings');
        report.check(await page.locator('[data-settings-nav] a[href="/profile"]').count() === 0, `${label} : Mon profil reste hors de la sous-navigation`);
      }
    } finally {
      await api(page, 'auth/me/', { method: 'PATCH', data: { full_name: original.full_name, phone: original.phone } });
      // Le seul 400 attendu est la réponse de mot de passe simulée, explicitement vérifiée ci-dessus.
      const issues = watch.problems.filter((p) => !(p.includes('Failed to load resource: the server responded with a status of 400') && p.includes('/api/proxy/auth/change-password')));
      report.check(issues.length === 0, `${viewport.name}px : console propre, défilement libre${issues.map((p) => `\n      ${p}`).join('')}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
report.finish();
