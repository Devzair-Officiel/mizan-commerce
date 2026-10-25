/**
 * Pages légales sans connexion (mentions légales, confidentialité, CGV), à 1440px et 360px, système clair et sombre :
 * - chaque page s'affiche pour un visiteur sans session (aucune redirection vers /login), titre attendu ;
 * - éditeur de lib/legal.ts, mention « TVA non applicable » ; ni ancien éditeur, ni numéro de TVA, ni crochet ;
 * - aucun débordement horizontal, titre et texte lisibles (contraste ≥ 4,5:1 sur le fond réel) ;
 * - pied de page : « CGV » juste après « Mentions légales » ; inscription : lien vers /cgv ;
 * - console propre, aucun élément interactif imbriqué.
 * Pages en français seulement : la langue ne change pas, le thème vient du système (`colorScheme`).
 */
import { BASE, VIEWPORTS, createReport, launch } from './lib/session.mjs';
import { nestedInteractive, watchConsole } from './lib/watch.mjs';

const PUBLISHER = 'Aurélien BOUDON';
const VAT_NOTICE = 'TVA non applicable, art. 293 B du CGI';
const PAGES = [
  { path: '/mentions-legales', title: 'Mentions légales', vatNotice: true },
  { path: '/confidentialite', title: 'Politique de confidentialité', vatNotice: false },
  { path: '/cgv', title: 'Conditions générales de vente et d\'utilisation', vatNotice: true },
];
// Ancien éditeur, ancienne adresse, numéro de TVA intracommunautaire (FR + 11 chiffres).
const FORBIDDEN = [/Sarahoui/i, /Bovet/i, /intracommunautaire/i, /\bFR\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{3}\b/];

const report = createReport();
const browser = await launch();

/** Contraste du texte de `selector` sur le premier fond opaque de ses ancêtres. */
function minContrast(page, selector) {
  return page.evaluate((sel) => {
    const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
    const lum = ([r, g, b]) => {
      const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const background = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const c = rgb(getComputedStyle(n).backgroundColor);
        if (c.length >= 3 && (c[3] ?? 1) === 1) return c;
      }
      return [255, 255, 255];
    };
    let min = Infinity;
    for (const el of document.querySelectorAll(sel)) {
      const [a, b] = [lum(rgb(getComputedStyle(el).color)), lum(background(el))];
      min = Math.min(min, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05));
    }
    return Math.round(min * 100) / 100;
  }, selector);
}

try {
  for (const viewport of VIEWPORTS) for (const theme of ['light', 'dark']) {
    const label = `${viewport.name}px ${theme}`;
    console.log(`\n=== ${label}`);
    // Contexte neuf, sans cookie : un visiteur jamais connecté.
    const ctx = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.mobile, hasTouch: viewport.mobile, colorScheme: theme,
    });
    const page = await ctx.newPage();
    const watch = watchConsole(page);
    try {
      for (const { path, title, vatNotice } of PAGES) {
        watch.setLabel(`${label} ${path}`);
        const response = await page.goto(`${BASE}${path}`);
        await page.waitForLoadState('networkidle');
        report.check(response.ok() && new URL(page.url()).pathname === path,
          `${label} ${path} : affichée sans connexion (${response.status()}, ${new URL(page.url()).pathname})`);
        report.check(await page.getByRole('heading', { level: 1, name: title, exact: true }).isVisible(), `${label} ${path} : titre « ${title} »`);

        const text = await page.locator('article.legal').innerText();
        report.check(text.includes(PUBLISHER), `${label} ${path} : éditeur ${PUBLISHER}`);
        if (vatNotice) report.check(text.includes(VAT_NOTICE), `${label} ${path} : « ${VAT_NOTICE} »`);
        const found = FORBIDDEN.filter((r) => r.test(text)).map(String);
        report.check(found.length === 0, `${label} ${path} : ni ancien éditeur ni numéro de TVA${found.length ? ` (${found.join(', ')})` : ''}`);
        report.check(!/[[\]]/.test(text), `${label} ${path} : aucun crochet dans le texte`);

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        report.check(overflow <= 0, `${label} ${path} : aucun débordement horizontal (${overflow}px)`);
        const contrast = await minContrast(page, 'article.legal h1, article.legal h2, article.legal p, article.legal li');
        report.check(contrast >= 4.5, `${label} ${path} : contraste du texte ${contrast}:1 (≥ 4,5)`);

        const footerLinks = await page.locator('.foot-legal a').evaluateAll((as) => as.map((a) => [a.textContent.trim(), a.getAttribute('href')]));
        const legalIndex = footerLinks.findIndex(([, href]) => href === '/mentions-legales');
        report.check(legalIndex >= 0 && footerLinks[legalIndex + 1]?.[0] === 'CGV' && footerLinks[legalIndex + 1]?.[1] === '/cgv',
          `${label} ${path} : pied de page « CGV » après « Mentions légales » (${footerLinks.map(([t]) => t).join(', ')})`);

        const nested = await nestedInteractive(page);
        report.check(nested.length === 0, `${label} ${path} : aucun élément interactif imbriqué${nested.map((n) => `\n      ${n}`).join('')}`);
        await page.screenshot({ path: `results/legal-${path.slice(1)}-${viewport.name}-${theme}.png`, fullPage: true });
      }

      watch.setLabel(`${label} /register`);
      await page.goto(`${BASE}/register`);
      await page.waitForLoadState('networkidle');
      report.check(await page.locator('a[href="/cgv"]').count() === 1 && await page.locator('a[href="/confidentialite"]').count() === 1,
        `${label} /register : liens vers les CGV et la politique de confidentialité`);
    } finally {
      report.check(watch.problems.length === 0, `${label} : console propre${watch.problems.map((p) => `\n      ${p}`).join('')}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
report.finish();
