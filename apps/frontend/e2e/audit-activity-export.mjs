/**
 * Audit de l'export de l'activité d'un client, à 1440px et 360px, en clair et en sombre, en français
 * et en arabe :
 * - puce « Commandes » de la carte Activité, puis « Exporter » : la fenêtre s'ouvre (par le bas à
 *   360px), seules les commandes sont cochées, « 12 derniers mois » est choisi, chaque case montre
 *   son nombre de lignes et le total annoncé est celui des commandes du client ;
 * - période personnalisée avec une fin avant le début : erreur sous la date de fin, rien n'est téléchargé ;
 * - « Télécharger le fichier » : un CSV `activite-audit-export-AAAA-MM-JJ.csv` (UTF-8 avec BOM,
 *   « ; »), en-têtes dans la langue de l'interface, une ligne par commande, autant que annoncé ;
 * - relevé de compte (URS-104) : PDF et WhatsApp remplacent les cases par une ligne fixe (« notes
 *   non incluses »), nombre de commandes égal au résumé de l'API (à régler pour le message),
 *   « PDF en français » en arabe ; à 360×640, rien ne défile en PDF et en WhatsApp (le CSV, avec
 *   ses quatre cases, défile, comme avant le choix du format : décision du 22/10/2026) ;
 * - PDF réel `releve-audit-export-AAAA-MM-JJ.pdf`, téléchargé sur desktop, partagé (Web Share
 *   simulé) sur mobile ; message du serveur, puis wa.me vers le téléphone du client ;
 * - message tronqué (résumé simulé à 42) : « Passer au PDF » (desktop) garde les commandes à régler,
 *   « Partager le PDF avec le résumé » (mobile) tient à 360×640.
 * Client dédié « Audit Export » (avec téléphone) et trois commandes du jour (annulées à la fin).
 */
import { readFile } from 'node:fs/promises';
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { nestedInteractive } from './lib/watch.mjs';
import { api, allResults } from './lib/products.mjs';
import { visibleButton } from './lib/form.mjs';
import { animationsDone } from './lib/wait.mjs';
import { binaryPdf, choose, fakeShare, filledButtons, finalResponse, fitIssue, flat } from './lib/exports.mjs';

const report = createReport();
const nested = [];
const CUSTOMER = 'Audit Export';
const TYPES = ['order', 'payment', 'shipment', 'note'];
// En-têtes du fichier (apps/customers/export_texts.py), dans la langue de l'interface.
const COLUMNS = {
  fr: ['Date', 'Type', 'Référence', 'Description', 'Montant', 'Statut', 'Auteur'],
  ar: ['التاريخ', 'النوع', 'المرجع', 'الوصف', 'المبلغ', 'الحالة', 'الكاتب'],
};
const ORDER_TYPE = { fr: 'Commande', ar: 'طلب' };
const AMOUNT = { fr: /^\d+,\d{2}$/, ar: /^\d+\.\d{2}$/ };
const PHONE = '+33612345678';
const E = (locale, key, params) => (params ? fmt(locale, `customers.export.${key}`, params) : msg(locale, `customers.export.${key}`));
// Textes communs aux exports, `kind` = relevé.
const X = (locale, key, params) => fmt(locale, `export.${key}`, { kind: 'statement', ...params });
const stripTags = (text) => text.replace(/<\/?\w+>/g, '');
const STATEMENT = (customer) => `customers/${customer.id}/statement`;
const SUMMARY_URL = '**/api/proxy/exports/customers/*/statement/summary/**';

async function setup(page) {
  const found = await allResults(page, `customers/?situation=all&search=${encodeURIComponent(CUSTOMER)}`);
  const existing = found.find((c) => c.display_name === CUSTOMER);
  const customer = existing
    ? await api(page, `customers/${existing.id}/`, { method: 'PATCH', data: { phone: PHONE } })
    : await api(page, 'customers/', { method: 'POST', data: { name: CUSTOMER, phone: PHONE } });
  const orders = [];
  for (const price of ['12.40', '8.00', '120.50']) {
    orders.push(await api(page, 'orders/', {
      method: 'POST',
      data: { customer: customer.id, items: [{ product_name: 'Audit export', quantity: 1, unit_price: price }] },
    }));
  }
  return { customer, orders };
}

const dialog = (page, locale) => page.getByRole('dialog', { name: E(locale, 'title') });
const checkbox = (page, locale, type) => dialog(page, locale).getByRole('checkbox', { name: new RegExp(`^${E(locale, 'type', { type })}`) });
const radio = (page, locale, period) => dialog(page, locale).getByRole('radio', { name: E(locale, 'period', { period }), exact: true });
const formatRadio = (page, locale, format) => dialog(page, locale).getByRole('radio', { name: X(locale, 'format', { format }), exact: true });
const stepButton = (page, locale, step) => visibleButton(page, X(locale, `step.${step}`));

async function openExport(page, ctx, customer) {
  const { locale } = ctx;
  await page.goto(`${BASE}/customers/${customer.id}`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
  await page.getByRole('button', { name: msg(locale, 'customers.timeline.chip_orders'), exact: true }).click();
  await page.waitForLoadState('networkidle');
  await visibleButton(page, E(locale, 'button')).click();
  await dialog(page, locale).waitFor({ state: 'visible' });
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
}

/** Fenêtre : par le bas sur mobile, cases et période pré-choisies, nombres de lignes. */
/** Boîte de la fenêtre une fois l'animation d'ouverture finie. */
async function settledBox(locator) {
  await animationsDone(locator);
  return locator.boundingBox();
}

async function checkDialog(page, ctx, expected) {
  const { label, locale, viewport } = ctx;
  const box = await settledBox(dialog(page, locale));
  const fromBottom = viewport.mobile ? Math.abs(box.y + box.height - viewport.height) <= 2 : box.y > 0 && box.y + box.height < viewport.height;
  report.check(fromBottom, `${label} : fenêtre « ${E(locale, 'title')} » ${viewport.mobile ? 'ouverte par le bas' : 'centrée'}`);
  const checked = [];
  for (const type of TYPES) if (await checkbox(page, locale, type).isChecked()) checked.push(type);
  report.check(checked.join() === 'order', `${label} : puce « Commandes » → seules les commandes cochées (${checked.join(', ')})`);
  report.check(await radio(page, locale, '12m').isChecked(), `${label} : « ${E(locale, 'period', { period: '12m' })} » choisi`);
  const rows = E(locale, 'rows', { count: expected });
  // Les nombres arrivent avec le résumé, après l'ouverture.
  await dialog(page, locale).getByText(rows).first().waitFor({ timeout: 8000 }).catch(() => {});
  const orderRow = flat(await checkbox(page, locale, 'order').locator('xpath=..').innerText());
  report.check(orderRow.endsWith(String(expected)) && await dialog(page, locale).getByText(rows).count() === 1,
    `${label} : « ${orderRow} », ${rows}`);
  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  report.check(overflow <= 0, `${label} : pas de défilement horizontal (${overflow})`);
}

/** Période personnalisée à l'envers : erreur, pas de téléchargement ; retour à 12 mois. */
async function checkCustomPeriod(page, ctx) {
  const { label, locale } = ctx;
  await choose(radio(page, locale, 'custom'));
  await dialog(page, locale).getByLabel(E(locale, 'from'), { exact: true }).fill('2026-10-10');
  await dialog(page, locale).getByLabel(E(locale, 'to'), { exact: true }).fill('2026-10-01');
  let downloaded = false;
  const onDownload = () => { downloaded = true; };
  page.on('download', onDownload);
  await visibleButton(page, E(locale, 'download')).click();
  const error = await dialog(page, locale).getByText(E(locale, 'dates_order')).isVisible();
  await page.waitForLoadState('networkidle');
  page.off('download', onDownload);
  report.check(error && !downloaded, `${label} : fin avant début → « ${E(locale, 'dates_order')} », rien téléchargé`);
  await choose(radio(page, locale, '12m'));
  await page.waitForLoadState('networkidle');
}

/** Téléchargement : nom, BOM, séparateur, en-têtes, une ligne par commande. */
async function checkDownload(page, ctx, expected) {
  const { label, locale } = ctx;
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    visibleButton(page, E(locale, 'download')).click(),
  ]);
  const name = download.suggestedFilename();
  const raw = await readFile(await download.path(), 'utf8');
  const lines = raw.replace(/^﻿/, '').trim().split(/\r?\n/).map((line) => line.split(';'));
  const [header, ...rows] = lines;
  report.check(/^activite-audit-export-\d{4}-\d{2}-\d{2}\.csv$/.test(name), `${label} : fichier « ${name} »`);
  report.check(raw.startsWith('﻿') && header.join(';') === COLUMNS[locale].join(';'),
    `${label} : UTF-8 avec BOM, « ; », colonnes ${header.join(' | ')}`);
  report.check(rows.length === expected && rows.every((r) => r.length === 7 && r[1] === ORDER_TYPE[locale] && AMOUNT[locale].test(r[4])),
    `${label} : ${rows.length} ligne(s) de commande, comme annoncé (${expected}), montants ${rows.map((r) => r[4]).join(', ')}`);
  report.check(!await dialog(page, locale).isVisible(), `${label} : fenêtre refermée après le téléchargement`);
}

const FILE_NAME = (ext) => new RegExp(`^releve-audit-export-\\d{4}-\\d{2}-\\d{2}\\.${ext}$`);

async function checkOneFilled(page, ctx, step) {
  const filled = await filledButtons(dialog(page, ctx.locale));
  report.check(filled.length === 1 && filled[0] === X(ctx.locale, `step.${step}`),
    `${ctx.label} : un seul bouton plein, « ${X(ctx.locale, `step.${step}`)} » (${filled.map((f) => `« ${f} »`).join(', ')})`);
}

/**
 * PDF et WhatsApp : ligne de contenu fixe à la place des cases, nombre de commandes égal au résumé
 * de l'API (toutes les commandes du client sont du jour : 12 mois = tout l'historique).
 */
async function checkStatementFormats(page, ctx, customer) {
  const { label, locale } = ctx;
  report.check(await formatRadio(page, locale, 'csv').isChecked(), `${label} : CSV choisi à l'ouverture`);
  for (const format of ['pdf', 'whatsapp']) {
    await choose(formatRadio(page, locale, format));
    const { rows } = await api(page, `exports/${STATEMENT(customer)}/summary/${format === 'whatsapp' ? '?due=true' : ''}`);
    const text = X(locale, 'rows', { format, count: rows });
    const shown = await dialog(page, locale).getByText(text, { exact: true }).waitFor({ timeout: 8000 }).then(() => true, () => false);
    const content = flat(stripTags(E(locale, 'statement_content', { format })));
    const fixed = await dialog(page, locale).getByText(content, { exact: true }).isVisible();
    const boxes = await dialog(page, locale).getByRole('checkbox').count();
    const hint = await dialog(page, locale).getByText(X(locale, 'format_hint', { format })).isVisible();
    const french = await dialog(page, locale).getByText(X(locale, 'pdf_french'), { exact: true }).count();
    report.check(shown && rows >= 3 && fixed && boxes === 0 && hint && french === (locale === 'ar' && format === 'pdf' ? 1 : 0),
      `${label} : ${format} → « ${content} » sans cases, ${text} (résumé de l'API : ${rows})${french ? `, « ${X(locale, 'pdf_french')} »` : ''}`);
  }
  await choose(formatRadio(page, locale, 'csv'));
  report.check(await checkbox(page, locale, 'order').isChecked(), `${label} : retour au CSV → cases rétablies, commandes cochées`);
}

/** À 360×640 : la fenêtre tient dans l'écran et rien n'y défile, en PDF et en WhatsApp. */
async function checkFits(page, ctx) {
  const { label, locale, viewport } = ctx;
  await page.setViewportSize({ width: 360, height: 640 });
  for (const format of ['pdf', 'whatsapp']) {
    await choose(formatRadio(page, locale, format));
    const issue = await fitIssue(dialog(page, locale));
    report.check(issue === '', `${label} : 360×640, ${format} → tient sans défiler${issue ? ` (${issue})` : ''}`);
  }
  await choose(formatRadio(page, locale, 'csv'));
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
}

/** PDF réel : téléchargé sur desktop ; préparé puis partagé (Web Share simulé) sur mobile. */
async function checkPdf(page, ctx, customer) {
  const { label, locale, viewport } = ctx;
  await choose(formatRadio(page, locale, 'pdf'));
  const isPdf = finalResponse(STATEMENT(customer), 'pdf');
  if (!viewport.mobile) {
    await checkOneFilled(page, ctx, 'download_pdf');
    const [response, download] = await Promise.all([
      page.waitForResponse(isPdf, { timeout: 15000 }),
      page.waitForEvent('download', { timeout: 15000 }),
      stepButton(page, locale, 'download_pdf').click(),
    ]);
    const bytes = await readFile(await download.path());
    const pdf = binaryPdf(bytes.subarray(0, 4).toString('latin1'), bytes.subarray(-1024).toString('latin1'));
    report.check(response.status() === 200 && FILE_NAME('pdf').test(download.suggestedFilename()) && pdf,
      `${label} : PDF téléchargé « ${download.suggestedFilename()} », ${bytes.length} octets intacts (%PDF … %%EOF)`);
  } else {
    await Promise.all([page.waitForResponse(isPdf, { timeout: 15000 }), stepButton(page, locale, 'prepare_pdf').click()]);
    await stepButton(page, locale, 'share_pdf').waitFor();
    await checkOneFilled(page, ctx, 'share_pdf');
    await stepButton(page, locale, 'share_pdf').click();
    const shared = await page.waitForFunction(() => window.__shared, null, { timeout: 5000 }).then((h) => h.jsonValue(), () => null);
    report.check(FILE_NAME('pdf').test(shared?.name ?? '') && shared.type === 'application/pdf' && binaryPdf(shared.head, shared.tail),
      `${label} : « ${X(locale, 'step.prepare_pdf')} » puis « ${X(locale, 'step.share_pdf')} » → fichier partagé ${shared?.name} (${shared?.size} octets)`);
  }
  await dialog(page, locale).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  report.check(!await dialog(page, locale).isVisible(), `${label} : fenêtre refermée après le PDF`);
}

/** WhatsApp : message du serveur (nom du client, sans note), puis wa.me vers le téléphone du client. */
async function checkWhatsApp(page, ctx, customer) {
  const { label, locale } = ctx;
  await choose(formatRadio(page, locale, 'whatsapp'));
  const [response] = await Promise.all([
    page.waitForResponse(finalResponse(STATEMENT(customer), 'whatsapp'), { timeout: 10000 }),
    stepButton(page, locale, 'prepare_message').click(),
  ]);
  const { text } = await response.json();
  const preview = dialog(page, locale).getByLabel(X(locale, 'preview_label'), { exact: true });
  await preview.waitFor({ timeout: 5000 });
  report.check(flat(await preview.innerText()) === flat(text) && text.includes(CUSTOMER),
    `${label} : aperçu = message du serveur, au nom de « ${CUSTOMER} »`);
  await checkOneFilled(page, ctx, 'open_whatsapp');
  const popup = page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null);
  await stepButton(page, locale, 'open_whatsapp').click();
  const opened = await popup;
  const url = opened?.url() ?? '';
  await opened?.close();
  const recipient = `https://wa.me/${PHONE.replace(/\D/g, '')}?text=`;
  const sent = url.startsWith(recipient) ? new URL(url).searchParams.get('text') : null;
  report.check(sent === text && !await dialog(page, locale).isVisible(),
    `${label} : « ${X(locale, 'step.open_whatsapp')} » → ${recipient}…, avec le message, fenêtre refermée`);
}

/** Message tronqué (résumé simulé à 42) : « Passer au PDF » garde les commandes à régler ; tient à 360×640. */
async function checkWhatsAppLimit(page, ctx, customer) {
  const { label, locale, viewport } = ctx;
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: { rows: 42, pdf_max_rows: 1000, whatsapp_max_rows: 15 } }));
  // Page rechargée par l'ouverture : résumé hors cache, simulé dès le premier appel.
  await openExport(page, ctx, customer);
  await choose(formatRadio(page, locale, 'whatsapp'));
  const notice = dialog(page, locale).getByRole('status')
    .filter({ hasText: X(locale, 'whatsapp_limit', { max: 15, count: 42, target: 'pdf' }) });
  const found = await notice.waitFor({ timeout: 8000 }).then(() => true, () => false);
  const action = viewport.mobile ? 'share_bundle' : 'use_pdf';
  const button = notice.getByRole('button', { name: X(locale, action), exact: true });
  report.check(found && await button.isVisible(),
    `${label} : 42 commandes → « ${X(locale, 'whatsapp_limit', { max: 15, count: 42, target: 'pdf' })} », action « ${X(locale, action)} »`);
  if (viewport.mobile) {
    await page.setViewportSize({ width: 360, height: 640 });
    const issue = await fitIssue(dialog(page, locale));
    report.check(issue === '', `${label} : 360×640, avertissement du message → tient sans défiler${issue ? ` (${issue})` : ''}`);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
  } else {
    await button.click();
    const note = E(locale, 'pending_note', { source: 'message' });
    report.check(await formatRadio(page, locale, 'pdf').isChecked() && await dialog(page, locale).getByText(note, { exact: true }).isVisible(),
      `${label} : « ${X(locale, 'use_pdf')} » choisit le PDF et garde les commandes à régler (« ${note} »)`);
  }
  await visibleButton(page, X(locale, 'cancel')).click();
  await dialog(page, locale).waitFor({ state: 'hidden' });
  await page.unroute(SUMMARY_URL);
}

async function runConfig(page, run, customer, expected) {
  await openExport(page, run, customer);
  await checkDialog(page, run, expected);
  await checkCustomPeriod(page, run);
  await checkStatementFormats(page, run, customer);
  if (run.viewport.mobile) await checkFits(page, run);
  await checkDownload(page, run, expected);
  await openExport(page, run, customer);
  await checkPdf(page, run, customer);
  await openExport(page, run, customer);
  await checkWhatsApp(page, run, customer);
  await checkWhatsAppLimit(page, run, customer);
}

const browser = await launch();
try {
  for (const viewport of VIEWPORTS) {
    const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
    await ctx.route('https://wa.me/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>wa</title>' }));
    if (viewport.mobile) await ctx.addInitScript(fakeShare);
    const { customer, orders } = await setup(page);
    // Commandes du client sur 12 mois, lues dans la timeline (indépendamment de l'export).
    const expected = (await api(page, `customers/${customer.id}/activity/?types=order&limit=1`)).count;
    for (const locale of ['fr', 'ar']) {
      for (const theme of ['light', 'dark']) {
        if (!inMatrix(viewport, locale, theme)) continue;
        const label = `${viewport.name}px ${locale} ${theme === 'dark' ? 'sombre' : 'clair'}`;
        console.log(`\n=== ${label}`);
        await setLocale(locale);
        setTheme(theme);
        watch.setLabel(label);
        const before = watch.problems.length;
        const run = { label, locale, viewport };
        try {
          await runConfig(page, run, customer, expected);
        } catch (error) {
          report.check(false, `${label} : parcours interrompu — ${error.message.split('\n')[0]}`);
        }
        const problems = [...watch.problems.slice(before), ...nested.splice(0).map((n) => `imbriqué : ${n}`)];
        report.check(problems.length === 0, `${label} : console propre, aucun élément imbriqué${problems.map((p) => `\n      ${p}`).join('')}`);
      }
    }
    for (const order of orders) await api(page, `orders/${order.id}/status/`, { method: 'POST', data: { status: 'cancelled' } });
    await ctx.close();
  }
} finally {
  await browser.close();
}
report.finish();
