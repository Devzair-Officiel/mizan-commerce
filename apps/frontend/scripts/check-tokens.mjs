#!/usr/bin/env node
/**
 * check-tokens.mjs — Garde-fou des couleurs (design_principles.md §2).
 * Exit 0 si tout est OK, exit 1 avec la liste des occurrences sinon.
 *
 * Règles vérifiées sur les fichiers .tsx de app/ et components/ :
 *   1. Aucune classe de gris de palette Tailwind (zinc|neutral|slate|gray|stone)-N :
 *      les surfaces et textes neutres passent par les tokens (bg-card, bg-muted,
 *      text-foreground, text-muted-foreground, border-border…), qui suivent le thème.
 *   2. Aucune couleur hexadécimale dans un className, ni en valeur arbitraire
 *      Tailwind (bg-[#123456]) : une couleur fixe ne s'adapte pas au mode sombre.
 *
 * Les couleurs de signal (red/amber/green) restent permises, en paire clair/sombre :
 * ce script ne les vérifie pas.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative, sep } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['app', 'components'];

/**
 * Exceptions documentées : préfixe de chemin (relatif à apps/frontend) → raison.
 * Ajouter une entrée ici doit rester exceptionnel et justifié.
 */
const EXCEPTIONS = {
  // Vitrine publique : thème clair fixe, indépendant du thème de l'admin
  // (globals.css, bloc [data-public-page]) ; couleur du commerçant via --page-primary.
  'app/boutique/': 'vitrine publique, thème clair fixe',
  'components/public-page/': 'vitrine publique, thème clair fixe',
  // Icônes posées sur une pastille de couleur fixe (design_principles.md §2).
  'components/ui/ThemeToggle.tsx': 'pastilles de thème à couleur fixe',
  'components/ui/color-picker.tsx': 'pastilles de couleur à choisir',
};

const GRAY = /[\w:-]*\b(?:zinc|neutral|slate|gray|stone)-\d+(?:\/\d+)?/g;
const ARBITRARY_HEX = /-\[#[0-9a-fA-F]{3,8}\]/g;
const CLASS_LITERAL = /className=(?:"([^"]*)"|'([^']*)'|\{\s*`([^`]*)`\s*\})/g;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function exceptionFor(rel) {
  return Object.keys(EXCEPTIONS).find((prefix) => rel.startsWith(prefix));
}

const problems = [];
let scanned = 0;
for (const dir of DIRS) {
  for (const file of walk(join(root, dir))) {
    const rel = relative(root, file).split(sep).join('/');
    if (exceptionFor(rel)) continue;
    scanned++;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const hits = [...line.matchAll(GRAY), ...line.matchAll(ARBITRARY_HEX)].map((m) => m[0]);
      for (const m of line.matchAll(CLASS_LITERAL)) {
        hits.push(...((m[1] ?? m[2] ?? m[3]).match(HEX) ?? []));
      }
      if (hits.length) problems.push(`  ${rel}:${i + 1}  ${[...new Set(hits)].join(', ')}`);
    });
  }
}

if (problems.length) {
  console.error(`✗ Couleurs hors tokens (${problems.length}) :\n${problems.join('\n')}`);
  console.error('\nUtiliser les tokens (bg-card, bg-muted, text-foreground, text-muted-foreground, border-border, bg-primary…)');
  console.error('ou une paire de signal clair/sombre. Exceptions : voir EXCEPTIONS dans scripts/check-tokens.mjs.');
  process.exit(1);
}
console.log(`✓ tokens OK — ${scanned} fichiers, aucun gris de palette ni hexadécimal dans un className`);
