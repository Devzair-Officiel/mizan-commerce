/**
 * Audit des messages WhatsApp, à 1440px et 360px, en clair et en sombre, en français et en arabe :
 * chaque bouton qui ouvre WhatsApp avec un texte préparé dans Mizan (carte Client et « Relancer » de la
 * fiche commande, « Relancer » de l'accueil, carte Contact de la fiche client) ouvre wa.me avec ce
 * texte, et le message est enregistré comme envoyé : il apparaît aussitôt, sans recharger, dans
 * l'historique de la fiche commande (messages de la commande) et de la fiche client (tous ses messages).
 * Client dédié « Audit WhatsApp » ; ses messages sont supprimés au début de chaque passage.
 */
import { BASE, VIEWPORTS, createReport, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { nestedInteractive } from './lib/watch.mjs';
import { api, allResults } from './lib/products.mjs';
import { visibleButton } from './lib/form.mjs';

const report = createReport();
const nested = [];
const CUSTOMER = 'Audit WhatsApp';
const PHONE = '+33612345678';

async function goto(page, path) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
}

/** Client dédié (créé au premier passage) et une commande impayée à son nom. */
async function setup(page) {
  const found = await allResults(page, `customers/?situation=all&search=${encodeURIComponent(CUSTOMER)}`);
  const customer = found.find((c) => c.display_name === CUSTOMER)
    ?? await api(page, 'customers/', { method: 'POST', data: { name: CUSTOMER, phone: PHONE } });
  const order = await api(page, 'orders/', {
    method: 'POST',
    data: { customer: customer.id, items: [{ product_name: 'Audit WhatsApp', quantity: 1, unit_price: '12.00' }] },
  });
  return { customer, order };
}

async function cleanup(page, customer) {
  for (const m of await allResults(page, `messages/prepared/?customer=${customer.id}`)) {
    await api(page, `messages/prepared/${m.id}/`, { method: 'DELETE' });
  }
}

/** Messages enregistrés comme envoyés, relus jusqu'à en trouver `count` (8 s au plus). */
async function sentMessages(page, filter, count) {
  let sent = [];
  for (let i = 0; i < 16; i += 1) {
    sent = (await allResults(page, `messages/prepared/?${filter}`)).filter((m) => m.status === 'sent_manually' && m.sent_manually_at);
    if (sent.length >= count) break;
    await page.waitForTimeout(500);
  }
  return sent;
}

/** Ouvre la fenêtre d'envoi avec `opener`, l'envoie, renvoie le texte préparé et l'adresse ouverte. */
async function send(page, locale, opener) {
  await opener.first().click();
  const text = await page.getByRole('textbox', { name: msg(locale, 'messages.prepared.message_label') }).inputValue();
  const popup = page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null);
  await visibleButton(page, msg(locale, 'messages.prepared.send_cta')).click();
  const opened = await popup;
  const url = opened?.url() ?? '';
  await opened?.close();
  return { text, url };
}

/** Badges « Envoyé » visibles dans l'historique de la page, relus jusqu'à en trouver `count`. */
async function historyShows(page, locale, count) {
  const badges = page.getByText(msg(locale, 'messages.history.status_sent_manually'), { exact: true }).filter({ visible: true });
  for (let i = 0; i < 16; i += 1) {
    if (await badges.count() === count) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

const opensWhatsApp = ({ text, url }) => text.trim().length > 0 && url.startsWith(`https://wa.me/${PHONE.slice(1)}?text=`);

async function checkOrderSheet(page, ctx, { order }) {
  const { label, locale } = ctx;
  await goto(page, `/orders/${order.id}`);
  const card = await send(page, locale, visibleButton(page, msg(locale, 'orders.customerCard.whatsapp')));
  report.check(opensWhatsApp(card) && (await sentMessages(page, `order=${order.id}`, 1)).length === 1 && await historyShows(page, locale, 1),
    `${label} : commande, carte Client « WhatsApp » → wa.me avec le texte, message envoyé dans l'historique de la commande`);
  const remind = await send(page, locale, visibleButton(page, msg(locale, 'orders.paymentCard.remind_cta')));
  report.check(opensWhatsApp(remind) && (await sentMessages(page, `order=${order.id}`, 2)).length === 2 && await historyShows(page, locale, 2),
    `${label} : commande, « Relancer » → message enregistré, historique de la commande à 2`);
}

/** L'accueil montre les 5 impayés les plus anciens : la commande d'audit est placée en tête (une seule fois). */
async function checkDashboard(page, ctx, { customer, order }) {
  const { label, locale, viewport } = ctx;
  const row = {
    id: order.id, order_number: order.order_number, total_amount: order.total_amount, payment_status: 'unpaid',
    created_at: order.created_at, customer_name: customer.display_name, customer_id: customer.id,
    customer_phone: PHONE, amount_paid: order.amount_paid, amount_due: order.total_amount,
  };
  const pattern = /\/api\/proxy\/dashboard\/today\/?(\?.*)?$/;
  await page.route(pattern, async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const unpaid = data.unpaid_orders;
    await route.fulfill({ response, json: { ...data, unpaid_orders: { ...unpaid, count: Math.max(unpaid.count, 1), items: [row, ...unpaid.items.filter((o) => o.id !== row.id)] } } });
  });
  await goto(page, '/dashboard');
  const opener = viewport.mobile
    ? page.getByRole('button', { name: fmt(locale, 'dashboard.unpaid.relancer_aria', { name: customer.display_name }), exact: true }).filter({ visible: true })
    : visibleButton(page, msg(locale, 'dashboard.unpaid.relancer'));
  const sent = await send(page, locale, opener);
  await page.unroute(pattern);
  report.check(opensWhatsApp(sent) && sent.text.includes(order.order_number) && (await sentMessages(page, `order=${order.id}`, 3)).length === 3,
    `${label} : accueil, « Relancer » → relance préparée (commande ${order.order_number}), enregistrée sur la commande`);
}

async function checkCustomerSheet(page, ctx, { customer }) {
  const { label, locale } = ctx;
  await goto(page, `/customers/${customer.id}`);
  report.check(await historyShows(page, locale, 3), `${label} : fiche client, l'historique montre les messages de ses commandes (3)`);
  const contact = await send(page, locale, visibleButton(page, msg(locale, 'customers.detail.whatsapp')));
  report.check(opensWhatsApp(contact) && (await sentMessages(page, `customer=${customer.id}`, 4)).length === 4 && await historyShows(page, locale, 4),
    `${label} : fiche client, carte Contact « WhatsApp » → message enregistré, historique du client à 4`);
}

const browser = await launch();
for (const viewport of VIEWPORTS) {
  const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
  // WhatsApp n'est pas joint : la fenêtre ouverte reçoit une page vide.
  await ctx.route('https://wa.me/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>wa</title>' }));
  const data = await setup(page);
  for (const locale of ['fr', 'ar']) {
    for (const theme of ['light', 'dark']) {
      const label = `${viewport.name}px ${locale} ${theme === 'dark' ? 'sombre' : 'clair'}`;
      console.log(`\n=== ${label}`);
      await setLocale(locale);
      setTheme(theme);
      watch.setLabel(label);
      const before = watch.problems.length;
      const run = { label, locale, viewport };
      try {
        await cleanup(page, data.customer);
        await checkOrderSheet(page, run, data);
        await checkDashboard(page, run, data);
        await checkCustomerSheet(page, run, data);
      } catch (error) {
        report.check(false, `${label} : parcours interrompu — ${error.message.split('\n')[0]}`);
      }
      const problems = [...watch.problems.slice(before), ...nested.splice(0).map((n) => `imbriqué : ${n}`)];
      report.check(problems.length === 0, `${label} : console propre, aucun élément imbriqué${problems.map((p) => `\n      ${p}`).join('')}`);
    }
  }
  await cleanup(page, data.customer);
  await api(page, `orders/${data.order.id}/status/`, { method: 'POST', data: { status: 'cancelled' } });
  await ctx.close();
}
await browser.close();
report.finish();
