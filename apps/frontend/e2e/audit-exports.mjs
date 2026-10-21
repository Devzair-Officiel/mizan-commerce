/**
 * Audit de l'export des commandes (URS-058), à 1440px et 360px, en clair et en sombre, en français
 * et en arabe :
 * - « Exporter » dans l'en-tête de Commandes : libellé sur desktop, icône seule de 44px au moins
 *   sur mobile, nommée par son aria-label ;
 * - fenêtre : par le bas à 360px, filtres de la liste en sous-titre, format en contrôle segmenté
 *   (ordre selon le sens d'écriture du document), une ligne de description du format, mention
 *   « PDF en français » en arabe ; à 360×640, rien ne défile, quel que soit le format ;
 * - nombre de commandes égal au résumé de l'API (liste filtrée « À encaisser » comprise) ;
 * - période personnalisée à l'envers : erreur sous la date de fin, rien n'est téléchargé ;
 * - plafond du PDF (résumé simulé à 1 500) : alerte, bouton désactivé, « Passer au CSV » ;
 * - CSV : `commandes-AAAA-MM-JJ.csv`, BOM, « ; », colonnes dans la langue, autant de lignes qu'annoncé ;
 * - PDF, réel une fois par taille (limite de 10 rendus par minute) : en-têtes du proxy
 *   (`application/pdf`, `Content-Disposition` en pièce jointe, aucun ne porte le jeton), octets
 *   reçus intacts (`%PDF` … `%%EOF`) ;
 *   téléchargé sur desktop, préparé puis partagé (Web Share simulé) sur mobile ;
 * - limite de débit (429 simulé) : notification, fenêtre ouverte ;
 * - WhatsApp : message préparé (aperçu = texte du serveur), « Copier le texte », « Ouvrir WhatsApp »
 *   → wa.me avec ce texte (wa.me servi par l'audit). Une seule action pleine dans le pied.
 */
import { readFile } from 'node:fs/promises';
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { nestedInteractive } from './lib/watch.mjs';
import { api } from './lib/products.mjs';
import { visibleButton } from './lib/form.mjs';
import { animationsDone } from './lib/wait.mjs';

const report = createReport();
const nested = [];
// En-têtes du fichier (apps/exports/texts.py), dans la langue de l'interface.
const COLUMNS = {
  fr: ['N°', 'Date', 'Client', 'Statut', 'Paiement', 'Sous-total', 'Remise', 'Livraison', 'Total', 'Encaissé', 'Reste dû', 'Trop-perçu'],
  ar: ['الرقم', 'التاريخ', 'العميل', 'الحالة', 'الدفع', 'المجموع الفرعي', 'الخصم', 'التوصيل', 'المجموع', 'المحصَّل', 'المتبقي', 'المدفوع الزائد'],
};
const FILE_NAME = (ext) => new RegExp(`^commandes-\\d{4}-\\d{2}-\\d{2}\\.${ext}$`);
const E = (locale, key, params) => (params ? fmt(locale, `orders.export.${key}`, params) : msg(locale, `orders.export.${key}`));

const dialog = (page, locale) => page.getByRole('dialog', { name: E(locale, 'title') });
const radio = (page, locale, label) => dialog(page, locale).getByRole('radio', { name: label, exact: true });
const formatRadio = (page, locale, format) => radio(page, locale, E(locale, 'format', { format }));
const periodRadio = (page, locale, period) => radio(page, locale, E(locale, 'period', { period }));
// Radio masqué visuellement (`sr-only`) : on clique sur son libellé, comme un utilisateur.
const choose = (input) => input.locator('xpath=..').click();
const stepButton = (page, locale, step) => visibleButton(page, E(locale, `step.${step}`));
const toast = (page, text) => page.locator('[data-sonner-toast]').filter({ hasText: text }).first();
const flat = (text) => text.replace(/\s+/g, ' ').trim();
const exportButton = (page, ctx) => visibleButton(page, ctx.viewport.mobile ? E(ctx.locale, 'button_label') : E(ctx.locale, 'button'));

async function openDialog(page, ctx) {
  await exportButton(page, ctx).click();
  await dialog(page, ctx.locale).waitFor({ state: 'visible' });
  await animationsDone(dialog(page, ctx.locale));
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
}

async function closeDialog(page, ctx) {
  await visibleButton(page, E(ctx.locale, 'cancel')).click();
  await dialog(page, ctx.locale).waitFor({ state: 'hidden' });
}

/** Nombre annoncé dans la fenêtre, comparé au résumé de l'API pour les mêmes paramètres. */
async function rowsShown(page, ctx, query) {
  const expected = (await api(page, `exports/orders/summary/${query ? `?${query}` : ''}`)).rows;
  const text = E(ctx.locale, 'rows', { count: expected });
  const shown = await dialog(page, ctx.locale).getByText(text, { exact: true }).waitFor({ timeout: 8000 }).then(() => true, () => false);
  return { expected, text, shown };
}

/** Bouton de l'en-tête : libellé sur desktop ; icône seule ≥ 44px et aria-label sur mobile. */
async function checkButton(page, ctx) {
  const { label, locale, viewport } = ctx;
  const button = exportButton(page, ctx);
  const box = await button.boundingBox();
  if (viewport.mobile) {
    const text = flat(await button.innerText());
    report.check(box.width >= 44 && box.height >= 44 && text === '',
      `${label} : « ${E(locale, 'button_label')} » en icône seule (${Math.round(box.width)}×${Math.round(box.height)}, texte « ${text} »)`);
  } else {
    report.check(flat(await button.innerText()) === E(locale, 'button'), `${label} : bouton « ${E(locale, 'button')} » avec libellé`);
  }
}

/** Liste filtrée « À encaisser » : sous-titre et nombre repris par la fenêtre. */
async function checkFilteredScope(page, ctx) {
  const { label, locale } = ctx;
  await page.goto(`${BASE}/orders?due=true`);
  await page.waitForLoadState('networkidle');
  await openDialog(page, ctx);
  const scope = E(locale, 'scope_filtered', { filters: msg(locale, 'orders.paymentFilter.due') });
  const described = await dialog(page, locale).getByText(scope, { exact: true }).isVisible();
  const rows = await rowsShown(page, ctx, 'due=true');
  report.check(described && rows.shown, `${label} : liste « À encaisser » → « ${scope} », ${rows.text}`);
  await closeDialog(page, ctx);
}

/** Fenêtre : par le bas sur mobile, sous-titre, format segmenté et description, nombre de lignes. */
async function checkDialog(page, ctx) {
  const { label, locale, viewport } = ctx;
  const box = await dialog(page, locale).boundingBox();
  const placed = viewport.mobile ? Math.abs(box.y + box.height - viewport.height) <= 2 : box.y > 0 && box.y + box.height < viewport.height;
  report.check(placed, `${label} : fenêtre « ${E(locale, 'title')} » ${viewport.mobile ? 'ouverte par le bas' : 'centrée'}`);
  report.check(await dialog(page, locale).getByText(E(locale, 'scope_all'), { exact: true }).isVisible(), `${label} : sous-titre « ${E(locale, 'scope_all')} »`);
  const dir = await page.evaluate(() => getComputedStyle(document.documentElement).direction);
  const [csv, pdf] = await Promise.all(['csv', 'pdf'].map((f) => formatRadio(page, locale, f).locator('xpath=..').boundingBox()));
  const ordered = dir === 'rtl' ? csv.x > pdf.x : csv.x < pdf.x;
  report.check(await formatRadio(page, locale, 'csv').isChecked() && ordered,
    `${label} : format segmenté, CSV choisi, CSV ${dir === 'rtl' ? 'à droite' : 'à gauche'} de PDF (document ${dir})`);
  const hint = E(locale, 'format_hint', { format: 'csv' });
  report.check(await dialog(page, locale).getByText(hint).isVisible(), `${label} : description « ${hint} »`);
  const rows = await rowsShown(page, ctx, '');
  report.check(rows.shown, `${label} : ${rows.text} (résumé de l'API : ${rows.expected})`);
  return rows.expected;
}

/** PDF : description, mention « PDF en français » en arabe seulement. */
async function checkPdfOption(page, ctx) {
  const { label, locale } = ctx;
  await choose(formatRadio(page, locale, 'pdf'));
  const hint = await dialog(page, locale).getByText(E(locale, 'format_hint', { format: 'pdf' })).isVisible();
  const french = await dialog(page, locale).getByText(E(locale, 'pdf_french'), { exact: true }).count();
  report.check(hint && french === (locale === 'ar' ? 1 : 0),
    `${label} : PDF → sa description${locale === 'ar' ? `, « ${E(locale, 'pdf_french')} »` : ', sans mention de langue'}`);
  await choose(formatRadio(page, locale, 'csv'));
}

/** À 360×640 : la fenêtre tient dans l'écran et rien n'y défile, pour chaque format. */
async function checkFits(page, ctx) {
  const { label, locale, viewport } = ctx;
  await page.setViewportSize({ width: 360, height: 640 });
  for (const format of ['csv', 'pdf', 'whatsapp']) {
    await choose(formatRadio(page, locale, format));
    await animationsDone(dialog(page, locale));
    const issue = await dialog(page, locale).evaluate((root) => {
      const box = root.getBoundingClientRect();
      if (box.top < 0 || box.bottom > innerHeight + 1) return `fenêtre ${Math.round(box.top)}→${Math.round(box.bottom)}`;
      const scrolled = [root, ...root.querySelectorAll('*')].find((el) => el.scrollHeight > el.clientHeight + 1
        && /(auto|scroll)/.test(getComputedStyle(el).overflowY));
      return scrolled ? `défile de ${scrolled.scrollHeight - scrolled.clientHeight}px` : '';
    });
    report.check(issue === '', `${label} : 360×640, ${format} → tient sans défiler${issue ? ` (${issue})` : ''}`);
  }
  await choose(formatRadio(page, locale, 'csv'));
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
}

/** Période personnalisée à l'envers : erreur, rien n'est téléchargé ; retour à « Tout ». */
async function checkCustomPeriod(page, ctx) {
  const { label, locale } = ctx;
  await choose(periodRadio(page, locale, 'custom'));
  await dialog(page, locale).getByLabel(E(locale, 'from'), { exact: true }).fill('2026-10-10');
  await dialog(page, locale).getByLabel(E(locale, 'to'), { exact: true }).fill('2026-10-01');
  let downloaded = false;
  const onDownload = () => { downloaded = true; };
  page.on('download', onDownload);
  await stepButton(page, locale, 'download_csv').click();
  const error = await dialog(page, locale).getByText(E(locale, 'dates_order')).isVisible();
  await page.waitForLoadState('networkidle');
  page.off('download', onDownload);
  report.check(error && !downloaded, `${label} : fin avant début → « ${E(locale, 'dates_order')} », rien téléchargé`);
  await choose(periodRadio(page, locale, 'all'));
}

/** Plafond du PDF (résumé simulé) : alerte, action désactivée, « Passer au CSV » choisit le CSV. */
async function checkPdfCap(page, ctx) {
  const { label, locale } = ctx;
  const summary = '**/api/proxy/exports/orders/summary/**';
  await page.route(summary, (route) => route.fulfill({ json: { rows: 1500, pdf_max_rows: 1000 } }));
  await choose(periodRadio(page, locale, 'last_month'));
  await choose(formatRadio(page, locale, 'pdf'));
  const alert = dialog(page, locale).getByRole('alert').filter({ hasText: E(locale, 'pdf_limit', { count: 1500, max: 1000 }) });
  await alert.waitFor({ timeout: 8000 }).catch(() => {});
  const step = ctx.viewport.mobile ? 'prepare_pdf' : 'download_pdf';
  const disabled = await stepButton(page, locale, step).isDisabled();
  await alert.getByRole('button', { name: E(locale, 'use_csv'), exact: true }).click();
  report.check(await alert.count() === 0 && disabled && await formatRadio(page, locale, 'csv').isChecked(),
    `${label} : 1 500 commandes → alerte du plafond, « ${E(locale, `step.${step}`)} » désactivé, « ${E(locale, 'use_csv')} » choisit le CSV`);
  await page.unroute(summary);
  await choose(periodRadio(page, locale, 'all'));
}

/** CSV : nom, BOM, séparateur, en-têtes dans la langue, une ligne par commande. */
async function checkCsv(page, ctx, expected) {
  const { label, locale } = ctx;
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    stepButton(page, locale, 'download_csv').click(),
  ]);
  const name = download.suggestedFilename();
  const raw = await readFile(await download.path(), 'utf8');
  const [header, ...rows] = raw.replace(/^﻿/, '').trim().split(/\r?\n/).map((line) => line.split(';'));
  report.check(FILE_NAME('csv').test(name) && raw.startsWith('﻿') && header.join(';') === COLUMNS[locale].join(';'),
    `${label} : fichier « ${name} », UTF-8 avec BOM, « ; », colonnes ${header.slice(0, 3).join(' | ')}…`);
  report.check(rows.length === expected, `${label} : ${rows.length} ligne(s), comme annoncé (${expected})`);
  report.check(!await dialog(page, locale).isVisible(), `${label} : fenêtre refermée après le téléchargement`);
}


const PDF_URL = '**/api/proxy/exports/orders/pdf/**';
// Réponse finale (la barre oblique finale passe par une redirection 308 de Next.js).
const final = (part) => (response) => new RegExp(`/api/proxy/exports/orders/${part}/?(\\?|$)`).test(response.url())
  && (response.status() < 300 || response.status() >= 400);
const isPdf = final('pdf');
// Le corps d'une réponse lue par fetch n'est pas relu par Playwright : on contrôle les octets reçus.
const binaryPdf = (head, tail) => head === '%PDF' && tail.includes('%%EOF');

/** En-têtes relayés par le proxy : PDF en pièce jointe, aucun en-tête qui porte le jeton. */
async function checkPdfResponse(page, ctx, response) {
  const token = (await page.context().cookies(BASE)).find((c) => c.name === 'access_token')?.value;
  const headers = await response.allHeaders();
  const disposition = headers['content-disposition'] ?? '';
  // Un jeton renouvelé repasse en Set-Cookie HttpOnly : seul en-tête autorisé à le porter.
  const leaked = Object.entries(headers)
    .filter(([name, value]) => name === 'authorization' || (name !== 'set-cookie' && token && value.includes(token)))
    .map(([name]) => name);
  report.check(response.status() === 200 && headers['content-type']?.startsWith('application/pdf')
    && /^attachment;.*commandes-\d{4}-\d{2}-\d{2}\.pdf/.test(disposition) && leaked.length === 0,
  `${ctx.label} : proxy → ${response.status()}, ${headers['content-type']}, « ${disposition} », `
    + `jeton exposé : ${leaked.join(', ') || 'aucun'}`);
}

/** PDF réel : téléchargé sur desktop ; préparé puis partagé (Web Share simulé) sur mobile. */
async function checkPdf(page, ctx) {
  const { label, locale, viewport } = ctx;
  await choose(formatRadio(page, locale, 'pdf'));
  if (!viewport.mobile) {
    const [response, download] = await Promise.all([
      page.waitForResponse(isPdf, { timeout: 15000 }),
      page.waitForEvent('download', { timeout: 15000 }),
      stepButton(page, locale, 'download_pdf').click(),
    ]);
    await checkPdfResponse(page, ctx, response);
    const bytes = await readFile(await download.path());
    const pdf = binaryPdf(bytes.subarray(0, 4).toString('latin1'), bytes.subarray(-1024).toString('latin1'));
    report.check(FILE_NAME('pdf').test(download.suggestedFilename()) && pdf,
      `${label} : PDF téléchargé « ${download.suggestedFilename()} », ${bytes.length} octets intacts (%PDF … %%EOF)`);
  } else {
    const [response] = await Promise.all([
      page.waitForResponse(isPdf, { timeout: 15000 }),
      stepButton(page, locale, 'prepare_pdf').click(),
    ]);
    await checkPdfResponse(page, ctx, response);
    await stepButton(page, locale, 'share_pdf').click();
    const shared = await page.waitForFunction(() => window.__shared, null, { timeout: 5000 }).then((h) => h.jsonValue(), () => null);
    report.check(FILE_NAME('pdf').test(shared?.name ?? '') && shared.type === 'application/pdf' && binaryPdf(shared.head, shared.tail),
      `${label} : « ${E(locale, 'step.prepare_pdf')} » puis « ${E(locale, 'step.share_pdf')} » → fichier partagé ${shared?.name} (${shared?.type}, ${shared?.size} octets)`);
  }
  await dialog(page, locale).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  report.check(!await dialog(page, locale).isVisible(), `${label} : fenêtre refermée après le PDF`);
}

/** Limite de débit (429 simulé) : notification, la fenêtre reste ouverte. */
async function checkThrottled(page, ctx) {
  const { label, locale, viewport } = ctx;
  await page.route(PDF_URL, (route) => route.fulfill({ status: 429, json: { detail: 'throttled' } }));
  await choose(formatRadio(page, locale, 'pdf'));
  await stepButton(page, locale, viewport.mobile ? 'prepare_pdf' : 'download_pdf').click();
  const shown = await toast(page, E(locale, 'errors.throttled')).waitFor({ timeout: 5000 }).then(() => true, () => false);
  report.check(shown && await dialog(page, locale).isVisible(), `${label} : 429 → « ${E(locale, 'errors.throttled')} », fenêtre ouverte`);
  await page.unroute(PDF_URL);
  await closeDialog(page, ctx);
}

/** WhatsApp : message préparé et prévisualisé, copie, puis wa.me avec ce texte. */
async function checkWhatsApp(page, ctx) {
  const { label, locale } = ctx;
  await choose(formatRadio(page, locale, 'whatsapp'));
  const [response] = await Promise.all([
    page.waitForResponse(final('whatsapp'), { timeout: 10000 }),
    stepButton(page, locale, 'prepare_message').click(),
  ]);
  const { text } = await response.json();
  const preview = dialog(page, locale).getByLabel(E(locale, 'preview_label'), { exact: true });
  await preview.waitFor({ timeout: 5000 });
  report.check(flat(await preview.innerText()) === flat(text), `${label} : aperçu = message du serveur (« ${flat(text).slice(0, 50)}… »)`);
  const cancel = await dialog(page, locale).getByRole('button', { name: E(locale, 'cancel'), exact: true }).count();
  report.check(await stepButton(page, locale, 'open_whatsapp').isVisible() && cancel === 0,
    `${label} : pied « ${E(locale, 'copy')} » (texte) + « ${E(locale, 'step.open_whatsapp')} » (plein)`);
  await visibleButton(page, E(locale, 'copy')).click();
  const copied = await toast(page, E(locale, 'copied')).waitFor({ timeout: 5000 }).then(() => true, () => false);
  const clipboard = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  report.check(copied && clipboard === text, `${label} : « ${E(locale, 'copy')} » → « ${E(locale, 'copied')} », presse-papiers = message`);
  const popup = page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null);
  await stepButton(page, locale, 'open_whatsapp').click();
  const opened = await popup;
  const url = opened?.url() ?? '';
  await opened?.close();
  const sent = url.startsWith('https://wa.me/?text=') ? new URL(url).searchParams.get('text') : null;
  report.check(sent === text && !await dialog(page, locale).isVisible(),
    `${label} : « ${E(locale, 'step.open_whatsapp')} » → wa.me avec le message, fenêtre refermée (${url.slice(0, 40)}…)`);
}

/** Web Share niveau 2 simulé (mobile) : le fichier partagé est gardé dans `window.__shared`. */
function fakeShare() {
  window.__shared = null;
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: (data) => !!data?.files?.length });
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: async ({ files: [file] }) => {
      // latin1 : octets bruts, comme le fichier téléchargé.
      const text = async (blob) => new TextDecoder('latin1').decode(await blob.arrayBuffer());
      window.__shared = { name: file.name, type: file.type, size: file.size, head: await text(file.slice(0, 4)), tail: await text(file.slice(-1024)) };
    },
  });
}

// 429 simulé : l'erreur réseau qu'en affiche la console est attendue.
const expectedNoise = (problem) => problem.includes('status of 429') && problem.includes('/api/proxy/exports/orders/pdf');

async function runConfig(page, run, realPdf) {
  await checkFilteredScope(page, run);
  await page.goto(`${BASE}/orders`);
  await page.waitForLoadState('networkidle');
  await checkButton(page, run);
  await openDialog(page, run);
  const expected = await checkDialog(page, run);
  await checkPdfOption(page, run);
  if (run.viewport.mobile) await checkFits(page, run);
  await checkCustomPeriod(page, run);
  await checkPdfCap(page, run);
  await checkCsv(page, run, expected);
  if (realPdf) {
    await openDialog(page, run);
    await checkPdf(page, run);
  }
  await openDialog(page, run);
  await checkThrottled(page, run);
  await openDialog(page, run);
  await checkWhatsApp(page, run);
}

const browser = await launch();
try {
  for (const viewport of VIEWPORTS) {
    const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    await ctx.route('https://wa.me/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>wa</title>' }));
    if (viewport.mobile) await ctx.addInitScript(fakeShare);
    // Rendus PDF limités à 10 par minute et par utilisateur : un PDF réel par taille, le 429 est simulé.
    let realPdf = true;
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
          await runConfig(page, { label, locale, viewport }, realPdf);
        } catch (error) {
          report.check(false, `${label} : parcours interrompu — ${error.message.split('\n')[0]}`);
        }
        realPdf = false;
        const problems = [
          ...watch.problems.slice(before).filter((p) => !expectedNoise(p)),
          ...nested.splice(0).map((n) => `imbriqué : ${n}`),
        ];
        report.check(problems.length === 0, `${label} : console propre, aucun élément imbriqué${problems.map((p) => `\n      ${p}`).join('')}`);
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
report.finish();
