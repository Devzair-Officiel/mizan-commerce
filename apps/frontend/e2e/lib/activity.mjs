/**
 * « Votre activité » d'un abonné Stripe, pour audit-subscription : usage face aux limites réelles de la
 * formule (Boutique : équipe 2 sur 4, ventes, articles et clients « Illimité » ; Solo : tout illimité,
 * sans carte « équipe »), sans barre ni couleur d'alerte pour l'illimité, sans « Plafonds Découverte » ni
 * « Si vous résiliez » ; résiliation programmée : bloc « Après le … » face aux plafonds de Découverte.
 * Réponses simulées par lib/billing.mjs : aucun appel à Stripe.
 */
import { BASE } from './session.mjs';
import { fmt, msg } from './messages.mjs';
import { SOLO_MODE } from './billing.mjs';

const UNLIMITED = 'orders_this_month:unlimited,products:unlimited,customers:unlimited';
const SITUATIONS = [
  { name: 'Boutique', mode: 'monthly', members: 2, cancelAtEnd: false, gauges: `${UNLIMITED},members:ok` },
  { name: 'Boutique résiliation programmée', mode: 'monthly', members: 2, cancelAtEnd: true, gauges: `${UNLIMITED},members:ok` },
  { name: 'Solo', mode: SOLO_MODE, members: 1, cancelAtEnd: false, gauges: UNLIMITED },
];
/** Usage d'audit-subscription (12 ventes, 3 articles, 15 clients) face à Découverte, équipe de 2 sur 1. */
const AFTER_FREE = 'orders_this_month:near,products:ok,customers:reached,members:reached';

const levels = (zone) => zone.locator('[data-usage]').evaluateAll((els) => els.map((el) => `${el.dataset.usage}:${el.dataset.level}`).join(','));

/** Une rangée sur desktop, deux colonnes sur mobile. */
async function rowsOf(zone) {
  const tops = await zone.locator('[data-usage]').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  return [...new Set(tops)].map((top) => tops.filter((t) => t === top).length).join('+');
}

async function checkReal(page, report, locale, label, situation, mobile) {
  const activity = page.locator('[data-activity]');
  const text = await activity.textContent();
  const unlimited = msg(locale, 'settings.usage.unlimited');
  const gauges = await levels(activity);
  const cards = await activity.locator('[data-level=unlimited]').evaluateAll((els) => els.map((el) => ({
    text: el.textContent, bar: el.querySelector('[role=progressbar]') !== null,
    alert: [...el.querySelectorAll('*')].some((node) => /\b(text|bg)-(red|amber)-/.test(node.getAttribute('class') ?? '')),
  })));
  const plain = cards.length === 3 && cards.every((card) => card.text.includes(unlimited) && !card.bar && !card.alert);
  const team = situation.members > 1 ? await activity.locator('[data-usage=members]').textContent() : '';
  const teamOk = situation.members === 1 || (team.includes('2') && team.includes('/ 4') && team.includes(fmt(locale, 'settings.usage.level', { level: 'ok' })));
  const noFree = !text.includes(msg(locale, 'settings.subscription.activity_limits'))
    && !text.includes(fmt(locale, 'settings.subscription.activity_after', { status: 'paid' }).split(/[:：]/)[0]);
  report.check(await activity.getAttribute('data-activity') === 'plan' && gauges === situation.gauges && plain && teamOk && noFree,
    `${label} : « Votre activité » face aux limites de la formule, « ${unlimited} » sans barre ni alerte`
      + `${situation.members > 1 ? ', équipe 2 / 4' : ', sans carte « équipe »'}, sans plafonds Découverte (${gauges})`);
  const rows = await rowsOf(activity);
  const expected = situation.members > 1 ? (mobile ? '2+2' : '4') : (mobile ? '2+1' : '3');
  report.check(rows === expected, `${label} : cartes d'activité ${mobile ? 'sur deux colonnes' : 'en une rangée'} (${rows})`);
}

async function checkAfter(page, report, locale, label, situation) {
  const after = page.locator('[data-activity-after]');
  if (!situation.cancelAtEnd) {
    report.check(await after.count() === 0, `${label} : pas de bloc « Après le … » sans résiliation programmée`);
    return;
  }
  const heading = (await after.getByRole('heading').textContent()) ?? '';
  const prefix = fmt(locale, 'settings.subscription.activity_after_date', { date: '' }).trim();
  const free = msg(locale, 'settings.subscription.plans.free.name');
  const text = await after.textContent();
  const gauges = await levels(after);
  report.check(await after.getAttribute('data-activity-after') === 'free' && heading.startsWith(prefix) && heading.length > prefix.length + 4
    && text.includes(fmt(locale, 'settings.subscription.activity_after_date_text', { plan: free })) && gauges === AFTER_FREE,
  `${label} : bloc « ${heading} » face aux plafonds Découverte, équipe de 2 au-delà (${gauges})`);
}

/** Les trois situations une à une ; `state.members` et `cancelAtEnd` rendus ensuite. */
export async function auditPaidActivity(page, report, locale, prefix, state, watch, mobile) {
  const members = state.members;
  for (const situation of SITUATIONS) {
    const label = `${prefix} activité ${situation.name}`;
    console.log(`\n=== ${label}`);
    watch.setLabel(label);
    Object.assign(state, { mode: situation.mode, members: situation.members, cancelAtEnd: situation.cancelAtEnd, afterRefresh: null, posts: [] });
    try {
      await page.goto(`${BASE}/settings/subscription`);
      await page.waitForLoadState('networkidle');
      await page.locator('[data-activity]').waitFor({ timeout: 10000 });
      if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/abonnement-${label.replaceAll(' ', '-')}.png`, fullPage: true });
      await checkReal(page, report, locale, label, situation, mobile);
      await checkAfter(page, report, locale, label, situation);
      const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
      report.check(overflow <= 0, `${label} : pas de défilement horizontal (${overflow})`);
    } catch (error) {
      report.check(false, `${label} : interrompu — ${error.message.split('\n')[0]}`);
    }
  }
  Object.assign(state, { members, cancelAtEnd: false });
}
