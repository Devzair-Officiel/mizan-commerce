/**
 * Audit de l'export de l'activité d'un client, à 1440px et 360px, en clair et en sombre, en français
 * et en arabe :
 * - puce « Commandes » de la carte Activité, puis « Exporter » : la fenêtre s'ouvre (par le bas à
 *   360px), seules les commandes sont cochées, « 12 derniers mois » est choisi, chaque case montre
 *   son nombre de lignes et le total annoncé est celui des commandes du client ;
 * - période personnalisée avec une fin avant le début : erreur sous la date de fin, rien n'est téléchargé ;
 * - « Télécharger le fichier » : un CSV `activite-audit-export-AAAA-MM-JJ.csv` (UTF-8 avec BOM,
 *   « ; »), en-têtes dans la langue de l'interface, une ligne par commande, autant que annoncé.
 * Client dédié « Audit Export » avec trois commandes du jour (annulées à la fin).
 */
import { readFile } from 'node:fs/promises';
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { nestedInteractive } from './lib/watch.mjs';
import { api, allResults } from './lib/products.mjs';
import { visibleButton } from './lib/form.mjs';

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
const E = (locale, key, params) => (params ? fmt(locale, `customers.export.${key}`, params) : msg(locale, `customers.export.${key}`));

async function setup(page) {
  const found = await allResults(page, `customers/?situation=all&search=${encodeURIComponent(CUSTOMER)}`);
  const customer = found.find((c) => c.display_name === CUSTOMER)
    ?? await api(page, 'customers/', { method: 'POST', data: { name: CUSTOMER } });
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
/** Boîte de la fenêtre une fois l'animation d'ouverture finie (deux mesures identiques). */
async function settledBox(locator) {
  let previous = null;
  for (let i = 0; i < 20; i += 1) {
    const box = await locator.boundingBox();
    if (previous && box && Math.abs(box.y - previous.y) < 0.5 && Math.abs(box.height - previous.height) < 0.5) return box;
    previous = box;
    await locator.page().waitForTimeout(100);
  }
  return previous;
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

// Radio masqué visuellement (`sr-only`) : on clique sur son libellé, comme un utilisateur.
const choose = (input) => input.locator('xpath=..').click();
const flat = (text) => text.replace(/\s+/g, ' ').trim();

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
  await page.waitForTimeout(300);
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

const browser = await launch();
for (const viewport of VIEWPORTS) {
  const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
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
        await openExport(page, run, customer);
        await checkDialog(page, run, expected);
        await checkCustomPeriod(page, run);
        await checkDownload(page, run, expected);
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
await browser.close();
report.finish();
