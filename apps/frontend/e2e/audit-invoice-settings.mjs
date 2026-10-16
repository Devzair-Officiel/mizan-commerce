/** Réglages Factures : couleurs, contraste, TVA, virement, options, enregistrement et PDF. */
import { readFile, mkdir } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { msg } from './lib/messages.mjs';
import { layoutOk } from './lib/form.mjs';
import { api, createArticle } from './lib/products.mjs';
import { nestedInteractive } from './lib/watch.mjs';

const report = createReport();
const browser = await launch();
const endpoint = `${BASE}/api/proxy/shop/invoice-settings/`;
const visible = (locator) => locator.filter({ visible: true });

async function save(page, t, label) {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/proxy/shop/invoice-settings') && r.request().method() === 'PATCH' && (r.status() < 300 || r.status() >= 400)),
    visible(page.getByRole('button', { name: t('save'), exact: true })).click(),
  ]);
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: t('saved') }).first();
  await toast.waitFor({ state: 'visible' });
  // La réponse PATCH précède parfois le rechargement TanStack : attendre la fin
  // de l'enregistrement avant le choix suivant (bouton inactif, libellé normal).
  await page.waitForFunction((label) => [...document.querySelectorAll('form button[type=submit]')]
    .some((b) => b.checkVisibility() && b.disabled && b.textContent.trim() === label), t('save'));
  report.check(response.status() === 200, `${label} : enregistrement accepté`);
  return response.json();
}

async function choose(page, value) {
  await page.locator(`input[type=radio][value=${value}]`).check();
}

async function checkColors(page, t, label) {
  await choose(page, 'custom');
  await page.locator('input[type=color]').fill('#ffff00');
  await page.getByText(t('contrast_warning'), { exact: true }).waitFor();
  const chosen = await page.locator('[data-invoice-preview]').getAttribute('data-accent');
  const saved = await save(page, t, label);
  report.check(saved.invoice_color === chosen && chosen !== '#ffff00', `${label} : couleur trop claire assombrie, avertissement et vignette cohérents`);
  await choose(page, 'neutral');
  const neutral = await save(page, t, label);
  report.check(neutral.resolved_color === '' && await page.locator('[data-invoice-preview]').getAttribute('data-accent') === '#2b2f2d', `${label} : mode neutre enregistré et aperçu noir et gris`);
  await choose(page, 'automatic');
  const automatic = await save(page, t, label);
  report.check(automatic.resolved_color === automatic.invoice_auto_color, `${label} : automatique utilise la couleur extraite ou le neutre`);
}

async function checkLegalPaymentOptions(page, t, label) {
  await page.getByLabel(t('vat_regime'), { exact: true }).click();
  await page.getByRole('option', { name: t('applicable'), exact: true }).click();
  await page.getByLabel(t('vat_number'), { exact: false }).fill('FR123456789');
  await page.getByLabel(t('tax_rate'), { exact: true }).fill('20');
  await page.getByLabel(t('transfer'), { exact: true }).check();
  await page.getByLabel(t('iban'), { exact: true }).fill('FR76 3000 6000 0112 3456 7890 189');
  await page.getByLabel(t('bic'), { exact: true }).fill('AGRIFRPP');
  const toggle = page.getByRole('switch', { name: t('account_summary'), exact: true });
  if (await toggle.getAttribute('aria-checked') === 'true') await toggle.click();
  await toggle.focus();
  await toggle.press('Space');
  const saved = await save(page, t, label);
  report.check(saved.invoice_vat_regime === 'applicable' && saved.vat_number === 'FR123456789'
    && saved.invoice_iban === 'FR7630006000011234567890189' && saved.invoice_show_account_summary,
  `${label} : TVA, coordonnées bancaires et récapitulatif enregistrés (interrupteur au clavier)`);
  await page.getByLabel(t('transfer'), { exact: true }).uncheck();
  report.check(await page.getByLabel(t('iban'), { exact: true }).count() === 0, `${label} : sans virement, IBAN et BIC masqués`);
  await save(page, t, label);
}

async function checkIdentifierFormatting(page, t, label) {
  const siret = page.getByLabel(t('siret'), { exact: true });
  const iban = page.getByLabel(t('iban'), { exact: true });
  const vat = page.getByLabel(t('vat_number'), { exact: false });
  const before = await api(page, 'shop/invoice-settings/');
  await siret.fill('912 345 678 0001');
  await visible(page.getByRole('button', { name: t('save'), exact: true })).click();
  await page.getByText(t('siret_invalid'), { exact: true }).waitFor();
  report.check((await api(page, 'shop/invoice-settings/')).siret === before.siret
    && await siret.getAttribute('aria-invalid') === 'true', `${label} : SIRET invalide, erreur précise sous le champ, valeur enregistrée intacte`);
  await siret.fill('91234567800012');
  await siret.blur();
  await page.getByLabel(t('transfer'), { exact: true }).check();
  await iban.fill('FR75 3000 6000 0112 3456 7890 189');
  await visible(page.getByRole('button', { name: t('save'), exact: true })).click();
  await page.getByText(t('iban_invalid'), { exact: true }).waitFor();
  report.check((await api(page, 'shop/invoice-settings/')).invoice_iban === before.invoice_iban
    && await iban.getAttribute('aria-invalid') === 'true', `${label} : mauvaise clé IBAN, erreur précise sous le champ, valeur enregistrée intacte`);
  await iban.fill('FR76 3000 6000 0112 3456 7890 189');
  await iban.blur();
  await vat.fill('FR12 345 678 901');
  await vat.blur();
  const saved = await save(page, t, label);
  await page.reload();
  await siret.waitFor();
  report.check(saved.siret === '91234567800012' && saved.vat_number === 'FR12345678901'
    && saved.invoice_iban === 'FR7630006000011234567890189'
    && await siret.inputValue() === '912 345 678 00012'
    && await vat.inputValue() === 'FR12 345 678 901'
    && await iban.inputValue() === 'FR76 3000 6000 0112 3456 7890 189',
  `${label} : champs lisibles après rechargement, espaces tolérés et valeurs compactes en base`);
}

async function checkInvoiceDetail(page, label) {
  const customer = await api(page, 'customers/', { method: 'POST', data: {
    name: `Audit Facture ${Date.now()}`, phone: '+33612345678', country: 'FR',
  } });
  const article = await createArticle(page, { name: `Article facture ${Date.now()}`, price: '10' });
  const order = await api(page, 'orders/', { method: 'POST', data: {
    customer: customer.id, items: [{ variant: article.variants[0].id, quantity: 1 }],
  } });
  const invoice = await api(page, 'invoices/', { method: 'POST', data: { order_id: order.id } });
  await page.goto(`${BASE}/invoices/${invoice.id}`);
  await page.getByText('912 345 678 00012', { exact: false }).waitFor();
  const text = await page.locator('main').innerText();
  const after = await api(page, `invoices/${invoice.id}/`);
  report.check(['912 345 678 00012', 'FR76 3000 6000 0112 3456 7890 189', 'FR12 345 678 901', '+33 6 12 34 56 78'].every((v) => text.includes(v)),
    `${label} : SIRET, IBAN, TVA et téléphone lisibles dans le détail de facture`);
  report.check(isDeepStrictEqual(after.presentation, invoice.presentation), `${label} : instantané enregistré inchangé après affichage`);
  report.check(after.buyer_phone === '+33612345678', `${label} : téléphone enregistré inchangé après affichage`);
  await page.goto(`${BASE}/settings/invoices`);
  await page.locator('[data-invoice-preview]').waitFor();
}

async function download(page, t, label) {
  const [file] = await Promise.all([
    page.waitForEvent('download'), page.getByRole('link', { name: t('download'), exact: true }).click(),
  ]);
  const path = await file.path();
  const content = await readFile(path);
  report.check(content.subarray(0, 5).toString() === '%PDF-' && file.suggestedFilename() === 'exemple-facture.pdf', `${label} : téléchargement d’un vrai PDF avec les réglages enregistrés`);
}

try {
  await mkdir('results', { recursive: true });
  for (const viewport of VIEWPORTS) {
    const session = await openSession(browser, viewport);
    const { page, ctx, watch, setLocale, setTheme } = session;
    const initial = await (await page.request.get(endpoint)).json();
    try {
      for (const locale of ['fr', 'ar']) for (const theme of ['light', 'dark']) {
        if (!inMatrix(viewport, locale, theme)) continue;
        const label = `${viewport.name}px ${locale} ${theme}`;
        const t = (key) => msg(locale, `invoice_settings.${key}`);
        await setLocale(locale);
        setTheme(theme);
        watch.setLabel(label);
        await page.goto(`${BASE}/settings`);
        await page.locator('a[href="/settings/invoices"]').filter({ visible: true }).click();
        await page.waitForURL(/\/settings\/invoices$/);
        await page.getByRole('heading', { name: t('appearance'), exact: true }).waitFor();
        await page.waitForLoadState('networkidle');
        const contentWidth = await page.locator('[data-settings-content]').evaluate((el) => el.clientWidth);
        report.check(await layoutOk(page, { viewport: { ...viewport, mobile: contentWidth < 880 } }, { order: ['appearance', 'legal', 'payment', 'options', 'preview'].map(t), side: [t('preview')] }), `${label} : gabarit v3, aperçu à droite dès 880 px de conteneur, sinon en bas`);
        await checkColors(page, t, label);
        await checkLegalPaymentOptions(page, t, label);
        await checkIdentifierFormatting(page, t, label);
        await checkInvoiceDetail(page, label);
        await download(page, t, label);
        await page.reload();
        await page.getByRole('heading', { name: t('appearance'), exact: true }).waitFor();
        report.check(await page.locator('input[value=automatic]').isChecked(), `${label} : réglages conservés après rechargement`);
        report.check((await nestedInteractive(page)).length === 0, `${label} : aucun élément interactif imbriqué`);
        await page.screenshot({ path: `results/invoice-settings-${viewport.name}-${locale}-${theme}.png`, fullPage: true });
      }
    } finally {
      await page.request.patch(endpoint, { data: initial });
      const issues = watch.problems;
      report.check(issues.length === 0, `${viewport.name}px : console propre${issues.length ? '\n      ' + issues.join('\n      ') : ''}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
report.finish();
