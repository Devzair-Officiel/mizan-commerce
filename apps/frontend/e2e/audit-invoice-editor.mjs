/** Éditeur de facture libre : création, enregistrement automatique, reprise, vérification avant émission, suppression. */
import { mkdir } from 'node:fs/promises';
import { BASE, INVOICE_EDITOR_EMAIL, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { allResults, api } from './lib/products.mjs';
import { nestedInteractive } from './lib/watch.mjs';

const report = createReport();
const browser = await launch();
const text = (locale, key, values) => values ? fmt(locale, `invoices.${key}`, values) : msg(locale, `invoices.${key}`);
const visible = locator => locator.filter({ visible: true });
const FREE_LINE = { description: 'Retouche sur mesure', details: 'Reprise des épaules\nEssayage inclus', unit: 'heure', quantity: '1.5', unit_price_ht: '40.00' };
let marc;

/** Brouillons de démo (seed) : un complet pour Marc Dupuis, un vide. */
async function setup(page) {
  [marc] = (await api(page, 'customers/?search=Marc%20Dupuis')).results;
  const drafts = (await allResults(page, 'invoices/')).filter(i => i.status === 'draft');
  report.check(drafts.length === 2 && drafts.some(d => d.customer === marc.id && d.lines.length === 2) && drafts.some(d => !d.customer && !d.lines.length),
    'seed : un brouillon complet et un brouillon vide');
}

async function goto(page, path) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
}

/** Dernière saisie enregistrée : l'état « enregistré à … » remplace « enregistrement… » dans l'en-tête. */
async function saved(page, locale) {
  const auto = page.viewportSize().width >= 1024 ? 'yes' : 'no';
  const [prefix] = text(locale, 'editor.save_status', { value: 'saved', time: '§', auto }).split('§');
  await page.waitForFunction(p => document.body.innerText.includes(p), prefix.trim());
}

const editorId = page => new URL(page.url()).pathname.split('/')[2];
const issueButton = (page, locale) => visible(page.getByRole('button', { name: text(locale, 'editor.summary.issue'), exact: true }));
const checkSheet = (page, locale) => page.getByRole('dialog').filter({ hasText: text(locale, 'editor.check.title') });

async function chooseNewCustomer(page, locale, label, name) {
  await page.getByRole('button', { name: text(locale, 'editor.customer.choose'), exact: true }).click();
  const picker = page.getByRole('dialog').filter({ hasText: msg(locale, 'orders.customerPicker.sheet_title') });
  await picker.getByRole('searchbox').fill(name);
  await picker.getByRole('button', { name: fmt(locale, 'orders.customerPicker.create_named', { name }), exact: true }).click();
  const sheet = page.getByRole('dialog').filter({ hasText: text(locale, 'editor.customer.sheet_title') });
  report.check(await sheet.getByLabel(msg(locale, 'customers.form.name'), { exact: true }).inputValue() === name, `${label} : nouveau client prérempli avec la recherche`);
  await sheet.getByRole('radio', { name: fmt(locale, 'customers.form.customer_type_option', { value: 'business' }) }).locator('xpath=..').click();
  await sheet.getByLabel(text(locale, 'editor.customer.siren'), { exact: true }).fill('123 456 789');
  await sheet.getByRole('button', { name: text(locale, 'editor.customer.create'), exact: true }).click();
  await sheet.waitFor({ state: 'detached' });
}

/** Nouvelle facture : client créé depuis la feuille, ligne reprise du catalogue, unité, quantité ; enregistrée seule. */
async function checkCreate(page, locale, label) {
  await goto(page, '/invoices');
  await visible(page.getByRole('link', { name: text(locale, 'list.create'), exact: true })).click();
  await page.waitForURL(url => url.pathname === '/invoices/new');
  await page.waitForLoadState('networkidle');
  const name = `Atelier ${label}`;
  await chooseNewCustomer(page, locale, label, name);
  const card = page.locator('#invoice-customer');
  await card.getByText(name, { exact: true }).waitFor();
  report.check((await card.innerText()).includes(name) && (await card.innerText()).includes(text(locale, 'editor.customer.type', { value: 'business' })),
    `${label} : client professionnel créé et choisi`);
  await page.getByRole('combobox', { name: text(locale, 'editor.line.description'), exact: true }).fill('Retouche o');
  const suggestion = page.getByRole('listbox', { name: text(locale, 'editor.line.suggestions') }).getByRole('option').first();
  report.check((await suggestion.innerText()).includes('Retouche ourlet'), `${label} : suggestion du catalogue en premier`);
  await suggestion.click();
  const hour = text(locale, 'editor.unit.preset', { value: 'hour' });
  await page.locator('button[aria-haspopup="dialog"]').filter({ hasText: text(locale, 'editor.line.unit') }).click();
  const unitSheet = page.getByRole('dialog').filter({ hasText: text(locale, 'editor.unit.title') });
  await unitSheet.getByRole('button', { name: hour, exact: true }).click();
  await unitSheet.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: text(locale, 'editor.line.increase'), exact: true }).click();
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}\/edit$/);
  await saved(page, locale);
  const draft = await api(page, `invoices/${editorId(page)}/`);
  const [line] = draft.lines;
  report.check(draft.status === 'draft' && draft.lines.length === 1 && line.description === 'Retouche ourlet' && line.unit === hour
    && Number(line.quantity) === 2 && line.unit_price_ht === '12.00', `${label} : brouillon créé au premier enregistrement, URL de son éditeur`);
  const desktop = page.viewportSize().width >= 1024;
  const summary = page.getByText(text(locale, 'editor.summary.estimate'), { exact: true });
  const bar = page.locator('.fixed').filter({ hasText: text(locale, 'editor.summary.total') });
  report.check(await summary.isVisible() === desktop && await bar.isVisible() === !desktop,
    `${label} : ${desktop ? 'récapitulatif latéral' : 'barre flottante Total TTC + Émettre'}`);
  report.check(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), `${label} : aucune largeur débordante`);
  report.check((await nestedInteractive(page)).length === 0, `${label} : aucun élément interactif imbriqué`);
  await page.screenshot({ path: `results/invoice-editor-${label.replaceAll(' ', '-')}.png`, fullPage: true });
  return draft;
}

/** Recommandations seules : « Émettre quand même » ; la facture émise garde le SIREN et la nature de l'opération. */
async function checkIssue(page, locale, label, draft) {
  const { issues } = await api(page, `invoices/${draft.id}/compliance/`);
  await issueButton(page, locale).click();
  const sheet = checkSheet(page, locale);
  await sheet.waitFor();
  const content = await sheet.innerText();
  report.check(issues.length > 0 && issues.every(i => i.level === 'recommended' && content.includes(text(locale, 'editor.check.issue_title', { code: i.code })))
    && !issues.some(i => i.code === 'customer_siren'), `${label} : vérification, recommandations seules, SIREN du client renseigné`);
  await sheet.getByRole('button', { name: text(locale, 'editor.check.issue_anyway'), exact: true }).click();
  await page.waitForURL(url => url.pathname === `/invoices/${draft.id}`);
  const issued = await api(page, `invoices/${draft.id}/`);
  report.check(issued.status === 'issued' && !!issued.number && issued.buyer_siren === '123456789'
    && issued.presentation.operation_category === issued.operation_category, `${label} : facture émise, numéro, SIREN et nature figés`);
}

/** Brouillon repris depuis sa page : saisie retrouvée, modification enregistrée seule. */
async function checkResume(page, locale, label) {
  const draft = await api(page, 'invoices/drafts/', { method: 'POST', data: { customer: marc.id, payment_terms_days: 30, lines: [FREE_LINE] } });
  await goto(page, `/invoices/${draft.id}`);
  await page.getByRole('link', { name: text(locale, 'detail.resume_draft'), exact: true }).click();
  await page.waitForURL(url => url.pathname === `/invoices/${draft.id}/edit`);
  await page.waitForLoadState('networkidle');
  const details = page.getByLabel(text(locale, 'editor.line.details'), { exact: true });
  await page.locator('#invoice-customer').getByText('Marc Dupuis', { exact: true }).waitFor();
  report.check(await page.getByRole('combobox', { name: text(locale, 'editor.line.description'), exact: true }).inputValue() === FREE_LINE.description
    && await details.inputValue() === FREE_LINE.details,
  `${label} : brouillon repris, client, désignation et détails sur deux lignes`);
  await page.getByLabel(text(locale, 'editor.line.unit_price'), { exact: true }).fill('45');
  await saved(page, locale);
  const after = await api(page, `invoices/${draft.id}/`);
  report.check(after.lines[0].unit_price_ht === '45.00' && after.updated_at !== draft.updated_at, `${label} : modification enregistrée automatiquement`);
}

/** Brouillon vide : points bloquants (aucun « Émettre »), puis suppression confirmée. */
async function checkBlockingAndDelete(page, locale, label) {
  const empty = await api(page, 'invoices/drafts/', { method: 'POST', data: {} });
  await goto(page, `/invoices/${empty.id}/edit`);
  await issueButton(page, locale).click();
  const sheet = checkSheet(page, locale);
  await sheet.waitFor();
  const content = await sheet.innerText();
  report.check(['no_lines', 'no_customer'].every(code => content.includes(text(locale, 'editor.check.issue_title', { code })))
    && await sheet.getByRole('button', { name: text(locale, 'editor.check.issue_anyway'), exact: true }).count() === 0
    && await sheet.getByRole('button', { name: text(locale, 'editor.check.issue'), exact: true }).count() === 0,
  `${label} : points bloquants, émission impossible`);
  await page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  const mobile = page.viewportSize().width < 1024;
  await visible(page.getByRole('button', { name: msg(locale, 'ui.detail.more_actions'), exact: true })).click();
  await page.getByRole(mobile ? 'button' : 'menuitem', { name: text(locale, 'editor.delete'), exact: true }).click();
  const confirm = page.getByRole('dialog').filter({ hasText: text(locale, 'editor.delete_title') });
  await confirm.getByRole('button', { name: text(locale, 'editor.delete'), exact: true }).click();
  await page.waitForURL(url => url.pathname === '/invoices');
  const res = await page.request.get(`${BASE}/api/proxy/invoices/${empty.id}/`);
  report.check(res.status() === 404, `${label} : brouillon supprimé après confirmation`);
}

try {
  await mkdir('results', { recursive: true });
  for (const viewport of VIEWPORTS) {
    const { page, ctx, watch, setLocale, setTheme } = await openSession(browser, viewport, { email: INVOICE_EDITOR_EMAIL });
    try {
      if (!marc) await setup(page);
      for (const locale of ['fr', 'ar']) for (const theme of ['light', 'dark']) {
        if (!inMatrix(viewport, locale, theme)) continue;
        const label = `${viewport.name} ${locale} ${theme}`;
        watch.setLabel(label);
        await setLocale(locale); setTheme(theme);
        const draft = await checkCreate(page, locale, label);
        await checkIssue(page, locale, label, draft);
        await checkResume(page, locale, label);
        await checkBlockingAndDelete(page, locale, label);
      }
    } finally {
      report.check(watch.problems.length === 0, `${viewport.name} : console propre${watch.problems.map(p => `\n      ${p}`).join('')}`);
      await ctx.close();
    }
  }
} finally { await browser.close(); }
report.finish();
