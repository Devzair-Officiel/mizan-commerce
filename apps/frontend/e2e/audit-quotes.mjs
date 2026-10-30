/** Devis (6b) : liste, création dans l'éditeur partagé, validité, enregistrement automatique, envoi avec la vérification, apparition « Envoyé ». */
import { mkdir } from 'node:fs/promises';
import { BASE, QUOTES_EMAIL, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { api } from './lib/products.mjs';
import { nestedInteractive } from './lib/watch.mjs';

const report = createReport();
const browser = await launch();
/** Messages de l'éditeur partagé, branche devis des `{doc, select, …}`. */
const editor = (locale, key, values) => fmt(locale, `invoices.editor.${key}`, { doc: 'quote', ...values });
const visible = locator => locator.filter({ visible: true });
/** Codes de la vérification d'un devis (`apps/quotes/compliance.py`). */
const QUOTE_CODES = ['no_lines', 'zero_total', 'no_customer', 'seller_name', 'seller_address', 'seller_identifier', 'vat_number', 'zero_tax_rate', 'payment_methods'];

/** Chaque code a son titre dans la feuille (pas le « Point à vérifier » générique), en fr, en et ar. */
function checkCodesTranslated() {
  const missing = ['fr', 'en', 'ar'].flatMap(locale => {
    const fallback = editor(locale, 'check.issue_title', { code: '?' });
    return QUOTE_CODES.filter(code => editor(locale, 'check.issue_title', { code }) === fallback).map(code => `${locale} ${code}`);
  });
  report.check(missing.length === 0, `codes de conformité du devis traduits (fr, en, ar)${missing.map(m => `\n      ${m}`).join('')}`);
}

async function goto(page, path) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
}

async function saved(page, locale) {
  const auto = page.viewportSize().width >= 1024 ? 'yes' : 'no';
  const [prefix] = editor(locale, 'save_status', { value: 'saved', time: '§', auto }).split('§');
  await page.waitForFunction(p => document.body.innerText.includes(p), prefix.trim());
}

/** « Devis » depuis l'en-tête des factures ; liste vide la première fois (boutique d'audit remise à zéro). */
async function checkList(page, locale, label) {
  const { count } = await api(page, 'quotes/');
  await goto(page, '/invoices');
  await page.getByRole('link', { name: msg(locale, 'invoices.list.quotes_link'), exact: true }).click();
  await page.waitForURL(url => url.pathname === '/quotes');
  await page.waitForLoadState('networkidle');
  const shown = locator => locator.waitFor({ timeout: 5000 }).then(() => true, () => false);
  if (count === 0) report.check(await shown(page.getByText(msg(locale, 'quotes.empty_title'), { exact: true })), `${label} : liste vide, état vide canonique`);
  report.check(await shown(page.getByText(fmt(locale, 'quotes.count', { count }), { exact: true })), `${label} : en-tête « ${fmt(locale, 'quotes.count', { count })} »`);
  return count;
}

async function chooseNewCustomer(page, locale, name) {
  await page.getByRole('button', { name: editor(locale, 'customer.choose'), exact: true }).click();
  const picker = page.getByRole('dialog').filter({ hasText: msg(locale, 'orders.customerPicker.sheet_title') });
  await picker.getByRole('searchbox').fill(name);
  await picker.getByRole('button', { name: fmt(locale, 'orders.customerPicker.create_named', { name }), exact: true }).click();
  const sheet = page.getByRole('dialog').filter({ hasText: editor(locale, 'customer.sheet_title') });
  await sheet.getByRole('button', { name: editor(locale, 'customer.create'), exact: true }).click();
  await sheet.waitFor({ state: 'detached' });
  await page.locator('#invoice-customer').getByText(name, { exact: true }).waitFor();
}

/** Nouveau devis : client, ligne libre, validité 45 jours ; brouillon créé et enregistré seul. */
async function checkCreate(page, locale, label) {
  await visible(page.getByRole('link', { name: msg(locale, 'quotes.create'), exact: true })).click();
  await page.waitForURL(url => url.pathname === '/quotes/new');
  await page.waitForLoadState('networkidle');
  report.check(await page.getByRole('heading', { name: editor(locale, 'title'), exact: true }).isVisible(), `${label} : titre « ${editor(locale, 'title')} »`);
  await chooseNewCustomer(page, locale, `Client devis ${label}`);
  const description = page.getByRole('combobox', { name: editor(locale, 'line.description'), exact: true });
  await description.fill('Pose de parquet');
  await description.press('Escape');
  await page.getByLabel(editor(locale, 'line.unit_price'), { exact: true }).fill('250');
  const extras = page.locator('#invoice-extras');
  // Bouton de repli (mobile seulement) : le titre de la section, pas le menu « Nature de l'opération ».
  const toggle = extras.locator('h2 button[aria-expanded="false"]');
  if (await toggle.isVisible()) {
    report.check((await toggle.innerText()).includes(fmt(locale, 'invoices.editor.extras.summary', { doc: 'quote', hasDiscount: 'no', validity: 30, terms: 'days', days: 30 }).split(' · ')[1]),
      `${label} : résumé replié, validité de 30 jours par défaut`);
    await toggle.click();
  }
  const validity = page.getByLabel(editor(locale, 'extras.validity'), { exact: true });
  report.check(await validity.inputValue() === '30', `${label} : validité de 30 jours par défaut`);
  await validity.fill('0');
  await page.getByRole('alert').filter({ hasText: editor(locale, 'validity_invalid') }).waitFor();
  await validity.fill('45');
  await page.waitForURL(/\/quotes\/[0-9a-f-]{36}\/edit$/);
  await saved(page, locale);
  const id = new URL(page.url()).pathname.split('/')[2];
  const draft = await api(page, `quotes/${id}/`);
  report.check(draft.status === 'draft' && draft.validity_days === 45 && draft.lines.length === 1 && draft.lines[0].unit_price_ht === '250.00',
    `${label} : brouillon de devis enregistré automatiquement (validité 45 jours, URL de son éditeur)`);
  report.check(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), `${label} : aucune largeur débordante`);
  report.check((await nestedInteractive(page)).length === 0, `${label} : aucun élément interactif imbriqué`);
  await page.screenshot({ path: `results/quotes-editor-${label.replaceAll(' ', '-')}.png`, fullPage: true });
  return draft;
}

/** « Envoyer le devis » : feuille de vérification, envoi, retour sur la liste où le devis est « Envoyé » avec son numéro. */
async function checkSend(page, locale, label, draft, before) {
  const { issues } = await api(page, `quotes/${draft.id}/compliance/`);
  await visible(page.getByRole('button', { name: editor(locale, 'summary.issue'), exact: true })).click();
  const sheet = page.getByRole('dialog').filter({ hasText: editor(locale, 'check.title') });
  await sheet.waitFor();
  const content = await sheet.innerText();
  report.check(issues.every(i => i.level === 'recommended' && content.includes(editor(locale, 'check.issue_title', { code: i.code }))),
    `${label} : vérification avant envoi, recommandations seules et nommées`);
  const anyway = sheet.getByRole('button', { name: editor(locale, 'check.issue_anyway'), exact: true });
  await (issues.length ? anyway : sheet.getByRole('button', { name: editor(locale, 'check.issue'), exact: true })).click();
  await page.waitForURL(url => url.pathname === '/quotes');
  const sent = await api(page, `quotes/${draft.id}/`);
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: editor(locale, 'issued', { number: sent.number }) });
  await toast.waitFor();
  report.check(sent.status === 'sent' && /^devis-\d{6}-\d{4}$/.test(sent.number) && !!sent.valid_until,
    `${label} : devis envoyé, numéro ${sent.number}, confirmation affichée`);
  await page.waitForLoadState('networkidle');
  // Desktop : ligne du tableau (le lien n'entoure que le numéro) ; mobile : la ligne est le lien.
  const row = visible(page.locator(page.viewportSize().width >= 1024 ? 'tr' : 'a').filter({ hasText: sent.number }));
  report.check(await row.count() === 1 && (await row.innerText()).includes(fmt(locale, 'quotes.status', { value: 'sent' }))
    && await page.getByText(fmt(locale, 'quotes.count', { count: before + 1 }), { exact: true }).isVisible(),
  `${label} : le devis apparaît « ${fmt(locale, 'quotes.status', { value: 'sent' })} » dans la liste`);
  await page.screenshot({ path: `results/quotes-list-${label.replaceAll(' ', '-')}.png`, fullPage: true });
  return { row, sent };
}

/** Provisoire (6b) : un devis envoyé ouvre une page qui propose son PDF dans un nouvel onglet. */
async function checkPdfPage(page, locale, label, { row, sent }) {
  await row.click();
  await page.waitForURL(url => url.pathname === `/quotes/${sent.id}`);
  const link = page.getByRole('link', { name: msg(locale, 'quotes.open_pdf'), exact: true });
  await link.waitFor();
  const pdf = await page.request.get(new URL(await link.getAttribute('href'), BASE).href);
  report.check(await link.getAttribute('target') === '_blank' && pdf.ok() && pdf.headers()['content-type'] === 'application/pdf',
    `${label} : devis envoyé, PDF proposé dans un nouvel onglet`);
}

try {
  await mkdir('results', { recursive: true });
  checkCodesTranslated();
  for (const viewport of VIEWPORTS) {
    const { page, ctx, watch, setLocale, setTheme } = await openSession(browser, viewport, { email: QUOTES_EMAIL });
    try {
      for (const locale of ['fr', 'ar']) for (const theme of ['light', 'dark']) {
        if (!inMatrix(viewport, locale, theme)) continue;
        const label = `${viewport.name} ${locale} ${theme}`;
        watch.setLabel(label);
        await setLocale(locale); setTheme(theme);
        const before = await checkList(page, locale, label);
        const draft = await checkCreate(page, locale, label);
        await checkPdfPage(page, locale, label, await checkSend(page, locale, label, draft, before));
      }
    } finally {
      report.check(watch.problems.length === 0, `${viewport.name} : console propre${watch.problems.map(p => `\n      ${p}`).join('')}`);
      await ctx.close();
    }
  }
} finally { await browser.close(); }
report.finish();
