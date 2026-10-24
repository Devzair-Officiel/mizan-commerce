/**
 * Paiement en ligne de la page Abonnement (lot 5a), pour audit-subscription. Tout est simulé :
 * `/subscriptions/current/` réécrit (champs de facturation, abonnement Stripe), POST checkout,
 * portal, cancel, resume et refresh répondus par `ctx.route` sans atteindre le serveur, pages
 * Stripe remplacées par une page factice. Aucun appel à Stripe, rien n'est enregistré.
 */
import { BASE } from './session.mjs';
import { fmt, msg } from './messages.mjs';
import { animationsDone } from './wait.mjs';

const DAY = 24 * 60 * 60 * 1000;
export const CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_audit';
const PORTAL_URL = 'https://billing.stripe.com/p/session/test_audit';
/** Hôte qui commence comme celui de Stripe : la redirection doit le refuser. */
export const FOREIGN_URL = 'https://checkout.stripe.com.evil.example/c/pay/cs_test_audit';
/** Abonnements Stripe audités ; `member` : membre non propriétaire (`can_manage` faux). */
export const STRIPE_MODES = ['monthly', 'yearly', 'past_due', 'past_due_member', 'member'];
/** Abonnement Stripe Solo, audité pour « Votre activité » seulement (lib/activity.mjs). */
export const SOLO_MODE = 'solo_monthly';
/** Limites de la grille (`seed_plans`) des formules payantes : absente = illimitée. */
const LIMITS = { solo: { members: 1 }, boutique: { members: 4 } };

/** Paiement ouvert (`billing_enabled` forcé : il peut être faux en dev), propriétaire, sans Stripe. */
const DEFAULTS = {
  billing_enabled: true, can_manage: true, stripe_managed: false, has_billing_customer: false, billing_interval: '',
  past_due_since: null, grace_ends_at: null, trial_ends_at: null, scheduled_change: null,
};

/** Champs de facturation de la réponse `/subscriptions/current/` pour `state.mode`. */
export function billing(base, state) {
  if (!STRIPE_MODES.includes(state.mode) && state.mode !== SOLO_MODE) return { ...base, ...DEFAULTS };
  const now = Date.now();
  const pastDue = state.mode.startsWith('past_due');
  const code = state.mode === SOLO_MODE ? 'solo' : 'boutique';
  const usage = Object.fromEntries(Object.entries(base.usage).map(([key, { count }]) => [key, { count, limit: LIMITS[code][key] ?? null }]));
  return {
    ...base, ...DEFAULTS, status: pastDue ? 'past_due' : 'active', effective_plan_code: code, usage,
    plan: { ...base.plan, code }, stripe_managed: true, has_billing_customer: true,
    billing_interval: state.mode === 'yearly' ? 'year' : 'month', can_manage: !state.mode.endsWith('member'),
    current_period_start: new Date(now - 10 * DAY).toISOString(), current_period_end: new Date(now + 20 * DAY).toISOString(),
    days_remaining: null, cancel_at_period_end: state.cancelAtEnd,
    past_due_since: pastDue ? new Date(now - 3 * DAY).toISOString() : null,
    grace_ends_at: pastDue ? new Date(now + 12 * DAY).toISOString() : null,
  };
}

/** Réponses simulées des POST de facturation ; `change` ne doit jamais partir (lot 5b). */
const ACTIONS = {
  checkout: (state) => ({ url: state.checkoutUrl }),
  portal: () => ({ url: PORTAL_URL }),
  cancel: (state) => { state.cancelAtEnd = true; return {}; },
  resume: (state) => { state.cancelAtEnd = false; return {}; },
  refresh: (state) => { state.mode = state.afterRefresh ?? state.mode; return {}; },
};

/**
 * POST de facturation simulés et notés dans `state.posts` (`action corps`), retenus tant que
 * `state.hold` est posé ; pages Stripe factices ; tout autre hôte noté dans `state.foreign` et coupé.
 */
export async function routeBilling(ctx, state) {
  await ctx.route(/\/api\/proxy\/subscriptions\/(checkout|portal|cancel|resume|refresh|change)\/?$/, async (route) => {
    const request = route.request();
    const action = new URL(request.url()).pathname.split('/').filter(Boolean).at(-1);
    state.posts.push(`${action}${request.postData() ? ` ${request.postData()}` : ''}`);
    try {
      if (state.hold) await state.hold.promise;
      const answer = ACTIONS[action];
      await route.fulfill(answer ? { json: answer(state) } : { status: 400, json: { detail: 'audit', code: 'no_change' } });
    } catch {
      // Contexte fermé pendant la requête (fin d'audit) : plus personne ne l'attend.
    }
  });
  await ctx.route(/^https:\/\/(checkout|billing)\.stripe\.com\//, (route) => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html lang="fr"><title>Stripe (audit)</title><p>Stripe</p></html>',
  }));
  await ctx.route(/evil\.example/, (route) => { state.foreign.push(route.request().url()); return route.abort(); });
}

/** Retient les POST de facturation jusqu'à l'appel de la fonction renvoyée. */
function hold(state) {
  let release;
  state.hold = { promise: new Promise((resolve) => { release = resolve; }) };
  return () => { state.hold = null; release(); };
}

async function load(page, query = '') {
  await page.goto(`${BASE}/settings/subscription${query}`);
  await page.waitForLoadState('networkidle');
  await page.locator('[data-current-plan]').waitFor({ timeout: 10000 });
}

/** Pas de défilement horizontal ; cibles des zones de paiement d'au moins 44 px. */
async function checkLayout(page, report, label) {
  const { overflow, small } = await page.evaluate(() => ({
    overflow: document.scrollingElement.scrollWidth - innerWidth,
    small: [...document.querySelectorAll('[data-current-plan], [data-cancel-plan], [data-checkout-summary], [data-checkout-return]')]
      .flatMap((zone) => [...zone.querySelectorAll('button, a')])
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => [el.textContent.trim(), el.getBoundingClientRect()])
      .filter(([, r]) => r.height < 44 || r.width < 44)
      .map(([text, r]) => `${text} ${Math.round(r.width)}×${Math.round(r.height)}`),
  }));
  report.check(overflow <= 0 && small.length === 0,
    `${label} : pas de défilement horizontal (${overflow}), cibles ≥ 44 px${small.length ? ` (✗ ${small.join(' | ')})` : ''}`);
}

/** Texte d'un message avant sa date ou son montant (formatés par le navigateur). */
const before = (locale, key, params = {}) => fmt(locale, key, { ...params, date: '§', amount: '§' }).split('§')[0];

/** Attribut du premier élément, null s'il n'y en a pas (sans attendre qu'il apparaisse). */
const attr = (locator, name) => locator.evaluateAll((els, n) => els[0]?.getAttribute(n) ?? null, name);

const shot = (page, label, suffix = '') => process.env.SHOTS
  && page.screenshot({ path: `${process.env.SHOTS}/abonnement-${label.replace('px', '').replaceAll(' ', '-')}${suffix}.png`, fullPage: true });

/**
 * Un CTA de la grille ouvre le récapitulatif (renouvellement, fin d'essai en essai), sans requête.
 * Essai : « Continuer » part vers checkout.stripe.com avec formule et période. Découverte : une adresse
 * d'un autre hôte est refusée, message générique, on reste sur la page. Solo : « Retour » referme.
 */
export async function checkCheckout(page, report, locale, label, mode, state) {
  const card = page.locator('[data-plan]').filter({ visible: true }).filter({ has: page.getByRole('button') }).last();
  const code = await card.getAttribute('data-plan');
  state.posts.length = 0;
  await card.getByRole('button').click();
  const sheet = page.getByRole('dialog');
  await sheet.waitFor();
  await animationsDone(sheet);
  const summary = sheet.locator('[data-checkout-summary]');
  const trial = await summary.locator('[data-checkout-trial]').count() === 1;
  report.check((await summary.textContent()).includes(fmt(locale, 'settings.subscription.checkout_renewal', { period: 'year' }))
    && trial === (mode === 'trial') && state.posts.length === 0,
  `${label} : récapitulatif ${code}, renouvellement annuel${mode === 'trial' ? ', fin de l\'essai annoncée' : ''}, sans requête`);
  await checkLayout(page, report, `${label} récapitulatif`);
  const cta = sheet.getByRole('button', { name: msg(locale, 'settings.subscription.checkout_cta'), exact: true });
  if (mode === 'trial') {
    state.checkoutUrl = CHECKOUT_URL;
    await Promise.all([page.waitForURL(/^https:\/\/checkout\.stripe\.com\//), cta.click()]);
    report.check(state.posts.join() === `checkout ${JSON.stringify({ plan: code, interval: 'year' })}`,
      `${label} : « Continuer » mène à checkout.stripe.com (${state.posts.join(', ')})`);
    await load(page);
    return;
  }
  if (mode === 'free') {
    state.checkoutUrl = FOREIGN_URL;
    await cta.click();
    const alert = sheet.getByRole('alert');
    await alert.waitFor();
    report.check((await alert.textContent()) === msg(locale, 'settings.subscription.errors.checkout_failed')
      && new URL(page.url()).pathname === '/settings/subscription' && state.foreign.length === 0,
    `${label} : adresse d'un autre hôte refusée, message générique, page conservée (${state.foreign.join(', ') || 'aucune visite'})`);
  }
  await sheet.getByRole('button', { name: msg(locale, 'settings.subscription.checkout_back'), exact: true }).click();
  await sheet.waitFor({ state: 'hidden' });
}

/** Attendu de « Votre formule » par abonnement Stripe : boutons, bandeau, motif de la grille, résiliation. */
function expected(locale, mode) {
  const t = (key) => msg(locale, `settings.subscription.${key}`);
  const owner = !mode.endsWith('member');
  const pastDue = mode.startsWith('past_due');
  return {
    buttons: owner ? [t(pastDue ? 'past_due_cta' : 'portal_cta')] : [],
    notice: pastDue ? 'past_due' : null,
    text: pastDue ? before(locale, 'settings.subscription.past_due') : owner ? before(locale, 'settings.subscription.renewal_line') : t('owner_only'),
    hint: mode === 'past_due_member' ? t('past_due_owner') : null,
    lock: owner ? 'change_soon' : 'owner_only',
    cancel: owner ? 'stripe' : null,
  };
}

/** « Votre formule » d'un abonnement Stripe, grille inactive avec son motif, résiliation selon le rôle. */
async function checkSummary(page, report, locale, label, mode) {
  const card = page.locator('[data-current-plan]');
  const want = expected(locale, mode);
  const buttons = (await card.getByRole('button').allTextContents()).map((s) => s.trim());
  const notice = await attr(card.locator('[data-billing-notice]'), 'data-billing-notice');
  const text = await card.textContent();
  const interval = await card.locator('[data-billing-interval]').getAttribute('data-billing-interval');
  const period = mode === 'yearly' ? 'year' : 'month';
  const lock = await attr(page.locator('[data-plan-lock]'), 'data-plan-lock');
  // Découverte porte son texte à la place du bouton : seuls les boutons comptent.
  const ctas = await page.locator('button[data-plan-cta]').evaluateAll((els) => els.length > 0 && els.every((el) => el.disabled));
  const cancel = await attr(page.locator('[data-cancel-plan]'), 'data-cancel-plan');
  report.check(await card.getAttribute('data-stripe-managed') !== null && interval === period
    && text.includes(fmt(locale, 'settings.subscription.period', { period })) && buttons.join('|') === want.buttons.join('|')
    && notice === want.notice && text.includes(want.text) && (!want.hint || text.includes(want.hint)),
  `${label} : abonnement Stripe ${period}, ${want.notice ? 'bandeau d\'impayé, ' : ''}boutons « ${buttons.join(' | ') || 'aucun'} »`);
  report.check(lock === want.lock && ctas && cancel === want.cancel,
    `${label} : grille inactive (« ${lock} »), résiliation ${cancel ?? 'masquée'}`);
  if (mode !== 'monthly' && mode !== 'yearly') return;
  const renewal = (await card.locator('[data-renewal]').textContent()).split(' · ').at(-1);
  report.check((await page.locator('[data-plan=boutique]').textContent()).includes(renewal),
    `${label} : renouvellement au montant ${period === 'year' ? 'annuel' : 'mensuel'} de la grille (${renewal})`);
}

/** Bouton de « Votre formule » qui part vers billing.stripe.com, puis retour sur la page. */
async function checkPortal(page, report, locale, label, key, state) {
  state.posts.length = 0;
  const button = page.locator('[data-current-plan]').getByRole('button', { name: msg(locale, `settings.subscription.${key}`), exact: true });
  await Promise.all([page.waitForURL(/^https:\/\/billing\.stripe\.com\//), button.click()]);
  report.check(state.posts.join() === 'portal', `${label} : « ${msg(locale, `settings.subscription.${key}`)} » mène à billing.stripe.com`);
  await load(page);
}

/** Fenêtre de résiliation Stripe : focus sur « Annuler », texte selon le cas. */
async function openCancel(page, locale) {
  await page.getByRole('button', { name: msg(locale, 'settings.subscription.cancel_cta_stripe'), exact: true }).click();
  const dialog = page.getByRole('dialog', { name: msg(locale, 'settings.subscription.cancel_title_stripe') });
  await dialog.waitFor();
  await animationsDone(dialog);
  const back = dialog.getByRole('button', { name: msg(locale, 'settings.subscription.cancel_back'), exact: true });
  return { dialog, back, focused: await back.evaluate((el) => el === document.activeElement) };
}

/**
 * Mensuel : résiliation confirmée, Échap sans effet pendant l'envoi (retenu), puis bandeau
 * « Résiliation programmée » et lien de résiliation masqué ; « Garder mon abonnement » reprend.
 */
async function checkCancelResume(page, report, locale, label, state) {
  const { dialog, focused } = await openCancel(page, locale);
  const text = await dialog.textContent();
  state.posts.length = 0;
  const release = hold(state);
  await dialog.getByRole('button', { name: msg(locale, 'settings.subscription.cancel_confirm'), exact: true }).click();
  await page.keyboard.press('Escape');
  await animationsDone(dialog);
  const stayed = await dialog.isVisible();
  release();
  await dialog.waitFor({ state: 'hidden' });
  report.check(focused && stayed && text.includes(before(locale, 'settings.subscription.cancel_text_stripe', { mode: 'period_end' }))
    && state.posts.join() === 'cancel',
  `${label} : résiliation confirmée (focus sur « Annuler », Échap bloqué pendant l'envoi : ${stayed ? 'oui' : 'non'})`);
  const notice = page.locator('[data-billing-notice=cancel_scheduled]');
  await notice.waitFor({ timeout: 10000 });
  report.check((await notice.textContent()).includes(before(locale, 'settings.subscription.cancel_scheduled'))
    && await page.locator('[data-cancel-plan]').count() === 0,
  `${label} : bandeau « résiliation programmée », lien de résiliation masqué`);
  await checkLayout(page, report, `${label} résiliation programmée`);
  await shot(page, label, '-scheduled');
  await notice.getByRole('button', { name: msg(locale, 'settings.subscription.resume_cta'), exact: true }).click();
  await notice.waitFor({ state: 'hidden', timeout: 10000 });
  report.check(state.posts.join() === 'cancel,resume' && await page.locator('[data-renewal]').isVisible(),
    `${label} : « ${msg(locale, 'settings.subscription.resume_cta')} » reprend l'abonnement`);
}

/** Retard de paiement (propriétaire) : la résiliation annonce un effet immédiat. */
async function checkPastDueCancel(page, report, locale, label) {
  const { dialog, back, focused } = await openCancel(page, locale);
  const text = (await dialog.textContent()) ?? '';
  report.check(focused && text.includes(fmt(locale, 'settings.subscription.cancel_text_stripe', { mode: 'past_due', date: '' })),
    `${label} : en retard de paiement, la résiliation est immédiate`);
  await back.click();
  await dialog.waitFor({ state: 'hidden' });
}

/** Retour de Stripe : `?checkout=success` (resynchronisation, attente, actif) et `?checkout=cancelled`. */
async function checkReturn(page, report, locale, label, state) {
  Object.assign(state, { mode: 'free', afterRefresh: 'monthly', posts: [] });
  const release = hold(state);
  await page.goto(`${BASE}/settings/subscription?checkout=success`);
  const banner = page.locator('[data-checkout-return]');
  await page.locator('[data-checkout-return=confirming]').waitFor({ timeout: 10000 });
  const spinner = await banner.locator('.animate-spin').count() === 1;
  const confirming = (await banner.textContent()) === msg(locale, 'settings.subscription.checkout_return.confirming');
  await page.waitForURL((url) => !url.search.includes('checkout='));
  release();
  await page.locator('[data-checkout-return=active]').waitFor({ timeout: 10000 });
  await shot(page, label, '-success');
  const name = msg(locale, 'settings.subscription.plans.boutique.name');
  report.check(spinner && confirming && (await banner.textContent()) === fmt(locale, 'settings.subscription.checkout_return.active', { name })
    && state.posts.join() === 'refresh' && await page.locator('[data-current-plan][data-stripe-managed]').count() === 1,
  `${label} : ?checkout=success → « confirmation » avec indicateur, une resynchronisation, puis « ${name} actif », paramètre retiré`);
  await checkLayout(page, report, label);
  Object.assign(state, { mode: 'free', afterRefresh: null, posts: [] });
  await load(page, '?checkout=cancelled');
  await page.locator('[data-checkout-return=cancelled]').waitFor({ timeout: 10000 });
  await shot(page, label, '-cancelled');
  report.check((await banner.textContent()) === msg(locale, 'settings.subscription.checkout_return.cancelled')
    && state.posts.length === 0 && !page.url().includes('checkout='),
  `${label} : ?checkout=cancelled → « ${msg(locale, 'settings.subscription.checkout_return.cancelled')} », sans requête, paramètre retiré`);
}

/** Abonnements Stripe un à un, puis retour de paiement. `prefix` : « 1440px fr light ». */
export async function auditBilling(page, report, locale, prefix, state, watch) {
  for (const mode of STRIPE_MODES) {
    const label = `${prefix} ${mode}`;
    console.log(`\n=== ${label}`);
    watch.setLabel(label);
    Object.assign(state, { mode, cancelAtEnd: false, afterRefresh: null, posts: [] });
    try {
      await load(page);
      await shot(page, label);
      await checkSummary(page, report, locale, label, mode);
      await checkLayout(page, report, label);
      if (mode === 'monthly') await checkPortal(page, report, locale, label, 'portal_cta', state);
      if (mode === 'monthly') await checkCancelResume(page, report, locale, label, state);
      if (mode === 'past_due') await checkPortal(page, report, locale, label, 'past_due_cta', state);
      if (mode === 'past_due') await checkPastDueCancel(page, report, locale, label);
    } catch (error) {
      report.check(false, `${label} : interrompu — ${error.message.split('\n')[0]}`);
    }
  }
  const label = `${prefix} retour de paiement`;
  console.log(`\n=== ${label}`);
  watch.setLabel(label);
  try {
    await checkReturn(page, report, locale, label, state);
  } catch (error) {
    report.check(false, `${label} : interrompu — ${error.message.split('\n')[0]}`);
  }
}
