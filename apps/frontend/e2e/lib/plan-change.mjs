/**
 * Changement de formule d'un abonné Stripe (lot 5b), pour audit-subscription. POST `change-preview`,
 * `change` et `scheduled-change/cancel` répondus par `ctx.route` sans atteindre le serveur, selon la
 * règle du backend (`classify_change` : montée ou passage à l'annuel immédiats, descente ou passage au
 * mensuel programmés, annuel → mensuel d'une formule supérieure refusé). Les réponses de `change` se
 * jouent dans l'ordre de `state.changeScript` (`amount_changed`, `expired`, `payment_failed`, puis
 * succès). Aucun appel à Stripe, rien n'est enregistré.
 */
import { animationsDone } from './wait.mjs';
import { fmt, msg } from './messages.mjs';
import { before, checkLayout, hold, load, shot } from './billing.mjs';

const RANK = { solo: 1, boutique: 2, commerce_plus: 3 };
/** Montants affichés tels quels (aucun calcul côté client) : valeurs d'audit. */
const DUE_NOW = { 'commerce_plus:month': '25.80', 'commerce_plus:year': '412.50', 'boutique:year': '298.33' };
const RENEWAL = { solo: { month: '9.00', year: '90.00' }, boutique: { month: '29.00', year: '290.00' }, commerce_plus: { month: '59.00', year: '590.00' } };
/** Descente vers Solo (ordre de FEATURE_MIN_PLAN) ; seules les fonctions livrées s'affichent. */
const SOLO_LOSSES = ['multi_user', 'roles_permissions', 'invoice_branding', 'daily_digest', 'exports', 'public_pages', 'loyalty', 'ocr', 'visual_inventory'];
const SHOWN_LOSSES = 'multi_user,roles_permissions,invoice_branding,daily_digest,exports,ocr';
/** Limite de clients fictive (Solo n'en a pas) : couvre la ligne générique de dépassement. */
const SOLO_OVER = [{ resource: 'members', usage: 2, limit: 1 }, { resource: 'customers', usage: 15, limit: 10 }];

/** Aperçu du serveur pour `choice`, ou refus `{ status, code }` ; noté dans `state.lastPreview`. */
function preview(state, { plan, interval }) {
  const sub = state.current;
  const from = { plan: sub.effective_plan_code, interval: sub.billing_interval };
  if (plan === from.plan && interval === from.interval) return { status: 400, code: 'no_change' };
  const up = RANK[plan] > RANK[from.plan] || (plan === from.plan && interval === 'year');
  if (up && plan !== from.plan && from.interval === 'year' && interval === 'month') return { status: 409, code: 'change_not_supported' };
  const end = sub.current_period_end;
  state.seq = (state.seq ?? 0) + 1;
  const solo = plan === 'solo';
  state.lastPreview = {
    kind: up ? 'immediate' : 'scheduled', current: from, target: { plan, interval },
    amount_due_now: up ? DUE_NOW[`${plan}:${interval}`] : '0.00', currency: 'EUR',
    proration_date: Math.floor(Date.now() / 1000) + state.seq, effective_at: up ? null : end,
    next_renewal: { amount: RENEWAL[plan][interval], date: up && interval === 'year' ? null : end },
    lost_features: solo ? SOLO_LOSSES : [], over_limits: solo ? SOLO_OVER : [],
  };
  if (up && interval === 'year') state.lastPreview.next_renewal.date = new Date(Date.parse(end) + 365 * 864e5).toISOString();
  return state.lastPreview;
}

/** Réponse de `change` : script d'erreurs puis abonnement mis à jour (immédiat) ou changement programmé. */
function change(state, body) {
  const step = state.changeScript.shift();
  const shown = state.lastPreview;
  if (step === 'payment_failed') return { status: 402, json: { detail: 'audit', code: 'payment_failed' } };
  if (step === 'amount_changed' || step === 'expired') {
    const next = preview(state, body);
    // Montant changé, ou même montant recalculé (aperçu expiré) : nouvelle date de prorata dans les deux cas.
    next.amount_due_now = step === 'expired' ? shown.amount_due_now : (Number(shown.amount_due_now) + 0.3).toFixed(2);
    return { status: 409, json: { detail: 'audit', code: 'amount_changed', preview: next } };
  }
  const { plan, interval } = body;
  if (shown.kind === 'immediate') {
    state.scheduled = null;
    return { json: { ...state.current, effective_plan_code: plan, plan: { ...state.current.plan, code: plan }, billing_interval: interval, scheduled_change: null } };
  }
  state.scheduled = { plan, interval, at: state.current.current_period_end };
  return { json: { ...state.current, scheduled_change: state.scheduled } };
}

function cancelChange(state) {
  if (!state.scheduled) return { status: 409, json: { detail: 'audit', code: 'nothing_scheduled' } };
  state.scheduled = null;
  return { json: { ...state.current, scheduled_change: null } };
}

/** POST du changement de formule simulés, notés dans `state.posts`, retenus tant que `state.hold` est posé. */
export async function routePlanChange(ctx, state) {
  await ctx.route(/\/api\/proxy\/subscriptions\/(change-preview|change|scheduled-change\/cancel)\/?$/, async (route) => {
    const request = route.request();
    const action = new URL(request.url()).pathname.includes('scheduled-change') ? 'cancel-change'
      : new URL(request.url()).pathname.split('/').filter(Boolean).at(-1);
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    state.posts.push(`${action}${request.postData() ? ` ${request.postData()}` : ''}`);
    try {
      if (state.hold) await state.hold.promise;
      if (action === 'change-preview') {
        const answer = preview(state, body);
        await route.fulfill(answer.code ? { status: answer.status, json: { detail: 'audit', code: answer.code } } : { json: answer });
      } else {
        await route.fulfill(action === 'change' ? change(state, body) : cancelChange(state));
      }
    } catch {
      // Contexte fermé pendant la requête (fin d'audit) : plus personne ne l'attend.
    }
  });
}

const S = (key) => `settings.subscription.${key}`;
const planName = (locale, code) => msg(locale, S(`plans.${code}.name`));
const planLabel = (locale, plan, interval) => fmt(locale, S('change.plan_period'), { plan: planName(locale, plan), period: interval || 'none' });
const posts = (state, action) => state.posts.filter((p) => p === action || p.startsWith(`${action} `));
const periodButton = (page, locale, period) => page.getByRole('button', { name: new RegExp(`^${fmt(locale, S('period'), { period })}`) });

/** CTA attendus de chaque carte pour un abonné Stripe `current` / `interval`, grille sur `period`. */
function wantedCtas(locale, current, interval, period) {
  return Object.fromEntries(['free', 'solo', 'boutique', 'commerce_plus'].map((code) => {
    if (code === 'free') return [code, fmt(locale, S('free_fallback'), { status: 'paid' })];
    if (code !== current) return [code, fmt(locale, S('change_cta'), { name: planName(locale, code) })];
    return [code, period === interval ? msg(locale, S('current')) : fmt(locale, S('switch_cta'), { period })];
  }));
}

/** Grille d'un abonné à jour : période de départ = son rythme, CTA actifs et libellés, puis l'autre période. */
async function checkGrid(page, report, locale, label, interval) {
  const ctas = () => page.locator('[data-plan]').evaluateAll((cards) => Object.fromEntries(cards.map((card) => {
    const cta = card.querySelector('[data-plan-cta]');
    return [card.dataset.plan, `${cta?.textContent.trim()}${cta?.disabled ? ' ✗' : ''}`];
  })));
  const other = interval === 'year' ? 'month' : 'year';
  const start = await periodButton(page, locale, interval).getAttribute('aria-pressed');
  const first = await ctas();
  await periodButton(page, locale, other).click();
  const second = await ctas();
  await periodButton(page, locale, interval).click();
  const same = (got, want) => JSON.stringify(got) === JSON.stringify(want);
  report.check(start === 'true' && same(first, wantedCtas(locale, 'boutique', interval, interval))
    && same(second, wantedCtas(locale, 'boutique', interval, other)) && await page.locator('[data-plan-lock]').count() === 0,
  `${label} : grille active sur ${interval === 'year' ? 'Annuel' : 'Mensuel'}, « ${first.boutique} » puis « ${second.boutique} », « ${first.solo} »`);
}

/** Ouvre l'aperçu de `code` / `period` (onglet sur mobile) ; `held` : aperçu retenu pour voir le squelette. */
async function openChange(page, locale, code, period, mobile, state, held = false) {
  await periodButton(page, locale, period).click();
  if (mobile) await page.getByRole('tab', { name: planName(locale, code) }).click();
  const release = held ? hold(state) : null;
  await page.locator(`[data-plan=${code}] button[data-plan-cta]`).click();
  const sheet = page.getByRole('dialog');
  await sheet.waitFor();
  await animationsDone(sheet);
  const loading = release ? await sheet.locator('[data-plan-change-loading]').isVisible() : null;
  release?.();
  return { sheet, loading };
}

const closeSheet = async (sheet, locale) => {
  await sheet.getByRole('button', { name: msg(locale, S('checkout_back')), exact: true }).click();
  await sheet.waitFor({ state: 'hidden' });
};

/** Corps de la dernière confirmation : exactement l'aperçu `shown` (montant en chaîne, date de prorata). */
function sameAsPreview(state, shown) {
  const raw = posts(state, 'change').at(-1)?.slice('change '.length);
  if (!raw || !shown) return false;
  const body = JSON.parse(raw);
  return Object.keys(body).sort().join() === 'expected_amount,interval,plan,proration_date'
    && body.plan === shown.target.plan && body.interval === shown.target.interval
    && body.expected_amount === shown.amount_due_now && body.proration_date === shown.proration_date;
}

const toast = (page, text) => page.locator('[data-sonner-toast]').filter({ hasText: text }).first();
const confirmButton = (sheet) => sheet.locator('[data-plan-change-confirm]');

/** Montée Boutique → Commerce+ mensuel : squelette, montant, renouvellement, prorata, un seul aperçu à l'ouverture. */
async function checkImmediatePreview(page, report, locale, label, state, mobile) {
  state.posts.length = 0;
  const { sheet, loading } = await openChange(page, locale, 'commerce_plus', 'month', mobile, state, true);
  await sheet.locator('[data-plan-change-kind=immediate]').waitFor();
  const due = sheet.locator('[data-due-now]');
  const amount = (await due.textContent()).trim();
  const text = await sheet.textContent();
  const renewal = (await sheet.locator('[data-next-renewal]').textContent()) ?? '';
  report.check(loading === true && await due.getAttribute('data-due-now') === '25.80'
    && (await sheet.locator('[data-plan-change-target]').textContent()) === planLabel(locale, 'commerce_plus', 'month')
    && text.includes(msg(locale, S('change.effective_now'))) && text.includes(msg(locale, S('change.prorata')))
    && renewal.startsWith(before(locale, S('change.next_renewal'))) && await sheet.locator('[data-next-renewal="59.00"]').count() === 1
    && await sheet.locator('[data-overwrites], [data-plan-change-losses], [data-effective-at]').count() === 0
    && (await confirmButton(sheet).textContent()).trim() === fmt(locale, S('change.confirm_pay'), { amount }),
  `${label} : aperçu immédiat (squelette ${loading ? 'vu' : '✗'}), « ${amount} » en grand, « ${msg(locale, S('change.effective_now'))} », renouvellement, prorata`);
  report.check(posts(state, 'change-preview').join() === `change-preview ${JSON.stringify({ plan: 'commerce_plus', interval: 'month' })}` && posts(state, 'change').length === 0,
    `${label} : un seul aperçu demandé à l'ouverture, rien de confirmé (${state.posts.join(', ')})`);
  await checkLayout(page, report, `${label} aperçu immédiat`, '[data-plan-change-sheet]');
  await shot(page, label, '-change-immediate');
  return sheet;
}

/** 409 amount_changed : nouvel aperçu affiché avec son message, jamais reconfirmé tout seul. */
async function checkAmountChanged(page, report, locale, label, state, sheet, step, notice) {
  const shown = state.lastPreview;
  state.changeScript = [step];
  await confirmButton(sheet).click();
  await sheet.locator(`[data-plan-change-notice=${notice}]`).waitFor();
  const amount = await sheet.locator('[data-due-now]').getAttribute('data-due-now');
  const button = (await confirmButton(sheet).textContent()).trim();
  const want = step === 'expired' ? shown.amount_due_now : state.lastPreview.amount_due_now;
  report.check(sameAsPreview(state, shown) && amount === want && amount === state.lastPreview.amount_due_now
    && button === fmt(locale, S('change.confirm_pay'), { amount: (await sheet.locator('[data-due-now]').textContent()).trim() })
    && (await sheet.locator('[data-plan-change-notice]').textContent()) === msg(locale, S(`change.${notice}`)),
  `${label} : confirmation = aperçu affiché, 409 → « ${msg(locale, S(`change.${notice}`))} », nouveau montant ${amount} à confirmer`);
}

/** Confirmation retenue : Échap sans effet, bouton occupé ; puis notification et fenêtre refermée. */
async function checkImmediateDone(page, report, locale, label, state, sheet) {
  const shown = state.lastPreview;
  state.changeScript = [];
  const release = hold(state);
  await confirmButton(sheet).click();
  await page.keyboard.press('Escape');
  await animationsDone(sheet);
  const blocked = await sheet.isVisible() && await confirmButton(sheet).getAttribute('aria-busy') === 'true'
    && await sheet.getByRole('button', { name: msg(locale, S('checkout_back')), exact: true }).isDisabled();
  release();
  const done = fmt(locale, S('change.done_now'), { plan: planLabel(locale, 'commerce_plus', 'month') });
  await toast(page, done).waitFor({ timeout: 10000 });
  await sheet.waitFor({ state: 'hidden' });
  report.check(blocked && sameAsPreview(state, shown) && posts(state, 'change').length === 3 && posts(state, 'change-preview').length === 1,
    `${label} : paiement en cours, Échap bloqué (${blocked ? 'oui' : 'non'}), puis « ${done} » (3 confirmations, 1 aperçu)`);
}

/** Descente Boutique → Solo : programmée, sans paiement, pertes, phrase des membres, puis bandeau et annulation. */
async function checkScheduledPreview(page, report, locale, label, state, mobile) {
  await load(page);
  state.posts.length = 0;
  const { sheet } = await openChange(page, locale, 'solo', 'month', mobile, state);
  await sheet.locator('[data-plan-change-kind=scheduled]').waitFor();
  const effect = fmt(locale, S('change.takes_effect'), { date: '§', plan: planLabel(locale, 'boutique', 'month') }).split('§');
  const takes = (await sheet.locator('[data-effective-at]').textContent()) ?? '';
  const lines = await sheet.locator('[data-over-limit]').evaluateAll((els) => els.map((el) => [el.dataset.overLimit, el.textContent.trim()]));
  const over = fmt(locale, S('change.over_limit'), { resource: 'customers', usage: 15, limit: 10, kind: 'both' });
  report.check(await sheet.locator('[data-due-now]').getAttribute('data-due-now') === '0.00'
    && (await sheet.locator('[data-due-now]').textContent()) === msg(locale, S('change.no_payment_today'))
    && takes.startsWith(effect[0]) && takes.endsWith(effect[1])
    && (await confirmButton(sheet).textContent()).trim() === msg(locale, S('change.confirm_schedule')),
  `${label} : aperçu programmé, « ${msg(locale, S('change.no_payment_today'))} », « ${takes} »`);
  report.check(await sheet.locator('[data-lost-features]').getAttribute('data-lost-features') === SHOWN_LOSSES
    && JSON.stringify(lines) === JSON.stringify([['members_suspended', msg(locale, S('change.members_suspended'))], ['customers', over]]),
  `${label} : fonctions livrées perdues (${SHOWN_LOSSES}), phrase des membres, « ${over} »`);
  await checkLayout(page, report, `${label} aperçu programmé`, '[data-plan-change-sheet]');
  await shot(page, label, '-change-scheduled');
  const shown = state.lastPreview;
  await confirmButton(sheet).click();
  const done = before(locale, S('change.done_scheduled'), { dated: 'yes' });
  await toast(page, done).waitFor({ timeout: 10000 });
  await sheet.waitFor({ state: 'hidden' });
  report.check(sameAsPreview(state, shown), `${label} : « ${done}… », confirmation = aperçu affiché`);
}

/** Bandeau du changement programmé, « Après le … » face à Solo, aperçu suivant qui le remplace, annulation sans confirmation. */
async function checkScheduledNotice(page, report, locale, label, state, mobile) {
  const notice = page.locator('[data-scheduled-change=solo]');
  await notice.waitFor({ timeout: 10000 });
  const parts = fmt(locale, S('change.scheduled_notice'), {
    dated: 'yes', date: '§', target: planLabel(locale, 'solo', 'month'), current: planLabel(locale, 'boutique', 'month'),
  }).split('§');
  const text = await notice.textContent();
  report.check(text.includes(parts[0]) && text.includes(parts[1]) && await page.locator('[data-activity-after=solo]').count() === 1
    && await page.locator('[data-renewal]').count() === 0,
  `${label} : bandeau « ${parts[0]}… », bloc « Après le … » face à Solo, ligne de renouvellement masquée`);
  await checkLayout(page, report, `${label} changement programmé`, '[data-current-plan]');
  await shot(page, label, '-change-notice');
  const { sheet } = await openChange(page, locale, 'commerce_plus', 'month', mobile, state);
  const overwrites = sheet.locator('[data-overwrites=solo]');
  await overwrites.waitFor();
  report.check((await overwrites.textContent()) === fmt(locale, S('change.overwrites'), { kind: 'immediate', plan: planLabel(locale, 'solo', 'month') }),
    `${label} : un nouvel aperçu annonce qu'il annule le changement programmé`);
  await closeSheet(sheet, locale);
  state.posts.length = 0;
  await notice.getByRole('button', { name: msg(locale, S('change.cancel_cta')), exact: true }).click();
  await toast(page, msg(locale, S('change.cancelled'))).waitFor({ timeout: 10000 });
  await notice.waitFor({ state: 'hidden' });
  report.check(state.posts.join() === 'cancel-change' && await page.locator('[data-renewal]').isVisible(),
    `${label} : « ${msg(locale, S('change.cancel_cta'))} » sans confirmation, « ${msg(locale, S('change.cancelled'))} », renouvellement de retour`);
}

/** 402 : message, « Réessayer » (nouvel aperçu, rien de reconfirmé) et moyen de paiement (portail). */
async function checkPaymentFailed(page, report, locale, label, state, mobile) {
  await load(page);
  state.posts.length = 0;
  const { sheet } = await openChange(page, locale, 'commerce_plus', 'year', mobile, state);
  await sheet.locator('[data-plan-change-kind=immediate]').waitFor();
  state.changeScript = ['payment_failed'];
  await confirmButton(sheet).click();
  const error = sheet.locator('[data-plan-change-error=payment_failed]');
  await error.waitFor();
  const shownError = (await error.textContent()) === msg(locale, S('change.errors.payment_failed'))
    && await confirmButton(sheet).count() === 0 && await sheet.locator('[data-plan-change-portal]').isVisible();
  await sheet.locator('[data-plan-change-retry]').click();
  await confirmButton(sheet).waitFor();
  report.check(shownError && await error.count() === 0 && posts(state, 'change-preview').length === 2 && posts(state, 'change').length === 1,
    `${label} : 402 → « ${msg(locale, S('change.errors.payment_failed'))} », « ${msg(locale, S('retry'))} » redemande un aperçu sans confirmer`);
  await checkLayout(page, report, `${label} paiement refusé`, '[data-plan-change-sheet]');
  state.changeScript = ['payment_failed'];
  await confirmButton(sheet).click();
  await sheet.locator('[data-plan-change-portal]').waitFor();
  await shot(page, label, '-change-402');
  await Promise.all([page.waitForURL(/^https:\/\/billing\.stripe\.com\//), sheet.locator('[data-plan-change-portal]').click()]);
  report.check(posts(state, 'portal').length === 1, `${label} : « ${msg(locale, S('past_due_cta'))} » mène à billing.stripe.com`);
  await load(page);
}

/** Annuel → Commerce+ mensuel : refusé dès l'aperçu, message en deux temps, seul « Retour » reste. */
async function checkNotSupported(page, report, locale, label, state, mobile) {
  state.posts.length = 0;
  const { sheet } = await openChange(page, locale, 'commerce_plus', 'month', mobile, state);
  const error = sheet.locator('[data-plan-change-error=change_not_supported]');
  await error.waitFor();
  const buttons = (await sheet.locator('[data-plan-change-sheet] button').allTextContents()).map((b) => b.trim());
  report.check((await error.textContent()) === msg(locale, S('change.errors.change_not_supported'))
    && buttons.join('|') === msg(locale, S('checkout_back')) && posts(state, 'change').length === 0,
  `${label} : annuel → Commerce+ mensuel refusé, « ${msg(locale, S('change.errors.change_not_supported'))} », seul « ${buttons.join(' | ')} »`);
  await shot(page, label, '-change-unsupported');
  await closeSheet(sheet, locale);
}

/** Abonné Boutique mensuel puis annuel : grille active, aperçus, confirmations, refus. `prefix` : « 1440px fr light ». */
export async function auditPlanChange(page, report, locale, prefix, state, watch, mobile) {
  const steps = {
    monthly: async (label) => {
      await checkGrid(page, report, locale, label, 'month');
      const sheet = await checkImmediatePreview(page, report, locale, label, state, mobile);
      await checkAmountChanged(page, report, locale, label, state, sheet, 'amount_changed', 'amount_changed');
      await checkAmountChanged(page, report, locale, label, state, sheet, 'expired', 'preview_expired');
      await checkImmediateDone(page, report, locale, label, state, sheet);
      await checkScheduledPreview(page, report, locale, label, state, mobile);
      await checkScheduledNotice(page, report, locale, label, state, mobile);
      await checkPaymentFailed(page, report, locale, label, state, mobile);
    },
    yearly: async (label) => {
      await checkGrid(page, report, locale, label, 'year');
      await checkNotSupported(page, report, locale, label, state, mobile);
    },
  };
  for (const [mode, run] of Object.entries(steps)) {
    const label = `${prefix} changement ${mode}`;
    console.log(`\n=== ${label}`);
    watch.setLabel(label);
    Object.assign(state, { mode, cancelAtEnd: false, afterRefresh: null, scheduled: null, changeScript: [], posts: [] });
    try {
      await load(page);
      await run(label);
    } catch (error) {
      report.check(false, `${label} : interrompu — ${error.message.split('\n')[0]}`);
    }
  }
  Object.assign(state, { scheduled: null, changeScript: [] });
}
