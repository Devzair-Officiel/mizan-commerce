/**
 * Lance les audits, plusieurs à la fois (`AUDIT_JOBS`, 3 par défaut).
 *
 *   node run-audits.mjs                    tous les audits
 *   node run-audits.mjs sales scroll-lock  ceux-là seulement (nom sans « audit- » ni « .mjs »)
 *
 * Chaque audit en cours occupe un emplacement (`AUDIT_SLOT`) : son compte et sa boutique d'audit
 * (e2e@example.com, e2e2@…, recréées par `reset_audit_shop --slots`). Deux audits ne touchent donc
 * jamais aux mêmes données ; les comptes de démo partagés (Youssef, services) ne sont que lus.
 * Les sessions sont partagées (`AUDIT_STATE_DIR`) : peu de connexions malgré la limite 'auth'.
 * Sortie complète de chaque audit dans `results/<audit>.log` ; ici, ses échecs et sa durée.
 */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const AUDITS = [
  'pages', 'customer-form', 'customer-name', 'zakat', 'products-list', 'product-form', 'product-formats',
  'product-photos', 'stock', 'product-sheet', 'loading', 'reminders', 'reminder-form', 'reminders-staff',
  'reminder-timezone', 'order-numbers', 'whatsapp', 'message-templates', 'sales', 'activity-export',
  'scroll-lock', 'header-bands', 'show-more', 'stock-entry-plan',
];

const requested = process.argv.slice(2).map((a) => a.replace(/^audit-/, '').replace(/\.mjs$/, ''));
const unknown = requested.filter((a) => !AUDITS.includes(a));
if (unknown.length) {
  console.error(`Audit(s) inconnu(s) : ${unknown.join(', ')}\nDisponibles : ${AUDITS.join(', ')}`);
  process.exit(2);
}
const queue = requested.length ? requested : [...AUDITS];
const jobs = Math.max(1, Math.min(Number(process.env.AUDIT_JOBS ?? 3) || 1, queue.length));
const stateDir = await mkdtemp(join(tmpdir(), 'audit-sessions-'));
await mkdir('results', { recursive: true });

const seconds = (ms) => `${Math.round(ms / 1000)} s`;
/** Vérifications en échec, avec leurs lignes de détail (indentées sous elles). */
function failures(out) {
  const kept = [];
  let failing = false;
  for (const line of out.split('\n')) {
    if (line.startsWith('  ✗')) failing = true;
    else if (!line.startsWith('      ')) failing = false;
    if (failing) kept.push(line);
  }
  return kept;
}

function run(name, slot) {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn('node', [`audit-${name}.mjs`], {
      env: { ...process.env, AUDIT_SLOT: String(slot), AUDIT_STATE_DIR: stateDir },
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', async (code) => {
      await writeFile(`results/${name}.log`, out);
      const ok = code === 0;
      const lines = ok ? [] : failures(out);
      // Arrêt sans vérification en échec (exception, plantage) : la fin de la sortie.
      if (!ok && lines.length === 0) lines.push(...out.trimEnd().split('\n').slice(-15));
      console.log(`${ok ? '✓' : '✗'} ${name} — ${seconds(Date.now() - start)} (emplacement ${slot})${lines.map((l) => `\n${l}`).join('')}`);
      resolve({ name, ok });
    });
  });
}

const started = Date.now();
console.log(`${queue.length} audit(s), ${jobs} à la fois, configurations ${process.env.AUDIT_MATRIX || 'smoke'}\n`);
const results = [];
await Promise.all(Array.from({ length: jobs }, async (_, i) => {
  for (let name = queue.shift(); name; name = queue.shift()) results.push(await run(name, i + 1));
}));
const failed = results.filter((r) => !r.ok).map((r) => r.name);
console.log(`\n${failed.length ? `ÉCHEC : ${failed.join(', ')}` : 'TOUT EST CONFORME'} — ${results.length} audit(s) en ${seconds(Date.now() - started)}`);
process.exitCode = failed.length ? 1 : 0;
