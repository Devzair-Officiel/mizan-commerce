/** Réglages Factures : couleurs, contraste, TVA, virement, options, enregistrement et PDF. */
import { readFile, mkdir } from 'node:fs/promises';
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { msg } from './lib/messages.mjs';
import { layoutOk } from './lib/form.mjs';
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
        await page.locator('a[href="/settings/invoices"]').click();
        await page.waitForURL(/\/settings\/invoices$/);
        await page.getByRole('heading', { name: t('appearance'), exact: true }).waitFor();
        await page.waitForLoadState('networkidle');
        report.check(await layoutOk(page, { viewport }, { order: ['appearance', 'legal', 'payment', 'options', 'preview'].map(t), side: [t('preview')] }), `${label} : gabarit v3, aperçu à droite ou en bas sur mobile`);
        await checkColors(page, t, label);
        await checkLegalPaymentOptions(page, t, label);
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
