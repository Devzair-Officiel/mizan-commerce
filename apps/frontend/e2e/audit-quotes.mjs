/**
 * Devis : liste (vide, chargement, erreur), création dans l'éditeur partagé, validité, enregistrement
 * automatique, envoi avec la vérification ; détail d'un devis envoyé, PDF, accord avec un nom, conversion
 * en brouillon de facture, refus confirmé (focus par défaut sur « Garder »). Doubles clics : une requête.
 */
import { mkdir, writeFile } from 'node:fs/promises';
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
  report.check(await appears(page.getByRole('heading', { name: editor(locale, 'title'), exact: true })), `${label} : titre « ${editor(locale, 'title')} »`);
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
  // La liste peut encore montrer le brouillon le temps de son rafraîchissement : on attend le statut et le total.
  const row = visible(page.locator(page.viewportSize().width >= 1024 ? 'tr' : 'a').filter({ hasText: sent.number }));
  const status = fmt(locale, 'quotes.status', { value: 'sent' });
  const listed = await Promise.all([
    row.filter({ hasText: status }).first().waitFor({ timeout: 10000 }),
    page.getByText(fmt(locale, 'quotes.count', { count: before + 1 }), { exact: true }).first().waitFor({ timeout: 10000 }),
  ]).then(() => true, () => false);
  report.check(listed && await row.count() === 1, `${label} : le devis apparaît « ${status} » dans la liste`);
  await page.screenshot({ path: `results/quotes-list-${label.replaceAll(' ', '-')}.png`, fullPage: true });
  return { row, sent };
}

const QUOTE_LINE = { description: 'Dépose de cloison', unit: 'forfait', quantity: '1', unit_price_ht: '180.00' };
const desktop = page => page.viewportSize().width >= 1024;
const button = (page, name) => visible(page.getByRole('button', { name, exact: true }));
/** Élément attendu (attente automatique) : après une navigation côté client, `networkidle` est déjà atteint et n'attend rien. */
const appears = locator => locator.waitFor({ timeout: 10000 }).then(() => true, () => false);
/** Facture lue par son éditeur (`GET /api/proxy/invoices/<id>`). */
const isInvoiceRead = response => response.request().method() === 'GET'
  && /^\/api\/proxy\/invoices\/[0-9a-f-]{36}\/?$/.test(new URL(response.url()).pathname);
/** Réponse finale : Next.js répond d'abord 308 pour retirer la barre oblique finale de l'adresse. */
const isFinal = response => response.status() < 300 || response.status() >= 400;

/** Requêtes POST vers un chemin, comptées à partir de l'appel : un double clic n'en envoie qu'une. */
function countPosts(page, suffix) {
  let count = 0;
  const listener = request => { if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith(suffix)) count += 1; };
  page.on('request', listener);
  return () => { page.off('request', listener); return count; };
}

async function toast(page, text) {
  return page.locator('[data-sonner-toast]').filter({ hasText: text }).first().waitFor({ timeout: 5000 }).then(() => true, () => false);
}

/** PDF lu à son adresse dans la page (entrée du menu « ⋯ » ou bouton) : 200, `application/pdf`. */
async function pdfAnswers(page, link) {
  const pdf = await page.request.get(new URL(await link.getAttribute('href'), BASE).href);
  return pdf.ok() && pdf.headers()['content-type'] === 'application/pdf';
}

/** Menu « ⋯ » : menu ancré (desktop) ou feuille (mobile). */
async function openMenu(page, locale) {
  await button(page, msg(locale, 'ui.detail.more_actions')).click();
}

// `ol` : la navigation a aussi un groupe « Suivi ».
const tracking = (page, locale) => page.locator(`ol[aria-label="${msg(locale, 'quotes.tracking.title')}"]`);

/** Détail d'un devis envoyé : bandeau (jours restants du serveur), suivi en attente, PDF du menu. */
async function checkDetail(page, locale, label, { row, sent }) {
  await row.click();
  await page.waitForURL(url => url.pathname === `/quotes/${sent.id}`);
  const region = page.getByRole('region', { name: msg(locale, 'quotes.detail.banner'), exact: true });
  await region.waitFor();
  const banner = await region.innerText();
  const parts = fmt(locale, 'quotes.detail.validity', { status: 'sent', days: sent.days_remaining, date: '§' }).split('§');
  report.check(sent.days_remaining === 45 && parts.every(p => banner.includes(p.trim())) && banner.includes(sent.buyer_name),
    `${label} : bandeau, client et « ${parts.join('…').trim()} » (${sent.days_remaining} jours, calculés par le serveur)`);
  const steps = await tracking(page, locale).innerText();
  const current = tracking(page, locale).locator('[aria-current="step"]');
  report.check(['created', 'sent', 'waiting'].every(key => steps.includes(fmt(locale, 'quotes.tracking.step', { key })))
    && (await current.innerText()).includes(fmt(locale, 'quotes.tracking.step', { key: 'waiting' })), `${label} : suivi, devis en attente de réponse`);
  await openMenu(page, locale);
  const link = visible(page.locator('a').filter({ hasText: msg(locale, 'quotes.actions.pdf') }));
  await link.waitFor();
  report.check(await pdfAnswers(page, link), `${label} : PDF du menu « ⋯ », réponse 200`);
  await page.keyboard.press('Escape');
  await link.waitFor({ state: 'hidden' });
  report.check(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), `${label} : détail, aucune largeur débordante`);
  report.check((await nestedInteractive(page)).length === 0, `${label} : détail, aucun élément interactif imbriqué`);
  await page.screenshot({ path: `results/quotes-detail-${label.replaceAll(' ', '-')}.png`, fullPage: true });
}

/** « Marquer accepté » : nom trop long refusé, puis accord nommé (double clic : une seule requête). */
async function checkAccept(page, locale, label, sent) {
  await button(page, msg(locale, 'quotes.actions.accept')).click();
  const sheet = page.getByRole('dialog').filter({ hasText: msg(locale, 'quotes.accept.title') });
  const name = sheet.getByLabel(msg(locale, 'quotes.accept.name'), { exact: true });
  const submit = sheet.getByRole('button', { name: msg(locale, 'quotes.accept.submit'), exact: true });
  await name.fill('x'.repeat(201));
  await submit.click();
  report.check(await appears(sheet.getByText(fmt(locale, 'quotes.accept.name_too_long', { max: 200 }), { exact: true })), `${label} : nom de plus de 200 caractères refusé`);
  await name.fill('Karim Alaoui');
  const posts = countPosts(page, '/status/');
  await submit.dblclick();
  await sheet.waitFor({ state: 'detached' });
  const shown = await toast(page, msg(locale, 'quotes.accept.done'));
  const quote = await api(page, `quotes/${sent.id}/`);
  await button(page, msg(locale, 'quotes.actions.convert')).waitFor();
  report.check(shown && posts() === 1 && quote.status === 'accepted' && quote.accepted_name === 'Karim Alaoui'
    && (await tracking(page, locale).innerText()).includes(fmt(locale, 'quotes.tracking.accepted_by', { name: 'Karim Alaoui' })),
  `${label} : devis accepté au nom de Karim Alaoui (une requête), suivi et action « ${msg(locale, 'quotes.actions.convert')} »`);
}

/** Réponses GET de la facture vues par la page (code, URL exacte), à partir de l'appel. */
function recordInvoiceReads(page) {
  const seen = [];
  const listener = response => { if (isInvoiceRead(response)) seen.push(`${response.status()} ${response.url()}`); };
  page.on('response', listener);
  return () => { page.off('response', listener); return seen; };
}

/** Une vérification, sa valeur observée ; en échec, capture et URL dans `results/` (diagnostic sans relance). */
async function checkSeen(page, label, slug, ok, text, observed) {
  report.check(ok, `${label} : ${text} — observé : ${observed}`);
  if (ok) return;
  const base = `results/quotes-failed-${label.replaceAll(' ', '-')}-${slug}`;
  await page.screenshot({ path: `${base}.png`, fullPage: true });
  await writeFile(`${base}.url.txt`, `${page.url()}\n`);
}

/** Clic sur « Transformer en facture » (double clic) et ce que la page en montre, relevé sans rien conclure. */
async function observeConvert(page, locale, sent) {
  const posts = countPosts(page, '/convert/');
  const reads = recordInvoiceReads(page);
  // Écoutées avant le clic : la réponse de la conversion et la lecture de la facture par l'éditeur, après redirection.
  const converted = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname.includes('/convert') && isFinal(r)).catch(() => null);
  const loaded = page.waitForResponse(r => isInvoiceRead(r) && isFinal(r)).catch(() => null);
  await button(page, msg(locale, 'quotes.actions.convert')).dblclick();
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}\/edit$/, { timeout: 10000 }).catch(() => {});
  const done = msg(locale, 'quotes.convert.done');
  const toastBox = page.locator('[data-sonner-toast]').filter({ hasText: done }).first();
  const shown = await appears(toastBox);
  const headingText = fmt(locale, 'invoices.editor.title', { doc: 'invoice' });
  const heading = page.getByRole('heading', { name: headingText, exact: true });
  const opened = await appears(heading.first());
  const [post, read] = await Promise.all([converted, loaded]);
  return {
    done, shown, toastText: shown ? await toastBox.innerText() : null, headingText, opened,
    headings: await heading.allInnerTexts(), visibleHeadings: await visible(heading).count(),
    post, read, path: new URL(page.url()).pathname, quote: await api(page, `quotes/${sent.id}/`), posts: posts(), reads: reads(),
  };
}

/** « Transformer en facture » : une assertion par fait observé ; retour : « Reprendre la facture ». */
async function checkConvert(page, locale, label, sent) {
  const o = await observeConvert(page, locale, sent);
  const invoiceId = o.path.split('/')[2];
  const seen = (slug, ok, text, observed) => checkSeen(page, label, slug, ok, text, observed);
  await seen('post', o.posts === 1 && o.post?.status() === 201, 'conversion : une seule requête POST, réponse 201',
    `${o.posts} requête(s), ${o.post ? `${o.post.status()} ${o.post.url()}` : 'aucune réponse'}`);
  await seen('url', /^\/invoices\/[0-9a-f-]{36}\/edit$/.test(o.path), 'conversion : URL de l\'éditeur de la facture', o.path);
  await seen('heading', o.opened && o.headings.length === 1, `conversion : titre « ${o.headingText} », un seul élément`,
    `${o.headings.length} élément(s) dont ${o.visibleHeadings} visible(s) : ${o.headings.map(t => `« ${t} »`).join(', ') || 'aucun'}`);
  await seen('read', !!o.read?.ok() && o.read.url().includes(invoiceId), 'conversion : facture lue par l\'éditeur (GET, 2xx)',
    `finale : ${o.read ? `${o.read.status()} ${o.read.url()}` : 'aucune'} ; toutes : ${o.reads.join(', ') || 'aucune'}`);
  await seen('toast', o.shown && o.toastText.includes(o.done), `conversion : message « ${o.done} »`, o.shown ? `« ${o.toastText} »` : 'absent');
  await seen('quote', o.quote.status === 'invoiced' && o.quote.invoice === invoiceId, 'conversion : devis facturé, relié à la facture ouverte',
    `statut ${o.quote.status}, facture ${o.quote.invoice}, facture de l'URL ${invoiceId}`);
  await goto(page, `/quotes/${sent.id}`);
  report.check(await button(page, fmt(locale, 'quotes.actions.view_invoice', { hasNumber: 'no' })).count() === 1
    && (await tracking(page, locale).innerText()).includes(msg(locale, 'quotes.tracking.invoice_draft')),
  `${label} : devis facturé, « ${fmt(locale, 'quotes.actions.view_invoice', { hasNumber: 'no' })} » tant que la facture est un brouillon`);
}

/** Devis envoyé par l'API (même client), pour le refus. */
async function sendByApi(page, customer) {
  const draft = await api(page, 'quotes/drafts/', { method: 'POST', data: { customer, lines: [QUOTE_LINE] } });
  const { issues } = await api(page, `quotes/${draft.id}/compliance/`);
  return api(page, `quotes/${draft.id}/send/`, { method: 'POST', data: { acknowledged_warnings: issues.map(i => i.code) } });
}

/** « Refuser le devis » : confirmation, focus par défaut sur « Garder le devis » ; refusé, le PDF devient l'action principale. */
async function checkDecline(page, locale, label, customer) {
  const sent = await sendByApi(page, customer);
  await goto(page, `/quotes/${sent.id}`);
  await openMenu(page, locale);
  await visible(page.getByRole(desktop(page) ? 'menuitem' : 'button', { name: msg(locale, 'quotes.actions.decline'), exact: true })).click();
  const dialog = page.getByRole('dialog').filter({ hasText: msg(locale, 'quotes.decline.title') });
  await dialog.waitFor();
  const keep = msg(locale, 'quotes.decline.keep');
  const focused = await page.waitForFunction(k => document.activeElement?.textContent?.trim() === k, keep, { timeout: 3000 }).then(() => true, () => false);
  report.check(focused, `${label} : refus, focus par défaut sur « ${keep} »`);
  await dialog.getByRole('button', { name: msg(locale, 'quotes.decline.confirm'), exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const shown = await toast(page, msg(locale, 'quotes.decline.done'));
  const quote = await api(page, `quotes/${sent.id}/`);
  const pdf = visible(page.getByRole('link', { name: msg(locale, 'quotes.actions.pdf'), exact: true }));
  // Le PDF ne remplace l'action principale qu'une fois le devis relu : on l'attend avant de compter.
  const replaced = await appears(pdf);
  report.check(shown && quote.status === 'declined' && replaced && await button(page, msg(locale, 'quotes.actions.accept')).count() === 0
    && await pdf.count() === 1 && await pdfAnswers(page, pdf)
    && (await tracking(page, locale).innerText()).includes(fmt(locale, 'quotes.tracking.step', { key: 'declined' })),
  `${label} : devis refusé, aucune action principale, PDF à sa place (réponse 200)`);
  await page.screenshot({ path: `results/quotes-declined-${label.replaceAll(' ', '-')}.png`, fullPage: true });
}

const isList = url => new URL(url).pathname === '/api/proxy/quotes/';

/** Liste : vide, en chargement (squelette annoncé), en erreur (message), réponses du serveur simulées. */
async function checkListStates(page, locale, label) {
  await page.route(isList, route => route.fulfill({ json: { count: 0, next: null, previous: null, results: [] } }));
  await goto(page, '/quotes');
  report.check(await page.getByText(msg(locale, 'quotes.empty_title'), { exact: true }).isVisible(), `${label} : liste vide, état vide canonique`);
  await page.unroute(isList);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(isList, async route => { await gate; await route.continue(); });
  await page.goto(`${BASE}/quotes`);
  // Mobile : squelette annoncé (`LoadingRegion`) ; desktop : `DataTableSkeleton` commun aux listes, sans région annoncée.
  const loading = await page.locator('[aria-busy="true"], .animate-pulse').first().waitFor({ timeout: 5000 }).then(() => true, () => false);
  report.check(loading, `${label} : liste en chargement, squelette affiché`);
  release();
  await page.unroute(isList);
  await page.route(isList, route => route.fulfill({ status: 500, json: { detail: 'Erreur.' } }));
  await page.goto(`${BASE}/quotes`);
  const failed = await page.getByRole('alert').filter({ hasText: msg(locale, 'quotes.load_error') }).waitFor({ timeout: 10000 }).then(() => true, () => false);
  report.check(failed, `${label} : liste en erreur, « ${msg(locale, 'quotes.load_error')} »`);
  await page.unroute(isList);
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
        const sent = await checkSend(page, locale, label, draft, before);
        await checkDetail(page, locale, label, sent);
        await checkAccept(page, locale, label, sent.sent);
        await checkConvert(page, locale, label, sent.sent);
        await checkDecline(page, locale, label, sent.sent.customer);
        await checkListStates(page, locale, label);
      }
    } finally {
      // Seules erreurs attendues : les 500 simulés de la liste en erreur (`checkListStates`).
      const issues = watch.problems.filter(p => !(p.includes('status of 500') && p.includes('/api/proxy/quotes/?page=')));
      report.check(issues.length === 0, `${viewport.name} : console propre${issues.map(p => `\n      ${p}`).join('')}`);
      await ctx.close();
    }
  }
} finally { await browser.close(); }
report.finish();
