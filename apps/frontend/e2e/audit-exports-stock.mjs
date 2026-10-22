/**
 * Audit de l'export du stock (URS-059), à 1440px et 360px, en clair et en sombre, en français et en
 * arabe. Trois articles du parcours (rupture, stock faible, stock suffisant), retrouvés par la
 * recherche de la liste, supprimés à la fin :
 * - « Exporter » dans l'en-tête du Stock, onglet Niveaux seulement : libellé sur desktop, icône seule
 *   de 44px au moins sur mobile, nommée par son aria-label ;
 * - fenêtre : par le bas à 360px, sous-titre (ordre de la liste, recherche reprise), CSV et « Tout le
 *   stock » choisis, nombre de formats égal au résumé de l'API ; « PDF en français » en arabe ;
 *   liste filtrée « En rupture » → « À réapprovisionner » pré-choisi ; à 360×640, rien ne défile ;
 * - WhatsApp impose « À réapprovisionner » (« Tout le stock » désactivé) ; repasser au CSV rétablit
 *   le périmètre d'avant ;
 * - CSV : `stock-AAAA-MM-JJ.csv` ou `reapprovisionnement-…`, BOM, « ; », colonnes dans la langue,
 *   autant de lignes qu'annoncé ; PDF réel, téléchargé sur desktop, partagé (Web Share simulé) sur mobile ;
 * - WhatsApp : aperçu = texte du serveur, ruptures et stocks faibles seulement, wa.me sans destinataire ;
 * - message tronqué (résumé simulé à 1 500 puis 42) : « Passer au CSV », puis « Passer au PDF »
 *   (desktop) gardent la liste à réapprovisionner ; à 360×640, l'avertissement tient sans défiler.
 */
import { readFile } from 'node:fs/promises';
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt } from './lib/messages.mjs';
import { nestedInteractive } from './lib/watch.mjs';
import { api, createArticle, remove } from './lib/products.mjs';
import { visibleButton } from './lib/form.mjs';
import { animationsDone } from './lib/wait.mjs';
import { binaryPdf, choose, fakeShare, filledButtons, finalResponse, fitIssue, flat } from './lib/exports.mjs';

const report = createReport();
const nested = [];
// En-têtes du fichier (apps/exports/texts.py), dans la langue de l'interface.
const COLUMNS = {
  fr: ['Article', 'Format', 'Référence', 'Quantité', "Seuil d'alerte", 'Statut', "Prix d'achat", 'Prix de vente', 'Valeur estimée'],
  ar: ['المنتج', 'الشكل', 'المرجع', 'الكمية', 'حد التنبيه', 'الحالة', 'سعر الشراء', 'سعر البيع', 'القيمة التقديرية'],
};
const FILE_NAME = (stem, ext) => new RegExp(`^${stem}-\\d{4}-\\d{2}-\\d{2}\\.${ext}$`);
const SUMMARY_URL = '**/api/proxy/exports/stock/summary/**';
const ORDERING = 'stock';
// Textes communs aux exports (`export.*`, `kind` = stock) et propres au stock (`stock.export.*`).
const X = (locale, key, params) => fmt(locale, `export.${key}`, { kind: 'stock', ...params });
const S = (locale, key, params) => fmt(locale, `stock.export.${key}`, params);

const dialog = (page, locale) => page.getByRole('dialog', { name: S(locale, 'title') });
const radio = (page, locale, label) => dialog(page, locale).getByRole('radio', { name: label, exact: true });
const formatRadio = (page, locale, format) => radio(page, locale, X(locale, 'format', { format }));
const scopeRadio = (page, locale, scope) => radio(page, locale, S(locale, 'scope', { scope }));
const stepButton = (page, locale, step) => visibleButton(page, X(locale, `step.${step}`));
const exportButton = (page, ctx) => visibleButton(page, ctx.viewport.mobile ? S(ctx.locale, 'button_label') : X(ctx.locale, 'button'));

async function goto(page, path) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
}

async function openDialog(page, ctx) {
  await exportButton(page, ctx).click();
  await dialog(page, ctx.locale).waitFor({ state: 'visible' });
  await animationsDone(dialog(page, ctx.locale));
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
}

async function closeDialog(page, ctx) {
  await visibleButton(page, X(ctx.locale, 'cancel')).click();
  await dialog(page, ctx.locale).waitFor({ state: 'hidden' });
}

async function checkOneFilled(page, ctx, step) {
  const filled = await filledButtons(dialog(page, ctx.locale));
  report.check(filled.length === 1 && filled[0] === X(ctx.locale, `step.${step}`),
    `${ctx.label} : un seul bouton plein, « ${X(ctx.locale, `step.${step}`)} » (${filled.map((f) => `« ${f} »`).join(', ')})`);
}

/** Nombre annoncé dans la fenêtre, comparé au résumé de l'API pour les mêmes paramètres. */
async function rowsShown(page, ctx, scope, search = '') {
  const query = new URLSearchParams({ scope, ...(search ? { search } : {}), ordering: ORDERING });
  const expected = (await api(page, `exports/stock/summary/?${query}`)).rows;
  const text = X(ctx.locale, 'rows', { count: expected });
  const shown = await dialog(page, ctx.locale).getByText(text, { exact: true }).waitFor({ timeout: 8000 }).then(() => true, () => false);
  return { expected, text, shown };
}

/** Bouton de l'en-tête : absent de l'onglet Mouvements ; libellé sur desktop, icône ≥ 44px sur mobile. */
async function checkButton(page, ctx) {
  const { label, locale, viewport } = ctx;
  await goto(page, '/stock?tab=mouvements');
  report.check(await exportButton(page, ctx).count() === 0, `${label} : pas d'export sur l'onglet Mouvements`);
  await goto(page, '/stock');
  const button = exportButton(page, ctx);
  const box = await button.boundingBox();
  const text = flat(await button.innerText());
  report.check(viewport.mobile ? box.width >= 44 && box.height >= 44 && text === '' : text === X(locale, 'button'),
    viewport.mobile
      ? `${label} : « ${S(locale, 'button_label')} » en icône seule (${Math.round(box.width)}×${Math.round(box.height)}, texte « ${text} »)`
      : `${label} : bouton « ${X(locale, 'button')} » avec libellé`);
}

/** Fenêtre : par le bas sur mobile, sous-titre, CSV et « Tout le stock » choisis, nombre de formats. */
async function checkDialog(page, ctx) {
  const { label, locale, viewport } = ctx;
  const box = await dialog(page, locale).boundingBox();
  const placed = viewport.mobile ? Math.abs(box.y + box.height - viewport.height) <= 2 : box.y > 0 && box.y + box.height < viewport.height;
  report.check(placed, `${label} : fenêtre « ${S(locale, 'title')} » ${viewport.mobile ? 'ouverte par le bas' : 'centrée'}`);
  report.check(await dialog(page, locale).getByText(S(locale, 'scope_all'), { exact: true }).isVisible(), `${label} : sous-titre « ${S(locale, 'scope_all')} »`);
  report.check(await formatRadio(page, locale, 'csv').isChecked() && await scopeRadio(page, locale, 'all').isChecked(),
    `${label} : CSV et « ${S(locale, 'scope', { scope: 'all' })} » choisis à l'ouverture`);
  const rows = await rowsShown(page, ctx, 'all');
  report.check(rows.shown, `${label} : ${rows.text} (résumé de l'API : ${rows.expected})`);
  await checkOneFilled(page, ctx, 'download_csv');
  await choose(formatRadio(page, locale, 'pdf'));
  const hint = await dialog(page, locale).getByText(X(locale, 'format_hint', { format: 'pdf' })).isVisible();
  const french = await dialog(page, locale).getByText(X(locale, 'pdf_french'), { exact: true }).count();
  report.check(hint && french === (locale === 'ar' ? 1 : 0),
    `${label} : PDF → sa description${locale === 'ar' ? `, « ${X(locale, 'pdf_french')} »` : ', sans mention de langue'}`);
  await choose(formatRadio(page, locale, 'csv'));
  return rows.expected;
}

/** WhatsApp impose « À réapprovisionner » ; CSV rétablit le périmètre d'avant, PDF aussi. */
async function checkScopeLock(page, ctx) {
  const { label, locale } = ctx;
  const restock = S(locale, 'scope', { scope: 'restock' });
  await choose(formatRadio(page, locale, 'whatsapp'));
  const locked = await scopeRadio(page, locale, 'restock').isChecked() && await scopeRadio(page, locale, 'all').isDisabled();
  const hint = await dialog(page, locale).getByText(X(locale, 'format_hint', { format: 'whatsapp' })).isVisible();
  await choose(formatRadio(page, locale, 'csv'));
  const restored = await scopeRadio(page, locale, 'all').isChecked() && await scopeRadio(page, locale, 'all').isEnabled();
  report.check(locked && hint && restored,
    `${label} : WhatsApp → « ${restock} » imposé, « ${S(locale, 'scope', { scope: 'all' })} » désactivé ; CSV → périmètre d'avant rétabli`);
  await choose(scopeRadio(page, locale, 'restock'));
  await choose(formatRadio(page, locale, 'whatsapp'));
  await choose(formatRadio(page, locale, 'pdf'));
  report.check(await scopeRadio(page, locale, 'restock').isChecked(), `${label} : « ${restock} » → WhatsApp → PDF : « ${restock} » gardé`);
  await choose(scopeRadio(page, locale, 'all'));
  await choose(formatRadio(page, locale, 'csv'));
}

/** À 360×640 : la fenêtre tient dans l'écran et rien n'y défile, pour chaque format. */
async function checkFits(page, ctx) {
  const { label, locale, viewport } = ctx;
  await page.setViewportSize({ width: 360, height: 640 });
  for (const format of ['csv', 'pdf', 'whatsapp']) {
    await choose(formatRadio(page, locale, format));
    const issue = await fitIssue(dialog(page, locale));
    report.check(issue === '', `${label} : 360×640, ${format} → tient sans défiler${issue ? ` (${issue})` : ''}`);
  }
  await choose(formatRadio(page, locale, 'csv'));
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
}

/** CSV : nom selon le périmètre, BOM, séparateur, en-têtes dans la langue, une ligne par format. */
async function checkCsv(page, ctx, expected, stem) {
  const { label, locale } = ctx;
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    stepButton(page, locale, 'download_csv').click(),
  ]);
  const name = download.suggestedFilename();
  const raw = await readFile(await download.path(), 'utf8');
  const [header, ...rows] = raw.replace(/^﻿/, '').trim().split(/\r?\n/).map((line) => line.split(';'));
  report.check(FILE_NAME(stem, 'csv').test(name) && raw.startsWith('﻿') && header.join(';') === COLUMNS[locale].join(';'),
    `${label} : fichier « ${name} », UTF-8 avec BOM, « ; », colonnes ${header.slice(0, 3).join(' | ')}…`);
  report.check(rows.length === expected, `${label} : ${rows.length} ligne(s), comme annoncé (${expected})`);
  report.check(!await dialog(page, locale).isVisible(), `${label} : fenêtre refermée après le téléchargement`);
}

/** Liste filtrée « En rupture » avec recherche : « À réapprovisionner » pré-choisi, sous-titre, CSV. */
async function checkRestockList(page, ctx, search) {
  const { label, locale } = ctx;
  await goto(page, `/stock?state=out&search=${encodeURIComponent(search)}`);
  await openDialog(page, ctx);
  const subtitle = S(locale, 'scope_search', { query: search });
  const described = await dialog(page, locale).getByText(subtitle, { exact: true }).isVisible();
  const rows = await rowsShown(page, ctx, 'restock', search);
  report.check(await scopeRadio(page, locale, 'restock').isChecked() && described && rows.shown && rows.expected === 2,
    `${label} : liste « En rupture » → « ${S(locale, 'scope', { scope: 'restock' })} » pré-choisi, « ${subtitle} », ${rows.text}`);
  await checkCsv(page, ctx, rows.expected, 'reapprovisionnement');
}

/** PDF réel : téléchargé sur desktop ; préparé puis partagé (Web Share simulé) sur mobile. */
async function checkPdf(page, ctx) {
  const { label, locale, viewport } = ctx;
  await choose(formatRadio(page, locale, 'pdf'));
  const isPdf = finalResponse('stock', 'pdf');
  if (!viewport.mobile) {
    const [response, download] = await Promise.all([
      page.waitForResponse(isPdf, { timeout: 15000 }),
      page.waitForEvent('download', { timeout: 15000 }),
      stepButton(page, locale, 'download_pdf').click(),
    ]);
    const bytes = await readFile(await download.path());
    const pdf = binaryPdf(bytes.subarray(0, 4).toString('latin1'), bytes.subarray(-1024).toString('latin1'));
    report.check(response.status() === 200 && FILE_NAME('stock', 'pdf').test(download.suggestedFilename()) && pdf,
      `${label} : PDF téléchargé « ${download.suggestedFilename()} », ${bytes.length} octets intacts (%PDF … %%EOF)`);
  } else {
    await Promise.all([page.waitForResponse(isPdf, { timeout: 15000 }), stepButton(page, locale, 'prepare_pdf').click()]);
    await stepButton(page, locale, 'share_pdf').waitFor();
    await checkOneFilled(page, ctx, 'share_pdf');
    await stepButton(page, locale, 'share_pdf').click();
    const shared = await page.waitForFunction(() => window.__shared, null, { timeout: 5000 }).then((h) => h.jsonValue(), () => null);
    report.check(FILE_NAME('stock', 'pdf').test(shared?.name ?? '') && shared.type === 'application/pdf' && binaryPdf(shared.head, shared.tail),
      `${label} : « ${X(locale, 'step.prepare_pdf')} » puis « ${X(locale, 'step.share_pdf')} » → fichier partagé ${shared?.name} (${shared?.size} octets)`);
  }
  await dialog(page, locale).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  report.check(!await dialog(page, locale).isVisible(), `${label} : fenêtre refermée après le PDF`);
}

/** WhatsApp : message du serveur (ruptures et stocks faibles seulement), puis wa.me sans destinataire. */
async function checkWhatsApp(page, ctx, names) {
  const { label, locale } = ctx;
  await goto(page, `/stock?search=${encodeURIComponent(names.search)}`);
  await openDialog(page, ctx);
  await choose(formatRadio(page, locale, 'whatsapp'));
  const [response] = await Promise.all([
    page.waitForResponse(finalResponse('stock', 'whatsapp'), { timeout: 10000 }),
    stepButton(page, locale, 'prepare_message').click(),
  ]);
  const { text } = await response.json();
  const preview = dialog(page, locale).getByLabel(X(locale, 'preview_label'), { exact: true });
  await preview.waitFor({ timeout: 5000 });
  const listed = text.includes(names.out) && text.includes(names.low) && !text.includes(names.ok);
  report.check(flat(await preview.innerText()) === flat(text) && listed,
    `${label} : aperçu = message du serveur, rupture et stock faible listés, stock suffisant absent`);
  await checkOneFilled(page, ctx, 'open_whatsapp');
  const popup = page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null);
  await stepButton(page, locale, 'open_whatsapp').click();
  const opened = await popup;
  const url = opened?.url() ?? '';
  await opened?.close();
  const sent = url.startsWith('https://wa.me/?text=') ? new URL(url).searchParams.get('text') : null;
  report.check(sent === text && !await dialog(page, locale).isVisible(),
    `${label} : « ${X(locale, 'step.open_whatsapp')} » → wa.me sans destinataire, avec le message, fenêtre refermée`);
}

/** Avertissement du message tronqué (résumé simulé à `count`), ouvert sur « Tout le stock ». */
async function truncatedNotice(page, ctx, count, target) {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: { rows: count, pdf_max_rows: 1000, whatsapp_max_rows: 15 } }));
  // Page rechargée : résumé hors cache, simulé dès l'ouverture.
  await goto(page, '/stock');
  await openDialog(page, ctx);
  await choose(formatRadio(page, ctx.locale, 'whatsapp'));
  const notice = dialog(page, ctx.locale).getByRole('status')
    .filter({ hasText: X(ctx.locale, 'whatsapp_limit', { max: 15, count, target }) });
  return notice.waitFor({ timeout: 8000 }).then(() => notice, () => null);
}

/** Message tronqué : passer au CSV ou au PDF garde la liste à réapprovisionner ; tient à 360×640. */
async function checkWhatsAppLimit(page, ctx) {
  const { label, locale, viewport } = ctx;
  const restock = S(locale, 'scope', { scope: 'restock' });
  let notice = await truncatedNotice(page, ctx, 1500, 'csv');
  await notice?.getByRole('button', { name: X(locale, 'use_csv'), exact: true }).click();
  report.check(!!notice && await formatRadio(page, locale, 'csv').isChecked() && await scopeRadio(page, locale, 'restock').isChecked(),
    `${label} : 1 500 formats → « ${X(locale, 'whatsapp_limit', { max: 15, count: 1500, target: 'csv' })} », « ${X(locale, 'use_csv')} » garde « ${restock} »`);
  await closeDialog(page, ctx);
  await page.unroute(SUMMARY_URL);

  notice = await truncatedNotice(page, ctx, 42, 'pdf');
  const action = viewport.mobile ? 'share_bundle' : 'use_pdf';
  const button = notice?.getByRole('button', { name: X(locale, action), exact: true });
  report.check(!!notice && await button.isVisible(),
    `${label} : 42 formats → « ${X(locale, 'whatsapp_limit', { max: 15, count: 42, target: 'pdf' })} », action « ${X(locale, action)} »`);
  if (viewport.mobile) {
    await page.setViewportSize({ width: 360, height: 640 });
    const issue = await fitIssue(dialog(page, locale));
    report.check(issue === '', `${label} : 360×640, avertissement du message → tient sans défiler${issue ? ` (${issue})` : ''}`);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
  } else {
    await button.click();
    report.check(await formatRadio(page, locale, 'pdf').isChecked() && await scopeRadio(page, locale, 'restock').isChecked(),
      `${label} : « ${X(locale, 'use_pdf')} » choisit le PDF et garde « ${restock} »`);
  }
  await closeDialog(page, ctx);
  await page.unroute(SUMMARY_URL);
}

async function runConfig(page, run, names) {
  await checkButton(page, run);
  await openDialog(page, run);
  const expected = await checkDialog(page, run);
  await checkScopeLock(page, run);
  if (run.viewport.mobile) await checkFits(page, run);
  await checkCsv(page, run, expected, 'stock');
  await checkRestockList(page, run, names.search);
  await goto(page, '/stock');
  await openDialog(page, run);
  await checkPdf(page, run);
  await checkWhatsApp(page, run, names);
  await checkWhatsAppLimit(page, run);
}

const browser = await launch();
try {
  for (const viewport of VIEWPORTS) {
    const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
    await ctx.route('https://wa.me/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>wa</title>' }));
    if (viewport.mobile) await ctx.addInitScript(fakeShare);
    const search = `Audit export ${Date.now().toString(36)}`;
    const names = { search, out: `${search} rupture`, low: `${search} faible`, ok: `${search} suffisant` };
    const articles = [
      await createArticle(page, { name: names.out, price: '10.00', stock: 0 }),
      await createArticle(page, { name: names.low, price: '10.00', threshold: '5', stock: 2 }),
      await createArticle(page, { name: names.ok, price: '10.00', threshold: '5', stock: 20 }),
    ];
    try {
      for (const locale of ['fr', 'ar']) {
        for (const theme of ['light', 'dark']) {
          if (!inMatrix(viewport, locale, theme)) continue;
          const label = `${viewport.name}px ${locale} ${theme === 'dark' ? 'sombre' : 'clair'}`;
          console.log(`\n=== ${label}`);
          await setLocale(locale);
          setTheme(theme);
          watch.setLabel(label);
          const before = watch.problems.length;
          try {
            await runConfig(page, { label, locale, viewport }, names);
          } catch (error) {
            report.check(false, `${label} : parcours interrompu — ${error.message.split('\n')[0]}`);
          }
          const problems = [...watch.problems.slice(before), ...nested.splice(0).map((n) => `imbriqué : ${n}`)];
          report.check(problems.length === 0, `${label} : console propre, aucun élément imbriqué${problems.map((p) => `\n      ${p}`).join('')}`);
        }
      }
    } finally {
      await remove(page, articles.map((a) => a.id));
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
report.finish();
