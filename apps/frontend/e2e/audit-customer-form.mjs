/**
 * Audit du formulaire client (gabarit des pages de formulaire, version 2), création puis
 * modification, à 1440px et 360px, en clair et en sombre, en français et en arabe :
 * sections repliables avec résumé, erreurs dans une section repliée, actions sous la carte,
 * notifications, numéro de téléphone normalisé et « Relancer » sur WhatsApp.
 * Tout se passe dans la boutique du compte d'audit ; les clients créés (« Audit e2e … ») sont
 * archivés à la fin, et la boutique de Youssef est vérifiée intacte.
 */
import { BASE, VIEWPORTS, createReport, launch, openSession } from './lib/session.mjs';
import { msg } from './lib/messages.mjs';
import { nestedInteractive } from './lib/watch.mjs';

const report = createReport();
const created = [];
const nested = [];
// Client du compte d'audit avec une commande impayée (seed `_seed_e2e.py`).
const FOLLOWUP_CUSTOMER = 'Nadia Relance';

const visibleButton = (page, name) =>
  page.getByRole('button', { name, exact: true }).filter({ visible: true });
// Nom accessible du champ (l'astérisque des champs obligatoires est aria-hidden).
const textbox = (page, name) => page.getByRole('textbox', { name, exact: true });
// En-tête d'une section repliable : un <button> dans un <h3>.
const sectionButton = (page, title) => page.locator('form h3 > button').filter({ hasText: title });
const isFocused = (locator) => locator.evaluate((el) => el === document.activeElement);

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

/** Identité ouverte en tête ; Contact, Adresse, Notes repliées ; clic, Entrée et Espace. */
async function checkSections(page, t, ctx) {
  const titles = ['section_contact', 'section_address', 'section_notes_internal'].map((k) => t(`customers.form.${k}`));
  const expanded = await Promise.all(titles.map((title) => sectionButton(page, title).getAttribute('aria-expanded')));
  const required = page.locator('form section h2').filter({ hasText: t('customers.form.section_identity') });
  report.check(
    expanded.every((v) => v === 'false') && (await required.count()) === 1
      && (await page.locator('form section').getByText(t('ui.form.required'), { exact: true }).count()) === 1,
    `${ctx.label} : Identité ouverte (« ${t('ui.form.required')} »), trois sections facultatives repliées`,
  );
  const contact = sectionButton(page, titles[0]);
  await contact.click();
  const openedByClick = (await contact.getAttribute('aria-expanded')) === 'true'
    && (await textbox(page, t('customers.form.email')).isVisible());
  await contact.click();
  const address = sectionButton(page, titles[1]);
  await address.focus();
  await page.keyboard.press('Enter');
  const openedByEnter = (await address.getAttribute('aria-expanded')) === 'true';
  await page.keyboard.press('Space');
  const closedBySpace = (await address.getAttribute('aria-expanded')) === 'false';
  report.check(
    openedByClick && (await contact.getAttribute('aria-expanded')) === 'false' && openedByEnter && closedBySpace,
    `${ctx.label} : section ouverte au clic, à Entrée, refermée à Espace`,
  );
}

/** Desktop : actions sous la carte, dans le <form>, sans cadre ni fond. */
async function checkActions(page, t, ctx, submitLabel) {
  if (ctx.viewport.mobile) return;
  const submit = visibleButton(page, submitLabel);
  const style = await submit.evaluate((button) => {
    const bar = button.parentElement.parentElement;
    const card = button.form.firstElementChild;
    const s = getComputedStyle(bar);
    return {
      inForm: button.form.contains(card),
      below: bar.getBoundingClientRect().top >= card.getBoundingClientRect().bottom,
      frameless: s.borderTopWidth === '0px' && s.backgroundColor === 'rgba(0, 0, 0, 0)' && s.position === 'static',
    };
  });
  report.check(
    style.inForm && style.below && style.frameless && (await visibleButton(page, t('ui.form.cancel')).count()) === 1,
    `${ctx.label} : « ${t('ui.form.cancel')} » et « ${submitLabel} » sous la carte, sans cadre, dans le formulaire`,
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

/** Erreur dans une section repliée : la section s'ouvre et le champ reçoit le focus. */
async function checkCollapsedError(page, t, ctx, { field, value, error, origin }) {
  const contact = sectionButton(page, t('customers.form.section_contact'));
  const input = field === 'phone' ? page.getByRole('textbox', { name: t('customers.form.phone') }) : textbox(page, t('customers.form.email'));
  await contact.click();
  const previous = await input.inputValue();
  await input.fill(value);
  await contact.click();
  await visibleButton(page, t('customers.form.submit_edit')).click();
  await page.waitForFunction((el) => el === document.activeElement, await input.elementHandle(), { timeout: 5000 }).catch(() => {});
  report.check(
    (await contact.getAttribute('aria-expanded')) === 'true' && await isFocused(input)
      && (await describedText(input)).includes(error),
    `${ctx.label} : ${origin} dans « Contact » repliée → section ouverte, focus sur le champ, « ${error} » dessous`,
  );
  await input.fill(previous);
  await contact.click();
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
  const contact = sectionButton(page, t('customers.form.section_contact'));
  report.check(
    (await page.locator('h1').innerText()).includes(t('customers.edit.title'))
      && (await submit.isDisabled()) && !(await unsaved.isVisible())
      && (await contact.innerText()).includes(t('customers.form.section_contact_help')),
    `${label} : « ${t('customers.edit.title')} », bouton désactivé, section vide → son explication`,
  );
  await checkActions(page, t, ctx, t('customers.form.submit_edit'));
  await checkCollapsedError(page, t, ctx, { field: 'email', value: 'pas-un-email', error: t('customers.form.email_invalid'), origin: 'e-mail invalide' });
  await checkCollapsedError(page, t, ctx, { field: 'phone', value: '12345', error: t('customers.form.phone_invalid'), origin: 'numéro invalide (serveur)' });
  const address = sectionButton(page, t('customers.form.section_address'));
  await address.click();
  await textbox(page, t('customers.form.city')).fill('Rabat');
  await textbox(page, t('customers.form.postal_code')).fill('10000');
  await address.click();
  report.check(
    (await submit.isEnabled()) && (viewport.mobile || (await unsaved.isVisible()))
      && (await address.innerText()).includes('10000 Rabat'),
    `${label} : modification → ${viewport.mobile ? 'bouton actif' : '« Modifications non enregistrées »'}, résumé « 10000 Rabat » dans « Adresse » repliée`,
  );
  await checkLeaveGuard(page, t, ctx, customerName);
  await submit.click();
  await page.waitForURL(new RegExp(`/customers/${id}$`));
  await checkToast(page, ctx, t('customers.form.toast_saved'));
  const saved = await apiJson(page, `customers/${id}/`);
  report.check(saved.city === 'Rabat', `${label} : « ${t('customers.form.submit_edit')} » → fiche du client, ville enregistrée`);
}

/** « 06 12 34 56 78 » → +33612345678, affiché lisiblement, « Relancer » ouvre wa.me/33612345678. */
async function auditPhoneFollowup(page, t, ctx) {
  const { label } = ctx;
  const search = await apiJson(page, `customers/?search=${encodeURIComponent(FOLLOWUP_CUSTOMER)}`);
  const { id } = search.results[0];
  // Numéro vidé pour repartir d'un formulaire à modifier : l'audit reste relançable.
  await page.request.patch(`${BASE}/api/proxy/customers/${id}/`, { data: { phone: '' } });
  await page.goto(`${BASE}/customers/${id}/edit`);
  await page.waitForLoadState('networkidle');
  await sectionButton(page, t('customers.form.section_contact')).click();
  await page.getByRole('textbox', { name: t('customers.form.phone') }).fill('06 12 34 56 78');
  await visibleButton(page, t('customers.form.submit_edit')).click();
  await page.waitForURL(new RegExp(`/customers/${id}$`));
  const saved = await apiJson(page, `customers/${id}/`);
  await page.waitForLoadState('networkidle');
  report.check(
    saved.phone === '+33612345678' && (await page.getByText('+33 6 12 34 56 78', { exact: true }).first().isVisible())
      && (await page.locator('a[href="tel:+33612345678"]').count()) > 0,
    `${label} : « 06 12 34 56 78 » enregistré en +33612345678, affiché « +33 6 12 34 56 78 », lien tel: normalisé`,
  );
  await page.getByRole('button', { name: t('customers.detail.followup') }).filter({ visible: true }).first().click();
  const popup = page.context().waitForEvent('page', { timeout: 10000 }).catch(() => null);
  await visibleButton(page, t('messages.prepared.send_cta')).click();
  const opened = await popup;
  const url = opened ? opened.url() : '';
  await opened?.close();
  report.check(url.startsWith('https://wa.me/33612345678?'), `${label} : « ${t('customers.detail.followup')} » ouvre wa.me/33612345678 (${url.slice(0, 40) || 'aucune fenêtre'})`);
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
