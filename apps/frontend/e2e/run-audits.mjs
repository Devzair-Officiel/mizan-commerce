/**
 * Lance les audits, un à la fois par défaut (`AUDIT_JOBS`, 1 ; 2 ou plus selon la mémoire disponible).
 *
 *   node run-audits.mjs                    tous les audits
 *   node run-audits.mjs sales scroll-lock  ceux-là seulement (nom sans « audit- » ni « .mjs »)
 *
 * Chaque audit en cours occupe un emplacement (`AUDIT_SLOT`) : son compte et sa boutique d'audit
 * (e2e@example.com, e2e2@…, recréées par `reset_audit_shop --slots`). Deux audits ne touchent donc
 * jamais aux mêmes données ; les comptes de démo partagés (Youssef, services) ne sont que lus.
 * Les sessions sont partagées (`AUDIT_STATE_DIR`) : peu de connexions malgré la limite 'auth'.
 * Sortie complète de chaque audit dans `results/<audit>.log` ; ici, ses échecs et sa durée.
 * Après chaque audit, aucun navigateur ne doit rester ouvert : un reste compte comme un échec et il est arrêté.
 */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const AUDITS = [
  'pages', 'customer-form', 'customer-name', 'zakat', 'products-list', 'product-form', 'product-formats',
  'product-photos', 'product-scan', 'stock', 'product-sheet', 'loading', 'reminders', 'reminder-form', 'reminders-staff',
  'reminder-timezone', 'order-numbers', 'whatsapp', 'message-templates', 'sales', 'activity-export', 'exports', 'exports-stock',
  'invoice-settings', 'invoices', 'invoice-editor', 'scroll-lock', 'header-bands', 'show-more', 'stock-entry-plan', 'account-menu',
  'sidebar', 'usage', 'settings', 'team', 'profile', 'verify-email', 'legal',
  // Ces deux audits dépassent ensemble 10 refresh/min (limite 'auth' du backend) : subscription,
  // environ 2 min quelle que soit la matrice, sans connexion ni écriture, les sépare.
  'session-refresh', 'subscription', 'session-race',
];

const requested = process.argv.slice(2).map((a) => a.replace(/^audit-/, '').replace(/\.mjs$/, ''));
const unknown = requested.filter((a) => !AUDITS.includes(a));
if (unknown.length) {
  console.error(`Audit(s) inconnu(s) : ${unknown.join(', ')}\nDisponibles : ${AUDITS.join(', ')}`);
  process.exit(2);
}
const queue = requested.length ? requested : [...AUDITS];
const jobs = Math.max(1, Math.min(Number(process.env.AUDIT_JOBS ?? 1) || 1, queue.length));
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

/**
 * Processus Chromium d'audits terminés : leur audit sorti, ils sont rattachés au processus 1, alors que
 * ceux des audits en cours ont encore leur audit pour parent. `chrome_crashpad_handler` (rapports de
 * plantage, minuscule) est ignoré : Chromium le détache lui-même. Les zombies n'ont plus de ligne de commande.
 */
async function orphanBrowsers() {
  const pids = [];
  for (const pid of await readdir('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    const [stat, cmd] = await Promise.all(['stat', 'cmdline'].map((f) => readFile(`/proc/${pid}/${f}`, 'utf8').catch(() => '')));
    // « pid (nom) état ppid … » : le nom peut contenir des espaces, d'où la dernière parenthèse.
    const ppid = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1];
    if (ppid === '1' && /chrom/i.test(cmd) && !cmd.includes('crashpad')) pids.push(Number(pid));
  }
  return pids;
}

/** Navigateurs restés ouverts : 3 s laissées aux processus enfants pour finir, puis arrêt forcé. */
async function leftoverBrowsers() {
  let pids = await orphanBrowsers();
  for (let i = 0; pids.length && i < 30; i++) {
    await sleep(100);
    pids = await orphanBrowsers();
  }
  for (const pid of pids) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* déjà terminé */ }
  }
  return pids.length;
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
      const leftover = await leftoverBrowsers();
      const ok = code === 0 && leftover === 0;
      const lines = code === 0 ? [] : failures(out);
      // Arrêt sans vérification en échec (exception, plantage) : la fin de la sortie.
      if (code !== 0 && lines.length === 0) lines.push(...out.trimEnd().split('\n').slice(-15));
      if (leftover) lines.push(`  ✗ ${leftover} processus Chromium encore ouverts après l'audit (arrêtés)`);
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
