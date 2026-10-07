#!/usr/bin/env node
/**
 * check-i18n.mjs — Vérifie la cohérence des fichiers de traduction.
 * Exit 0 si tout est OK, exit 1 avec détail des problèmes sinon.
 *
 * Règles vérifiées :
 *   1. Toute clé présente dans une langue doit exister dans les trois.
 *   2. Les variables ICU ({name}, {count}…) doivent être identiques
 *      pour une même clé dans les trois langues.
 */

import { readFileSync } from 'fs';
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

// ── Result ────────────────────────────────────────────────────────────────────

if (!hasError) {
  console.log(`✓ i18n OK — ${allKeys.size} clés, ${LANGS.length} langues, variables ICU cohérentes`);
} else {
  process.exit(1);
}
