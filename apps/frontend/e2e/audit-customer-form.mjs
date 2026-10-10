/**
 * Audit du formulaire client (gabarit des pages de formulaire), création puis
 * modification, à 1440px et 360px, en clair et en sombre, en français et en arabe.
 * Les clients créés (« Audit e2e … ») sont archivés à la fin.
 */
import { BASE, VIEWPORTS, createReport, launch, openSession } from './lib/session.mjs';
import { msg } from './lib/messages.mjs';
import { nestedInteractive } from './lib/watch.mjs';

const report = createReport();
const created = [];
const nested = [];

const visibleButton = (page, name) =>
  page.getByRole('button', { name, exact: true }).filter({ visible: true });
// Nom accessible du champ (l'astérisque des champs obligatoires est aria-hidden).
const textbox = (page, name) => page.getByRole('textbox', { name, exact: true });

/** Champ obligatoire vide : erreur sous le champ, reliée par aria-describedby. */
async function checkRequiredError(page, t, label) {
  const name = textbox(page, t('customers.form.name'));
  const describedBy = (await name.getAttribute('aria-describedby')) ?? '';
  const errors = await Promise.all(describedBy.split(' ').filter(Boolean)
    .map((id) => page.locator(`[id="${id}"]`).innerText()));
  report.check(
    (await name.getAttribute('aria-invalid')) === 'true' && errors.includes(t('customers.form.name_required')),
    `${label} : « Nom » vide → erreur sous le champ (aria-invalid, aria-describedby)`,
  );
}

/** Desktop : sections à deux colonnes, aucune en accordéon. */
async function checkDesktopLayout(page, locale, label) {
  const form = page.locator('form');
  const accordions = await form.locator('details, button[aria-expanded]').count();
  const sections = form.locator('section');
  const heading = await sections.first().locator('h2').boundingBox();
  const field = await sections.first().locator('input').first().boundingBox();
  const sideBySide = locale === 'ar' ? heading.x > field.x + field.width : heading.x + heading.width < field.x;
  report.check(
    (await sections.count()) === 4 && accordions === 0 && sideBySide,
    `${label} : 4 sections, titre à côté des champs, aucun accordéon`,
  );
}

async function auditCreate(page, t, ctx) {
  const { label, viewport, locale, theme } = ctx;
  await page.goto(`${BASE}/customers/new`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
  const html = page.locator('html');
  report.check(
    (await page.locator('h1').innerText()).includes(t('customers.new.title'))
      && (await html.getAttribute('class')).split(' ').includes('dark') === (theme === 'dark')
      && (await html.getAttribute('dir')) === (locale === 'ar' ? 'rtl' : 'ltr'),
    `${label} : titre « ${t('customers.new.title')} », thème et sens de lecture`,
  );
  if (!viewport.mobile) await checkDesktopLayout(page, locale, label);
  const submit = visibleButton(page, t('customers.form.submit_create'));
  await submit.click();
  await checkRequiredError(page, t, label);
  await textbox(page, t('customers.form.name')).fill(`Audit e2e ${Date.now()}`);
  await submit.click();
  await page.waitForURL(/\/customers\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop();
  created.push(id);
  report.check(true, `${label} : « ${t('customers.form.submit_create')} » → fiche du client`);
  return id;
}

/** « Annuler » (desktop) ou le retour de l'en-tête (mobile) demande confirmation. */
async function checkLeaveGuard(page, t, ctx, customerName) {
  const { label, viewport } = ctx;
  let asked = '';
  page.once('dialog', (dialog) => { asked = dialog.message(); dialog.dismiss(); });
  const leave = viewport.mobile ? visibleButton(page, customerName) : visibleButton(page, t('ui.form.cancel'));
  await leave.click();
  await page.waitForTimeout(300);
  report.check(
    asked === t('layout.common.confirm_leave') && page.url().endsWith('/edit'),
    `${label} : ${viewport.mobile ? 'retour' : '« Annuler »'} demande confirmation, refus → reste sur le formulaire`,
  );
}

async function auditEdit(page, t, ctx, id) {
  const { label, viewport } = ctx;
  await page.goto(`${BASE}/customers/${id}/edit`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
  const customerName = await textbox(page, t('customers.form.name')).inputValue();
  const submit = visibleButton(page, t('customers.form.submit_edit'));
  const unsaved = page.getByText(t('ui.form.unsaved'), { exact: true });
  report.check(
    (await page.locator('h1').innerText()).includes(t('customers.edit.title'))
      && (await submit.isDisabled()) && !(await unsaved.isVisible()),
    `${label} : « ${t('customers.edit.title')} », bouton désactivé tant que rien n'a changé`,
  );
  await textbox(page, t('customers.form.city')).fill('Rabat');
  report.check(
    (await submit.isEnabled()) && (viewport.mobile || (await unsaved.isVisible())),
    `${label} : modification → ${viewport.mobile ? 'bouton actif' : '« Modifications non enregistrées »'}`,
  );
  await checkLeaveGuard(page, t, ctx, customerName);
  await submit.click();
  await page.waitForURL(new RegExp(`/customers/${id}$`));
  const saved = await (await page.request.get(`${BASE}/api/proxy/customers/${id}/`)).json();
  report.check(saved.city === 'Rabat', `${label} : « ${t('customers.form.submit_edit')} » → fiche du client, ville enregistrée`);
}

const browser = await launch();
for (const viewport of VIEWPORTS) {
  const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
  for (const locale of ['fr', 'ar']) {
    for (const theme of ['light', 'dark']) {
      const label = `${viewport.name}px ${locale} ${theme === 'dark' ? 'sombre' : 'clair'}`;
      console.log(`\n=== ${label}`);
      await setLocale(locale);
      setTheme(theme);
      watch.setLabel(label);
      const before = watch.problems.length;
      const t = (key) => msg(locale, key);
      const run = { label, viewport, locale, theme };
      const id = await auditCreate(page, t, run);
      await auditEdit(page, t, run, id);
      const problems = [...watch.problems.slice(before), ...nested.splice(0).map((n) => `imbriqué : ${n}`)];
      report.check(problems.length === 0, `${label} : console propre, aucun élément imbriqué${problems.map((p) => `\n      ${p}`).join('')}`);
    }
  }
  for (const id of created.splice(0)) await page.request.delete(`${BASE}/api/proxy/customers/${id}/`);
  await ctx.close();
}
await browser.close();
report.finish();
