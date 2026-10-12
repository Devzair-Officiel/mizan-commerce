/**
 * Audit du formulaire client (gabarit de formulaire v3), création puis modification, à 1440px
 * et 360px, en clair et en sombre, en français et en arabe : desktop, deux colonnes (Identité,
 * Contact, Adresse | Notes internes), tout visible ; mobile, cartes empilées dans cet ordre, les
 * facultatives repliables avec résumé, erreurs dans une carte repliée ; aperçu du nom en direct,
 * actions sous les colonnes, notifications ; indicatif du pays choisi dans la liste (recherche « 212 »
 * → Maroc), numéro enregistré en E.164, « Relancer » sur WhatsApp, pays déduit du numéro en modification.
 * Tout se passe dans la boutique du compte d'audit ; les clients créés (« Audit e2e … ») sont
 * archivés à la fin, et la boutique de Youssef est vérifiée intacte.
 */
import { BASE, VIEWPORTS, createReport, launch, openSession } from './lib/session.mjs';
import { msg } from './lib/messages.mjs';
import { nestedInteractive } from './lib/watch.mjs';
import { cardToggle, closeCard, isFocused, layoutOk, openCard, textbox, visibleButton } from './lib/form.mjs';

const report = createReport();
const created = [];
const nested = [];
// Client du compte d'audit avec une commande impayée (seed `_seed_e2e.py`).
const FOLLOWUP_CUSTOMER = 'Nadia Relance';

async function describedText(field) {
  const ids = ((await field.getAttribute('aria-describedby')) ?? '').split(' ').filter(Boolean);
  return Promise.all(ids.map((id) => field.page().locator(`[id="${id}"]`).innerText()));
}

async function toastShown(page, text) {
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: text }).first();
  return toast.waitFor({ state: 'visible', timeout: 5000 }).then(() => toast, () => null);
}

async function apiJson(page, path, options = {}) {
  const res = await page.request.fetch(`${BASE}/api/proxy/${path}`, options);
  return res.json();
}

/** Toast visible, dans la région de notifications, au-dessus de la barre du bas sur mobile. */
async function checkToast(page, ctx, text) {
  const toast = await toastShown(page, text);
  const box = toast && await toast.boundingBox();
  const regions = await page.locator('section[aria-live="polite"][aria-label]').count();
  const { width, height, mobile } = ctx.viewport;
  // Mobile : au-dessus de la barre du bas. Desktop : en bas, côté fin de ligne (droite, gauche en arabe).
  const side = ctx.locale === 'ar' ? box?.x + box?.width < width / 2 : box?.x > width / 2;
  const placed = box && (mobile ? box.y + box.height < height - 64 : box.y > height / 2 && side);
  report.check(Boolean(placed) && regions === 1, `${ctx.label} : notification « ${text} » visible (un seul Toaster, aria-live)`);
}

/**
 * Disposition v3 ; Identité « Obligatoire », jamais repliée. Mobile : cartes facultatives
 * repliées, ouvertes au clic, à Entrée, refermées à Espace. Desktop : rien à déplier.
 */
async function checkSections(page, t, ctx) {
  const titles = ['section_identity', 'section_contact', 'section_address', 'section_notes_internal'].map((k) => t(`customers.form.${k}`));
  const layout = await layoutOk(page, ctx, { order: titles, side: [titles[3]] });
  report.check(
    layout && (await cardToggle(page, titles[0]).count()) === 0
      && (await page.locator('form section').getByText(t('ui.form.required'), { exact: true }).count()) === 1,
    `${ctx.label} : Identité « ${t('ui.form.required')} », ${ctx.viewport.mobile ? 'cartes empilées dans l\'ordre, facultatives repliées' : 'deux colonnes (Notes internes à côté), rien à déplier'}`,
  );
  if (!ctx.viewport.mobile) return;
  const contact = cardToggle(page, titles[1]);
  await contact.click();
  const openedByClick = (await contact.getAttribute('aria-expanded')) === 'true'
    && (await textbox(page, t('customers.form.email')).isVisible());
  await contact.click();
  const address = cardToggle(page, titles[2]);
  await address.focus();
  await page.keyboard.press('Enter');
  const openedByEnter = (await address.getAttribute('aria-expanded')) === 'true';
  await page.keyboard.press('Space');
  const closedBySpace = (await address.getAttribute('aria-expanded')) === 'false';
  report.check(
    openedByClick && (await contact.getAttribute('aria-expanded')) === 'false' && openedByEnter && closedBySpace,
    `${ctx.label} : carte ouverte au clic, à Entrée, refermée à Espace`,
  );
}

/** Aperçu de l'identité : initiales et nom tel qu'il apparaîtra, mis à jour pendant la saisie. */
async function checkPreview(page, t, ctx) {
  const card = page.locator('form section').filter({ has: page.getByRole('heading', { name: t('customers.form.section_identity') }) });
  const empty = await card.getByText(t('customers.form.preview_empty'), { exact: true }).count();
  await textbox(page, t('customers.form.first_name')).fill('Amine');
  await textbox(page, t('customers.form.name')).fill('El Idrissi');
  const shown = await card.getByText('Amine El Idrissi', { exact: true }).count();
  // Initiales : prénom et dernier mot du nom.
  const initials = await card.getByText('AI', { exact: true }).count();
  await textbox(page, t('customers.form.first_name')).fill('');
  await textbox(page, t('customers.form.name')).fill('');
  report.check(empty === 1 && shown === 1 && initials === 1,
    `${ctx.label} : aperçu « ${t('customers.form.preview_empty')} » puis « Amine El Idrissi » (AI) pendant la saisie`);
}

/** Desktop : actions sous les deux colonnes, dans le <form>, sans cadre ni fond, alignées en fin de ligne. */
async function checkActions(page, t, ctx, submitLabel) {
  if (ctx.viewport.mobile) return;
  const submit = visibleButton(page, submitLabel);
  const style = await submit.evaluate((button) => {
    const bar = button.parentElement.parentElement;
    const columns = button.form.firstElementChild.getBoundingClientRect();
    const buttons = button.parentElement.getBoundingClientRect();
    const s = getComputedStyle(bar);
    const rtl = getComputedStyle(button).direction === 'rtl';
    return {
      below: bar.getBoundingClientRect().top >= columns.bottom,
      end: rtl ? Math.abs(buttons.left - columns.left) <= 8 : Math.abs(buttons.right - columns.right) <= 8,
      frameless: s.borderTopWidth === '0px' && s.backgroundColor === 'rgba(0, 0, 0, 0)' && s.position === 'static',
    };
  });
  report.check(
    style.below && style.end && style.frameless && (await visibleButton(page, t('ui.form.cancel')).count()) === 1,
    `${ctx.label} : « ${t('ui.form.cancel')} » et « ${submitLabel} » sous les colonnes, sans cadre, en fin de ligne`,
  );
}

async function auditCreate(page, t, ctx) {
  const { label, locale, theme } = ctx;
  await page.goto(`${BASE}/customers/new`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
  const html = page.locator('html');
  report.check(
    (await page.locator('h1').innerText()).includes(t('customers.new.title'))
      && (await html.getAttribute('class')).split(' ').includes('dark') === (theme === 'dark')
      && (await html.getAttribute('dir')) === (locale === 'ar' ? 'rtl' : 'ltr'),
    `${label} : titre « ${t('customers.new.title')} », thème et sens de lecture`,
  );
  await checkSections(page, t, ctx);
  await checkPreview(page, t, ctx);
  await checkActions(page, t, ctx, t('customers.form.submit_create'));
  const submit = visibleButton(page, t('customers.form.submit_create'));
  await submit.click();
  const name = textbox(page, t('customers.form.name'));
  report.check(
    (await name.getAttribute('aria-invalid')) === 'true' && (await describedText(name)).includes(t('customers.form.name_required'))
      && await isFocused(name),
    `${label} : « Nom » vide → erreur sous le champ, focus sur le champ`,
  );
  await name.fill(`Audit e2e ${Date.now()}`);
  await submit.click();
  await page.waitForURL(/\/customers\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop();
  created.push(id);
  await checkToast(page, ctx, t('customers.form.toast_created'));
  return id;
}

/** Erreur de champ : mobile, dans « Contact » repliée, la carte s'ouvre ; partout, focus sur le champ et message dessous. */
async function checkCollapsedError(page, t, ctx, { field, value, error, origin }) {
  const title = t('customers.form.section_contact');
  const input = field === 'phone' ? page.getByRole('textbox', { name: t('customers.form.phone') }) : textbox(page, t('customers.form.email'));
  await openCard(page, ctx, title);
  const previous = await input.inputValue();
  await input.fill(value);
  await closeCard(page, ctx, title);
  await visibleButton(page, t('customers.form.submit_edit')).click();
  await page.waitForFunction((el) => el === document.activeElement, await input.elementHandle(), { timeout: 5000 }).catch(() => {});
  const opened = !ctx.viewport.mobile || (await cardToggle(page, title).getAttribute('aria-expanded')) === 'true';
  report.check(
    opened && await isFocused(input) && (await describedText(input)).includes(error),
    `${ctx.label} : ${origin}${ctx.viewport.mobile ? ' dans « Contact » repliée → carte ouverte,' : ' →'} focus sur le champ, « ${error} » dessous`,
  );
  await input.fill(previous);
  await closeCard(page, ctx, title);
}

/** « Annuler » (desktop) ou le retour de l'en-tête (mobile) demande confirmation. */
async function checkLeaveGuard(page, t, ctx, customerName) {
  const { label, viewport } = ctx;
  let asked = '';
  page.once('dialog', (dialog) => { asked = dialog.message(); dialog.dismiss(); });
  const leave = viewport.mobile ? visibleButton(page, customerName) : visibleButton(page, t('ui.form.cancel'));
  await leave.click();
  await page.waitForTimeout(300);
  report.check(
    asked === t('layout.common.confirm_leave') && page.url().endsWith('/edit'),
    `${label} : ${viewport.mobile ? 'retour' : '« Annuler »'} demande confirmation, refus → reste sur le formulaire`,
  );
}

async function auditEdit(page, t, ctx, id) {
  const { label, viewport } = ctx;
  await page.goto(`${BASE}/customers/${id}/edit`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
  const customerName = await textbox(page, t('customers.form.name')).inputValue();
  const submit = visibleButton(page, t('customers.form.submit_edit'));
  const unsaved = page.getByText(t('ui.form.unsaved'), { exact: true });
  // Carte vide : son explication, dans l'en-tête repliable (mobile) ou sous le titre (desktop).
  const help = page.locator('form section').getByText(t('customers.form.section_contact_help'), { exact: true }).filter({ visible: true });
  report.check(
    (await page.locator('h1').innerText()).includes(t('customers.edit.title'))
      && (await submit.isDisabled()) && !(await unsaved.isVisible()) && (await help.count()) === 1,
    `${label} : « ${t('customers.edit.title')} », bouton désactivé, carte Contact vide → son explication`,
  );
  await checkActions(page, t, ctx, t('customers.form.submit_edit'));
  await checkCollapsedError(page, t, ctx, { field: 'email', value: 'pas-un-email', error: t('customers.form.email_invalid'), origin: 'e-mail invalide' });
  await checkCollapsedError(page, t, ctx, { field: 'phone', value: '12345', error: t('customers.form.phone_invalid'), origin: 'numéro invalide (serveur)' });
  const address = t('customers.form.section_address');
  await openCard(page, ctx, address);
  await textbox(page, t('customers.form.city')).fill('Rabat');
  await textbox(page, t('customers.form.postal_code')).fill('10000');
  const summary = await closeCard(page, ctx, address);
  report.check(
    (await submit.isEnabled()) && (viewport.mobile ? summary.includes('10000 Rabat') : await unsaved.isVisible()),
    `${label} : modification → ${viewport.mobile ? 'bouton actif, résumé « 10000 Rabat » dans « Adresse » repliée' : '« Modifications non enregistrées »'}`,
  );
  await checkLeaveGuard(page, t, ctx, customerName);
  await submit.click();
  await page.waitForURL(new RegExp(`/customers/${id}$`));
  await checkToast(page, ctx, t('customers.form.toast_saved'));
  const saved = await apiJson(page, `customers/${id}/`);
  report.check(saved.city === 'Rabat', `${label} : « ${t('customers.form.submit_edit')} » → fiche du client, ville enregistrée`);
}

/** Indicatif choisi dans la liste : « 212 » donne les pays en +212, « Maroc » (par son nom) se choisit au clavier. */
async function pickMorocco(page, t, ctx) {
  const trigger = page.getByRole('combobox', { name: t('ui.phone.country_label') }).filter({ visible: true });
  await trigger.click();
  const search = page.getByRole('dialog', { name: t('ui.phone.country_label') }).getByRole('combobox');
  const options = page.getByRole('option').filter({ visible: true });
  // +212 est partagé par le Maroc et le Sahara occidental : la recherche par indicatif les donne tous les deux.
  await search.fill('212');
  await options.first().waitFor({ timeout: 5000 });
  const dials = await options.allInnerTexts();
  const byDial = dials.length > 0 && dials.every((text) => text.includes('+212'));
  const morocco = await page.evaluate((locale) => new Intl.DisplayNames([locale], { type: 'region' }).of('MA'), ctx.locale);
  await search.fill(morocco);
  await options.first().waitFor({ timeout: 5000 });
  const byName = (await options.count()) === 1 && (await options.first().innerText()).includes('+212');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.getByRole('dialog', { name: t('ui.phone.country_label') }).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  const shown = (await trigger.innerText()).replace(/\s+/g, ' ');
  report.check(
    byDial && byName && shown.includes('🇲🇦') && shown.includes('+212'),
    `${ctx.label} : « ${t('ui.phone.country_label')} », recherche « 212 » → ${dials.length} option(s) en +212, « ${morocco} » choisi au clavier (« ${shown} »)`,
  );
}

/** Maroc (+212) puis « 06 12 34 56 78 » → +212612345678 (E.164), « Relancer » ouvre wa.me/212612345678 ; en modification, le pays est déduit du numéro. */
async function auditPhoneFollowup(page, t, ctx) {
  const { label } = ctx;
  const search = await apiJson(page, `customers/?search=${encodeURIComponent(FOLLOWUP_CUSTOMER)}`);
  const { id } = search.results[0];
  // Numéro vidé pour repartir d'un formulaire à modifier : l'audit reste relançable.
  await page.request.patch(`${BASE}/api/proxy/customers/${id}/`, { data: { phone: '' } });
  await page.goto(`${BASE}/customers/${id}/edit`);
  await page.waitForLoadState('networkidle');
  await openCard(page, ctx, t('customers.form.section_contact'));
  await pickMorocco(page, t, ctx);
  await page.getByRole('textbox', { name: t('customers.form.phone') }).fill('06 12 34 56 78');
  await visibleButton(page, t('customers.form.submit_edit')).click();
  await page.waitForURL(new RegExp(`/customers/${id}$`));
  const saved = await apiJson(page, `customers/${id}/`);
  await page.waitForLoadState('networkidle');
  report.check(
    saved.phone === '+212612345678' && (await page.getByText(saved.phone_display, { exact: true }).first().isVisible())
      && (await page.locator('a[href="tel:+212612345678"]').count()) > 0,
    `${label} : Maroc + « 06 12 34 56 78 » enregistré en +212612345678, affiché « ${saved.phone_display} », lien tel: normalisé`,
  );
  await page.getByRole('button', { name: t('customers.detail.followup') }).filter({ visible: true }).first().click();
  const popup = page.context().waitForEvent('page', { timeout: 10000 }).catch(() => null);
  await visibleButton(page, t('messages.prepared.send_cta')).click();
  const opened = await popup;
  const url = opened ? opened.url() : '';
  await opened?.close();
  report.check(url.startsWith('https://wa.me/212612345678?'), `${label} : « ${t('customers.detail.followup')} » ouvre wa.me/212612345678 (${url.slice(0, 40) || 'aucune fenêtre'})`);
  await page.goto(`${BASE}/customers/${id}/edit`);
  await page.waitForLoadState('networkidle');
  await openCard(page, ctx, t('customers.form.section_contact'));
  const trigger = page.getByRole('combobox', { name: t('ui.phone.country_label') }).filter({ visible: true });
  const national = await page.getByRole('textbox', { name: t('customers.form.phone') }).inputValue();
  report.check(
    (await trigger.innerText()).includes('+212') && national.replace(/\D/g, '') === '0612345678',
    `${label} : en modification, indicatif +212 déduit du numéro, numéro national « ${national} »`,
  );
}

/** Aucun client de test dans la boutique de Youssef (les audits n'y créent plus rien). */
async function checkYoussefShop(browser) {
  const { ctx, page } = await openSession(browser, VIEWPORTS[0], { email: 'youssef@example.com' });
  const data = await apiJson(page, `customers/?situation=all&search=${encodeURIComponent('Audit e2e')}`);
  report.check(data.count === 0, `Boutique de Youssef : aucun client « Audit e2e » (${data.count})`);
  await ctx.close();
}

const browser = await launch();
for (const viewport of VIEWPORTS) {
  const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
  // WhatsApp n'est pas joint : la fenêtre ouverte par « Relancer » reçoit une page vide.
  await ctx.route('https://wa.me/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>wa</title>' }));
  for (const locale of ['fr', 'ar']) {
    for (const theme of ['light', 'dark']) {
      const label = `${viewport.name}px ${locale} ${theme === 'dark' ? 'sombre' : 'clair'}`;
      console.log(`\n=== ${label}`);
      await setLocale(locale);
      setTheme(theme);
      watch.setLabel(label);
      const before = watch.problems.length;
      const t = (key) => msg(locale, key);
      const run = { label, viewport, locale, theme };
      const id = await auditCreate(page, t, run);
      await auditEdit(page, t, run, id);
      await auditPhoneFollowup(page, t, run);
      // Le 400 du numéro invalide est provoqué par l'audit (erreur de champ attendue).
      const provoked = (p) => /status of 400 .*\/api\/proxy\/customers\/[0-9a-f-]{36}\)/.test(p);
      const problems = [...watch.problems.slice(before).filter((p) => !provoked(p)), ...nested.splice(0).map((n) => `imbriqué : ${n}`)];
      report.check(problems.length === 0, `${label} : console propre, aucun élément imbriqué${problems.map((p) => `\n      ${p}`).join('')}`);
    }
  }
  for (const id of created.splice(0)) await page.request.delete(`${BASE}/api/proxy/customers/${id}/`);
  await ctx.close();
}
await checkYoussefShop(browser);
await browser.close();
report.finish();
