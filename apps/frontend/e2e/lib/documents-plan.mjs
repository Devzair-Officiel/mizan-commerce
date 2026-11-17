/**
 * Devis et avoirs selon la formule (URS-111, URS-112), formule réécrite dans `/subscriptions/current/`
 * comme le reste de l'audit subscription. Le backend garde la formule réelle de la boutique d'audit :
 * son refus en Découverte (lecture libre, écriture 403) est couvert par `apps/quotes/test_gating.py`
 * et `apps/invoices/test_credit_note_gating.py`.
 * - Découverte : liste des devis et détail d'un devis envoyé lisibles ; « Nouveau devis » ouvre la carte
 *   Solo sans quitter la liste ; /quotes/new affiche la carte à la place de l'éditeur ; « Marquer accepté »
 *   ouvre la carte ; aucune écriture envoyée. Les avoirs n'y sont pas vérifiés : les factures restent
 *   réservées à Solo, lecture comprise.
 * - Solo et essai Boutique : « Nouveau devis » ouvre l'éditeur ; « Marquer accepté » ouvre sa feuille ;
 *   « Créer un avoir » ouvre la feuille d'avoir. Les feuilles sont refermées : rien n'est accepté ni crédité.
 */
import { BASE } from './session.mjs';
import { fmt, msg } from './messages.mjs';
import { api } from './products.mjs';
import { animationsDone } from './wait.mjs';

const LINE = { description: 'Pose de tringle', unit: 'forfait', quantity: '1', unit_price_ht: '60.00' };
const visible = (locator) => locator.filter({ visible: true });
const MODES = { free: 'Découverte', paid: 'Solo', trial: 'essai Boutique' };

/** Brouillon émis ou envoyé, avertissements de la vérification acquittés. */
async function finish(page, doc, draft, action) {
  const { issues } = await api(page, `${doc}/${draft.id}/compliance/`);
  return api(page, `${doc}/${draft.id}/${action}/`, { method: 'POST', data: { acknowledged_warnings: issues.map((i) => i.code) } });
}

/** Un devis envoyé et une facture émise pas entièrement créditée : repris s'ils existent (audit relançable), sinon créés. */
export async function documentsForPlan(page) {
  const [marc] = (await api(page, 'customers/?search=Marc%20Dupuis')).results;
  let quote = (await api(page, 'quotes/')).results.find((q) => q.status === 'sent');
  if (!quote) {
    const draft = await api(page, 'quotes/drafts/', { method: 'POST', data: { customer: marc.id, lines: [LINE] } });
    quote = await finish(page, 'quotes', draft, 'send');
  }
  const issued = (await api(page, 'invoices/')).results.filter((i) => i.kind === 'invoice' && i.status === 'issued');
  let invoice = null;
  for (const row of issued) {
    const detail = await api(page, `invoices/${row.id}/`);
    if (!detail.fully_credited) { invoice = detail; break; }
  }
  if (!invoice) {
    const draft = await api(page, 'invoices/drafts/', { method: 'POST', data: { customer: marc.id, payment_terms_days: 30, lines: [LINE] } });
    invoice = await finish(page, 'invoices', draft, 'issue');
  }
  return { quote, invoice };
}

async function goto(page, path) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
}

/** Fenêtre ouverte par le geste, refermée à Échap ; renvoie son texte. */
async function sheetText(page, title) {
  const sheet = page.getByRole('dialog', { name: title, exact: true });
  await sheet.waitFor();
  await animationsDone(sheet);
  const text = await sheet.innerText();
  await page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  return text;
}

const upgrade = (locale, feature) => [
  fmt(locale, 'settings.upgrade.title', { feature, plan: 'solo', kind: 'products' }),
  fmt(locale, 'settings.upgrade.text', { feature, plan: 'solo', kind: 'products' }),
];

/** Liste des devis et « Nouveau devis » : carte Solo sur place en Découverte, éditeur sinon. */
async function checkCreate(page, report, locale, label, locked) {
  await goto(page, '/quotes');
  const create = msg(locale, 'quotes.create');
  await visible(page.getByRole('link', { name: create, exact: true })).click();
  if (locked) {
    const text = await sheetText(page, create);
    report.check(upgrade(locale, 'quotes').every((line) => text.includes(line)) && new URL(page.url()).pathname === '/quotes',
      `${label} : « ${create} » ouvre la carte « ${upgrade(locale, 'quotes')[0]} », la liste reste affichée`);
    return;
  }
  const send = visible(page.getByRole('button', { name: fmt(locale, 'invoices.editor.summary.issue', { doc: 'quote' }), exact: true }));
  await send.first().waitFor();
  report.check(new URL(page.url()).pathname === '/quotes/new', `${label} : « ${create} » ouvre l'éditeur du devis`);
}

/** /quotes/new ouverte directement : la carte remplace l'éditeur en Découverte. */
async function checkEditorGate(page, report, locale, label) {
  await goto(page, '/quotes/new');
  const [title, text] = upgrade(locale, 'quotes');
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  const body = await page.locator('main').innerText();
  const send = fmt(locale, 'invoices.editor.summary.issue', { doc: 'quote' });
  report.check(body.includes(text) && await visible(page.getByRole('button', { name: send, exact: true })).count() === 0,
    `${label} : /quotes/new, la carte Solo à la place de l'éditeur`);
}

/** Détail d'un devis envoyé, lisible ; « Marquer accepté » : la carte en Découverte, sa feuille sinon. */
async function checkQuoteDetail(page, report, locale, label, quote, locked) {
  await goto(page, `/quotes/${quote.id}`);
  const accept = msg(locale, 'quotes.actions.accept');
  const button = visible(page.getByRole('button', { name: accept, exact: true })).first();
  await button.waitFor();
  const readable = (await page.locator('main').innerText()).includes(quote.number);
  await button.click();
  const text = await sheetText(page, locked ? accept : msg(locale, 'quotes.accept.title'));
  const ok = locked ? upgrade(locale, 'quotes').every((line) => text.includes(line)) : !text.includes(upgrade(locale, 'quotes')[0]);
  report.check(readable && ok, `${label} : devis ${quote.number} consultable, « ${accept} » ouvre ${locked ? 'la carte Solo' : 'la feuille d\'accord'}`);
}

/** « Créer un avoir » depuis le menu de la facture : la feuille d'avoir, refermée sans rien émettre. */
async function checkCredit(page, report, locale, label, invoice) {
  await goto(page, `/invoices/${invoice.id}`);
  const mobile = page.viewportSize().width < 1024;
  const open = msg(locale, 'invoices.credit.open');
  await visible(page.getByRole('button', { name: msg(locale, 'ui.detail.more_actions'), exact: true })).click();
  await page.getByRole(mobile ? 'button' : 'menuitem', { name: open, exact: true }).click();
  const text = await sheetText(page, msg(locale, 'invoices.credit.title'));
  report.check(text.includes(fmt(locale, 'invoices.credit.description', { number: invoice.number })) && !text.includes(upgrade(locale, 'credit_notes')[0]),
    `${label} : « ${open} » ouvre la feuille d'avoir de ${invoice.number}`);
}

/** Les trois formules une à une ; aucune écriture de devis ou de facture en Découverte. */
export async function auditDocumentsPlan(page, report, locale, prefix, state, watch, documents) {
  const mode = state.mode;
  const writes = [];
  const listen = (r) => {
    const path = new URL(r.url()).pathname;
    if (r.method() !== 'GET' && /^\/api\/proxy\/(quotes|invoices)\//.test(path)) writes.push(`${r.method()} ${path}`);
  };
  page.on('request', listen);
  try {
    for (const situation of ['free', 'paid', 'trial']) {
      const label = `${prefix} documents ${MODES[situation]}`;
      console.log(`\n=== ${label}`);
      watch.setLabel(label);
      state.mode = situation;
      writes.length = 0;
      try {
        const locked = situation === 'free';
        await checkCreate(page, report, locale, label, locked);
        if (locked) await checkEditorGate(page, report, locale, label);
        await checkQuoteDetail(page, report, locale, label, documents.quote, locked);
        if (!locked) await checkCredit(page, report, locale, label, documents.invoice);
        const allowed = writes.filter((w) => !locked && /\/credit-notes\/preview\/?$/.test(w));
        report.check(writes.length === allowed.length, `${label} : aucune écriture de devis ni de facture${writes.map((w) => `\n      ${w}`).join('')}`);
      } catch (error) {
        report.check(false, `${label} : interrompu — ${error.message.split('\n')[0]}`);
      }
    }
  } finally {
    page.off('request', listen);
    state.mode = mode;
  }
}
