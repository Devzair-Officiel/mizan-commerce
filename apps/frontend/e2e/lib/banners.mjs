/**
 * Bandeaux globaux d'abonnement (lot 5b), pour audit-subscription, sur l'accueil :
 * - paiement échoué : propriétaire (bouton du portail, vers billing.stripe.com), admin (« Contactez le
 *   propriétaire », sans bouton), rien pour un employé ni sur la page Abonnement ;
 * - essai à 20 h de sa fin : date et heure, « Choisir une formule », masqué pour la session (rechargement
 *   compris), de retour si la fin change ; rien à 3 jours de la fin ;
 * jamais deux bandeaux à la fois, pas de défilement horizontal, cibles ≥ 44 px. Le rôle vient de la réponse
 * `/auth/me/` réécrite (`state.role`), l'abonnement de lib/billing.mjs : aucun appel à Stripe.
 */
import { BASE } from './session.mjs';
import { fmt, msg } from './messages.mjs';
import { checkLayout, shot } from './billing.mjs';

const HOUR = 60 * 60 * 1000;
const B = (key) => `layout.billing.${key}`;
const BANNER = '[data-billing-banner]';

/**
 * Rôle simulé (`state.role` : admin ou staff) dans `/auth/me/`, thème `state.theme` repris : enregistrée
 * après `openSession`, cette route passe avant la sienne. Sans rôle simulé, elle lui laisse la main.
 */
export async function routeRole(ctx, state) {
  await ctx.route(/\/api\/proxy\/auth\/me\/?(\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET' || !state.role) return route.fallback();
    try {
      const response = await route.fetch();
      const me = await response.json();
      const membership = { ...me.membership, role: state.role, is_admin: state.role !== 'staff', permissions: ['dashboard'] };
      await route.fulfill({ response, json: { ...me, theme_mode: state.theme, membership } });
    } catch {
      // Contexte fermé pendant la requête (fin d'audit) : plus personne ne l'attend.
    }
  });
}

/** Page chargée une fois l'abonnement reçu (le bandeau en dépend), bandeaux affichés relevés. */
async function open(page, path = '/dashboard') {
  await Promise.all([page.waitForResponse(/\/api\/proxy\/subscriptions\/current\/?/), page.goto(`${BASE}${path}`)]);
  await page.waitForLoadState('networkidle');
  return page.locator(BANNER).evaluateAll((els) => els.map((el) => `${el.dataset.billingBanner}${el.dataset.bannerFor ? `:${el.dataset.bannerFor}` : ''}`).join());
}

/** Texte d'un message coupé à ses valeurs formatées par le navigateur (date, heure). */
const parts = (locale, key, params) => fmt(locale, key, params).split('§');

/** Impayé : propriétaire (portail), admin (renvoyé au propriétaire), employé et page Abonnement sans bandeau. */
async function checkPastDue(page, report, locale, label, state) {
  Object.assign(state, { mode: 'past_due', role: null, posts: [] });
  const owner = await open(page);
  const banner = page.locator(BANNER);
  const [head] = parts(locale, B('past_due'), { dated: 'yes', date: '§' });
  const ownerText = await banner.textContent();
  const buttons = (await banner.getByRole('button').allTextContents()).map((s) => s.trim());
  report.check(owner === 'past_due:owner' && ownerText.startsWith(head) && buttons.join('|') === msg(locale, B('past_due_cta')),
    `${label} : impayé, bandeau du propriétaire « ${head}… », bouton « ${buttons.join(' | ')} » (${owner})`);
  await checkLayout(page, report, `${label} impayé`, BANNER);
  await shot(page, label, '-banner-past-due');
  await Promise.all([page.waitForURL(/^https:\/\/billing\.stripe\.com\//), banner.getByRole('button').click()]);
  report.check(state.posts.join() === 'portal', `${label} : « ${msg(locale, B('past_due_cta'))} » mène à billing.stripe.com`);
  const onSubscription = await open(page, '/settings/subscription');
  report.check(onSubscription === '', `${label} : pas de bandeau sur la page Abonnement (« Votre formule » le dit déjà)`);
  Object.assign(state, { mode: 'past_due_member', role: 'admin' });
  const admin = await open(page);
  const adminText = await banner.textContent();
  report.check(admin === 'past_due:admin' && adminText.includes(msg(locale, B('past_due_admin'))) && await banner.getByRole('button').count() === 0,
    `${label} : impayé, admin « ${msg(locale, B('past_due_admin'))} », sans bouton (${admin})`);
  await checkLayout(page, report, `${label} impayé admin`, BANNER);
  state.role = 'staff';
  const staff = await open(page);
  report.check(staff === '', `${label} : impayé, rien pour un employé`);
}

/** Essai à 20 h de sa fin : bandeau, masqué pour la session, de retour si la fin change ; rien à 3 jours. */
async function checkTrialEnd(page, report, locale, label, state) {
  Object.assign(state, { mode: 'trial', role: null, trialEndsAt: new Date(Date.now() + 3 * 24 * HOUR).toISOString() });
  const far = await open(page);
  state.trialEndsAt = new Date(Date.now() + 20 * HOUR).toISOString();
  const near = await open(page);
  const banner = page.locator(BANNER);
  const [head] = parts(locale, B('trial_end'), { date: '§', time: '§' });
  const link = banner.getByRole('link', { name: msg(locale, B('trial_end_cta')), exact: true });
  report.check(far === '' && near === 'trial_end' && (await banner.textContent()).startsWith(head)
    && await link.getAttribute('href') === '/settings/subscription',
  `${label} : essai à 20 h de sa fin, « ${head}… », « ${msg(locale, B('trial_end_cta'))} » (rien à 3 jours : ${far || 'aucun'})`);
  await checkLayout(page, report, `${label} fin d'essai`, BANNER);
  await shot(page, label, '-banner-trial-end');
  await banner.getByRole('button', { name: msg(locale, B('dismiss')), exact: true }).click();
  await banner.waitFor({ state: 'hidden' });
  const reloaded = await open(page);
  state.trialEndsAt = new Date(Date.now() + 19 * HOUR).toISOString();
  const moved = await open(page);
  const onSubscription = await open(page, '/settings/subscription');
  report.check(reloaded === '' && moved === 'trial_end' && onSubscription === '',
    `${label} : « ${msg(locale, B('dismiss'))} » le masque (rechargement compris), une nouvelle fin d'essai le rappelle, absent de la page Abonnement`);
}

/** Les deux bandeaux, un rôle à la fois ; `state` rendu ensuite (propriétaire, sans fin d'essai). */
export async function auditBanners(page, report, locale, prefix, state, watch) {
  for (const [name, run] of [['impayé', checkPastDue], ["fin d'essai", checkTrialEnd]]) {
    const label = `${prefix} bandeau ${name}`;
    console.log(`\n=== ${label}`);
    watch.setLabel(label);
    try {
      await run(page, report, locale, label, state);
    } catch (error) {
      report.check(false, `${label} : interrompu — ${error.message.split('\n')[0]}`);
    }
  }
  Object.assign(state, { role: null, trialEndsAt: null, mode: 'trial' });
}
