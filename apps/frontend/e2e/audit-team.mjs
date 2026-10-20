/** Lot 7c-2 : tableau desktop, cartes mobile, accès résumés et limite lue depuis les API. */
import { VIEWPORTS, inMatrix, createReport, launch, openSession } from './lib/session.mjs';
import { msg, fmt } from './lib/messages.mjs';
import { api } from './lib/products.mjs';
import { animationsDone } from './lib/wait.mjs';
import { nestedInteractive } from './lib/watch.mjs';
import { settingsPlan, settingsGoto, settingsOverflow } from './lib/settings.mjs';

const report = createReport();
const browser = await launch();
const visibleRows = (page, mobile) => page.locator(mobile ? '[data-member-card]' : '[data-member-row]');

async function membersFixture(page, me) {
  const members = await api(page, 'shop/members/');
  const owner = members.results.find((m) => m.role === 'owner');
  const staff = members.results.find((m) => m.role === 'staff');
  return [owner ?? { id: 'owner', user: me.id, role: 'owner', user_full_name: me.full_name, user_email: me.email, permissions: [], user_phone: '' },
    { id: 'audit-admin', user: 'audit-admin', role: 'admin', user_full_name: 'Audit Responsable', user_email: 'responsable@example.com', user_phone: '', permissions: [] },
    { ...staff, id: staff?.id ?? 'audit-staff', user: staff?.user ?? 'audit-staff', role: 'staff', user_full_name: 'Audit Accès', user_email: 'acces-avec-adresse-longue@example.com', user_phone: '', permissions: ['orders', 'customers', 'stock', 'invoices', 'reminders'] }];
}

try {
  for (const viewport of VIEWPORTS) {
    const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
    const me = await api(page, 'auth/me/');
    const plans = await api(page, 'subscriptions/plans/');
    const limit = plans.find((p) => p.code === 'boutique').max_members;
    if (typeof limit !== 'number' || limit < 2) throw new Error('Le catalogue Boutique doit avoir un plafond de membres fini.');
    const fixtures = await membersFixture(page, me);
    const state = { code: 'boutique', count: limit - 1, limit, empty: false };
    await settingsPlan(ctx, state);
    await ctx.route(/\/api\/proxy\/shop\/members\/?(\?.*)?$/, (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill({ json: { count: state.empty ? 0 : fixtures.length, next: null, previous: null, results: state.empty ? [] : fixtures } });
    });
    for (const locale of ['fr', 'ar']) for (const theme of ['light', 'dark']) {
      if (!inMatrix(viewport, locale, theme)) continue;
      const label = `${viewport.name}px ${locale} ${theme}`;
      console.log(`\n=== ${label}`);
      await setLocale(locale); setTheme(theme); watch.setLabel(label);
      const t = (key) => msg(locale, `team.${key}`);
      try {
        state.count = limit - 1; state.empty = false;
        await settingsGoto(page, '/settings/team');
        const table = page.locator('[data-member-table]');
        const cards = page.locator('[data-member-cards]');
        report.check(viewport.mobile ? !await table.isVisible() && await cards.isVisible() : await table.isVisible() && !await cards.isVisible(),
          `${label} : ${viewport.mobile ? 'cartes mobile' : 'tableau desktop avec en-têtes de colonnes'}`);
        const header = page.locator('[data-team-header]');
        report.check(await header.locator('[data-member-usage]').textContent() === fmt(locale, 'settings.usage.members', { count: limit - 1, limit })
          && await header.getByRole('progressbar').getAttribute('aria-valuenow') === String(limit - 1)
          && await header.getByRole('progressbar').getAttribute('aria-valuemax') === String(limit), `${label} : pastille et barre, usage de /current/ et plafond de /plans/`);
        report.check(await page.locator('[data-member-places]').textContent() === fmt(locale, 'team.available_places', { count: 1 }), `${label} : une place disponible annoncée`);
        const rows = visibleRows(page, viewport.mobile);
        const owner = rows.filter({ hasText: fixtures[0].user_email });
        report.check(await owner.getByRole('button').count() === 0, `${label} : propriétaire sans actions`);
        const staff = rows.filter({ hasText: fixtures[2].user_email });
        const text = await staff.textContent();
        report.check(text.includes(fmt(locale, 'team.modules_count', { count: 5 })) && text.includes(t('modules.orders'))
          && text.includes(t('modules.customers')) && text.includes(t('modules.stock')) && text.includes('+2'), `${label} : 5 modules, 3 noms et +2`);
        const buttons = await staff.getByRole('button').all();
        report.check(buttons.length === 2 && (await Promise.all(buttons.map(async (b) => {
          const box = await b.boundingBox(); return box.width >= 44 && box.height >= 44;
        }))).every(Boolean), `${label} : Modifier et Retirer, zones de 44 px minimum`);
        const add = header.getByRole('button', { name: t('add_member'), exact: true });
        const [headBox, addBox] = [await header.boundingBox(), await add.boundingBox()];
        report.check(addBox.y < headBox.y + 65, `${label} : Ajouter en haut de la carte Membres`);
        await add.click();
        let sheet = page.getByRole('dialog', { name: t('form.create_title'), exact: true });
        await sheet.waitFor(); await animationsDone(sheet);
        report.check(await sheet.locator('#member-email').isVisible(), `${label} : le formulaire d'ajout existant s'ouvre`);
        await sheet.getByRole('button', { name: t('form.cancel'), exact: true }).click();
        await sheet.waitFor({ state: 'hidden' });
        await staff.getByRole('button', { name: new RegExp(`^${t('actions.edit')}`) }).click();
        sheet = page.getByRole('dialog', { name: fmt(locale, 'team.form.edit_for', { name: fixtures[2].user_full_name }), exact: true });
        await sheet.waitFor(); await animationsDone(sheet);
        report.check(await sheet.getByRole('button', { name: t('role.staff'), exact: true }).getAttribute('aria-pressed') === 'true', `${label} : le formulaire de modification conserve le rôle`);
        await sheet.getByRole('button', { name: t('form.cancel'), exact: true }).click();
        await sheet.waitFor({ state: 'hidden' });
        await staff.getByRole('button', { name: new RegExp(`^${t('actions.delete')}`) }).click();
        sheet = page.getByRole('dialog', { name: t('actions.confirm_delete_title'), exact: true });
        await sheet.waitFor(); await animationsDone(sheet);
        report.check((await sheet.textContent()).includes(fixtures[2].user_full_name), `${label} : confirmation de retrait existante`);
        await sheet.getByRole('button', { name: t('actions.cancel'), exact: true }).click();
        await sheet.waitFor({ state: 'hidden' });
        await page.screenshot({ path: `results/team-${viewport.name}-${locale}-${theme}.png`, fullPage: true });
        state.count = limit;
        await settingsGoto(page, '/settings/team');
        report.check(await page.locator('[data-member-places]').count() === 0, `${label} : plus de ligne de place disponible à la limite`);
        await header.getByRole('button', { name: t('add_member'), exact: true }).click();
        sheet = page.getByRole('dialog', { name: msg(locale, 'settings.usage.limit_title'), exact: true });
        await sheet.waitFor();
        report.check(await sheet.getByRole('link', { name: msg(locale, 'settings.upgrade.cta'), exact: true }).getAttribute('href') === '/settings/subscription',
          `${label} : à la limite, Ajouter ouvre UpgradeSheet`);
        await page.keyboard.press('Escape');
        await sheet.waitFor({ state: 'hidden' });
        state.empty = true; state.count = 0;
        await settingsGoto(page, '/settings/team');
        report.check(await page.getByRole('heading', { name: t('empty_title'), exact: true }).isVisible(), `${label} : état vide illustré`);
        const overflow = await settingsOverflow(page);
        report.check(!overflow.document && overflow.elements.length === 0, `${label} : aucun débordement${overflow.elements.map((e) => `\n      ${e}`).join('')}`);
        report.check((await nestedInteractive(page)).length === 0, `${label} : aucun élément interactif imbriqué`);
      } catch (error) {
        report.check(false, `${label} : interrompu — ${error.message.split('\n')[0]}`);
      }
    }
    report.check(watch.problems.length === 0, `${viewport.name}px : console propre, défilement libre${watch.problems.map((p) => `\n      ${p}`).join('')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
report.finish();
