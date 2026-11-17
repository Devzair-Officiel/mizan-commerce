#!/usr/bin/env node
/**
 * check-i18n.mjs — Vérifie la cohérence des fichiers de traduction.
 * Exit 0 si tout est OK, exit 1 avec détail des problèmes sinon.
 *
 * Règles vérifiées :
 *   1. Toute clé présente dans une langue doit exister dans les trois.
 *   2. Les variables ICU ({name}, {count}…) doivent être identiques
 *      pour une même clé dans les trois langues.
 *   3. Les appels t('key') sans second argument ne doivent pas manquer
 *      les variables ICU de premier niveau de la clé FR correspondante.
 *   4. fr.json vouvoie : aucune valeur ne contient tu / ton / ta / tes / toi / t'
 *      (exceptions explicites dans TUTOIEMENT_EXCEPTIONS).
 *   5. Un message qui dépend du type de document ({doc, select, …}) n'est que ce
 *      select, avec les branches invoice, quote et other : chaque branche est une
 *      phrase entière (articles et accords propres au type), jamais un fragment.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(__dirname, '..', 'messages');
const LANGS = ['fr', 'en', 'ar'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = String(v);
    }
  }
  return out;
}

/**
 * Extrait les variables ICU de premier niveau ({varName}) en respectant
 * l'imbrication des accolades pour ne pas confondre le texte des sélecteurs
 * plural/select avec de vraies variables.
 */
function extractIcuVars(str) {
  const vars = new Set();
  let depth = 0;
  let i = 0;
  while (i < str.length) {
    if (str[i] === '{') {
      depth++;
      if (depth === 1) {
        let j = i + 1;
        while (j < str.length && /\w/.test(str[j])) j++;
        if (j > i + 1) vars.add(str.slice(i + 1, j));
      }
    } else if (str[i] === '}') {
      depth--;
    }
    i++;
  }
  return vars;
}

// ── Load ─────────────────────────────────────────────────────────────────────

const flat = {};
for (const lang of LANGS) {
  const raw = JSON.parse(readFileSync(join(messagesDir, `${lang}.json`), 'utf8'));
  flat[lang] = flatten(raw);
}

const allKeys = new Set(LANGS.flatMap((l) => Object.keys(flat[l])));
let hasError = false;

// ── Check 1 : clés manquantes ─────────────────────────────────────────────────

const missing = Object.fromEntries(LANGS.map((l) => [l, []]));
for (const key of allKeys) {
  for (const lang of LANGS) {
    if (!(key in flat[lang])) missing[lang].push(key);
  }
}

for (const lang of LANGS) {
  if (missing[lang].length > 0) {
    console.error(`\n[${lang}] ${missing[lang].length} clé(s) manquante(s) :`);
    for (const k of missing[lang]) console.error(`  - ${k}`);
    hasError = true;
  }
}

// ── Check 2 : variables ICU cohérentes ───────────────────────────────────────

for (const key of allKeys) {
  const present = LANGS.filter((l) => key in flat[l]);
  if (present.length < 2) continue;

  const varsByLang = Object.fromEntries(
    present.map((l) => [l, extractIcuVars(flat[l][key])]),
  );

  const [ref, ...rest] = present;
  const refVars = varsByLang[ref];

  for (const lang of rest) {
    const cmpVars = varsByLang[lang];
    const onlyInRef = [...refVars].filter((v) => !cmpVars.has(v));
    const onlyInCmp = [...cmpVars].filter((v) => !refVars.has(v));
    if (onlyInRef.length > 0 || onlyInCmp.length > 0) {
      console.error(`\n[ICU] ${key} — incohérence entre ${ref} et ${lang} :`);
      if (onlyInRef.length) console.error(`  manque en ${lang} : ${onlyInRef.map((v) => `{${v}}`).join(', ')}`);
      if (onlyInCmp.length) console.error(`  en trop en ${lang} : ${onlyInCmp.map((v) => `{${v}}`).join(', ')}`);
      hasError = true;
    }
  }
}

// ── Check 3 : variables ICU présentes dans les call sites t('key') ───────────

function collectTsxFiles(dir) {
  const files = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return files; }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist') continue;
    const full = join(dir, entry);
    let stat;
    try { stat = statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      files.push(...collectTsxFiles(full));
    } else if (stat.isFile() && (entry.endsWith('.tsx') || entry.endsWith('.ts'))) {
      files.push(full);
    }
  }
  return files;
}

const srcDir = join(__dirname, '..');
const scanDirs = ['app', 'components', 'lib'].map((d) => join(srcDir, d));
const tsxFiles = scanDirs.flatMap(collectTsxFiles);

for (const file of tsxFiles) {
  let src;
  try { src = readFileSync(file, 'utf8'); } catch { continue; }

  // Collect: const varName = useTranslations('namespace')
  const declRe = /\bconst\s+(\w+)\s*=\s*useTranslations\(\s*['"]([^'"]+)['"]\s*\)/g;
  const varNsMap = {};
  let declMatch;
  while ((declMatch = declRe.exec(src)) !== null) {
    varNsMap[declMatch[1]] = declMatch[2];
  }
  if (Object.keys(varNsMap).length === 0) continue;

  // For each translation variable, find t('key') calls WITHOUT a second argument
  for (const [varName, ns] of Object.entries(varNsMap)) {
    // Matches varName('key') with no comma after the key string
    const tCallRe = new RegExp(`\\b${varName}\\(\\s*['"]([^'"]+)['"]\\s*\\)`, 'g');
    let tMatch;
    while ((tMatch = tCallRe.exec(src)) !== null) {
      const key = tMatch[1];
      const fullKey = `${ns}.${key}`;
      if (!(fullKey in flat['fr'])) continue;
      const icuVars = extractIcuVars(flat['fr'][fullKey]);
      if (icuVars.size === 0) continue;
      const lineNum = src.slice(0, tMatch.index).split('\n').length;
      const relPath = file.replace(srcDir + '/', '');
      console.error(`\n[ICU-CALLSITE] ${relPath}:${lineNum} — ${varName}('${key}') manque {${[...icuVars].join(', ')}} (${fullKey})`);
      hasError = true;
    }
  }
}

// ── Check 4 : vouvoiement dans fr.json ───────────────────────────────────────
//
// L'interface en français vouvoie. Les limites de mot tiennent compte des lettres
// accentuées (« Prêtes », « côtes » ne sont pas des « tes »).

const TUTOIEMENT_RE = /(?<![\p{L}\p{N}_])(?:tu|ton|ta|tes|toi)(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])t['’]/iu;

// Clés fr dont la valeur contient légitimement l'une de ces formes, avec la raison.
const TUTOIEMENT_EXCEPTIONS = new Map([
  // ['namespace.cle', 'raison'],
  ['settings.upgrade.text', 'le ton des messages (nom)'],
  ['settings.management.messages_subtitle', 'le ton des messages (nom)'],
  ['settings.messages.tone_title', 'le ton des messages (nom)'],
  ['settings.messages.tone_aria', 'le ton des messages (nom)'],
  ['settings.messages.reset', 'le ton des messages (nom)'],
  ['settings.messages.text_required', 'le ton des messages (nom)'],
]);

for (const [key, value] of Object.entries(flat['fr'])) {
  if (TUTOIEMENT_EXCEPTIONS.has(key)) continue;
  const match = value.match(TUTOIEMENT_RE);
  if (match) {
    console.error(`\n[VOUVOIEMENT] fr ${key} — « ${match[0]} » : ${value}`);
    hasError = true;
  }
}

// ── Check 5 : messages par type de document ({doc, select, …}) ──────────────

const DOC_BRANCHES = ['invoice', 'quote', 'other'];

/** Branches de premier niveau d'un select (`nom {texte}`), ou `null` s'il reste du texte autour. */
function docBranches(value) {
  const body = value.trim();
  const head = body.match(/^\{\s*doc\s*,\s*select\s*,/);
  if (!head || !body.endsWith('}')) return null;
  const names = [];
  let depth = 0;
  let name = '';
  for (let i = head[0].length; i < body.length - 1; i++) {
    const c = body[i];
    if (c === '{') { if (depth === 0) names.push(name.trim()); depth++; name = ''; }
    else if (c === '}') { depth--; if (depth < 0) return null; }
    else if (depth === 0) name += c;
  }
  return depth === 0 && !name.trim() ? names : null;
}

for (const lang of LANGS) {
  for (const [key, value] of Object.entries(flat[lang])) {
    if (!/\{\s*doc\s*,\s*select\s*,/.test(value)) continue;
    const names = docBranches(value);
    if (!names || names.length !== DOC_BRANCHES.length || DOC_BRANCHES.some((b) => !names.includes(b))) {
      console.error(`\n[DOC] ${lang} ${key} — le message doit être un seul {doc, select, invoice {…} quote {…} other {…}} : ${value}`);
      hasError = true;
    }
  }
}

// ── Result ────────────────────────────────────────────────────────────────────

if (!hasError) {
  console.log(`✓ i18n OK — ${allKeys.size} clés, ${LANGS.length} langues, variables ICU cohérentes, call sites vérifiés, vouvoiement, messages par type de document`);
} else {
  process.exit(1);
}
