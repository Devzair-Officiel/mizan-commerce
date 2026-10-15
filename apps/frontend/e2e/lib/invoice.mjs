/**
 * Facture fournisseur de test : une page HTML simple capturée en PNG, ou imprimée en PDF avec texte,
 * lue ensuite par la vraie chaîne (OCR pour le PNG, texte lu directement pour le PDF, puis
 * structuration). Gros caractères et tableau net : la lecture reste stable.
 */
const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function invoiceHtml({ supplier, number, date, lines }) {
  const rows = lines.map((l) => `<tr><td>${escape(l.label)}</td><td>${l.quantity}</td><td>${l.price}</td><td>${(Number(l.quantity) * Number(l.price)).toFixed(2)}</td></tr>`).join('');
  const total = lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.price), 0).toFixed(2);
  return `<!doctype html><html><body style="margin:0;padding:48px;width:900px;font:26px Arial,sans-serif;color:#000;background:#fff">
    <h1 style="font-size:40px;margin:0 0 8px">${escape(supplier)}</h1>
    <p style="margin:0 0 32px">12 rue des Artisans, 13001 Marseille</p>
    <p style="margin:0">FACTURE N° ${escape(number)}</p>
    <p style="margin:0 0 32px">Date : ${escape(date)}</p>
    <table style="width:100%;border-collapse:collapse" border="1" cellpadding="12">
      <tr><th align="left">Désignation</th><th>Qté</th><th>Prix unitaire HT</th><th>Total HT</th></tr>${rows}
    </table>
    <p style="margin:32px 0 0;text-align:right">TOTAL HT ${total} EUR</p>
  </body></html>`;
}

/** PNG de la facture (`lines` : `{ label, quantity, price }`, prix avec un point décimal). */
export async function invoicePng(browser, invoice) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await page.setContent(invoiceHtml(invoice));
  const buffer = await page.screenshot({ fullPage: true });
  await page.close();
  return buffer;
}

/** PDF avec texte de la facture (une page A4) : le texte est lu directement, sans OCR. */
export async function invoicePdf(browser, invoice) {
  const page = await browser.newPage();
  await page.setContent(invoiceHtml(invoice));
  const buffer = await page.pdf({ format: 'A4', printBackground: true, scale: 0.75 });
  await page.close();
  return buffer;
}
