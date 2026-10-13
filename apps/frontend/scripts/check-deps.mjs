#!/usr/bin/env node
/**
 * check-deps.mjs — Garde-fou des dépendances Base UI.
 * Exit 0 si tout est OK, exit 1 avec la liste des écarts sinon.
 *
 * @base-ui/utils tient l'état partagé des composants Base UI (verrou de défilement, pile des
 * fenêtres ouvertes). Deux copies installées, ou une copie d'une autre version que celle
 * qu'attend @base-ui/react, font deux verrous qui s'ignorent : la page reste bloquée sans
 * défilement après la fermeture d'une fenêtre (commit 6e3b998).
 *
 * Vérifié dans package-lock.json (ce que `npm ci` installera) et dans node_modules (ce qui
 * est installé) :
 *   1. une seule copie de @base-ui/utils ;
 *   2. sa version est exactement celle que déclare @base-ui/react dans ses dépendances.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const UTILS = '@base-ui/utils';
const REACT = '@base-ui/react';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** Copies d'un paquet dans package-lock.json : chemin → { version, dépendances }. */
function lockCopies(name) {
  const { packages = {} } = readJson(join(root, 'package-lock.json'));
  return Object.entries(packages)
    .filter(([path]) => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`))
    .map(([path, pkg]) => ({ path, version: pkg.version, dependencies: pkg.dependencies ?? {} }));
}

/** Copies installées d'un paquet sous node_modules, à toute profondeur. */
function installedCopies(name, dir = join(root, 'node_modules'), found = []) {
  if (!existsSync(dir)) return found;
  const manifest = join(dir, name, 'package.json');
  if (existsSync(manifest)) {
    const pkg = readJson(manifest);
    found.push({ path: relative(root, join(dir, name)), version: pkg.version, dependencies: pkg.dependencies ?? {} });
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.bin') continue;
    const sub = join(dir, entry.name);
    const children = entry.name.startsWith('@') ? readdirSync(sub, { withFileTypes: true }).map((e) => join(sub, e.name)) : [sub];
    for (const child of children) installedCopies(name, join(child, 'node_modules'), found);
  }
  return found;
}

function check(source, copiesOf) {
  const problems = [];
  const utils = copiesOf(UTILS);
  const react = copiesOf(REACT);
  if (utils.length === 0) problems.push(`${source} : ${UTILS} absent`);
  if (utils.length > 1) {
    problems.push(`${source} : ${UTILS} installé ${utils.length} fois (${utils.map((c) => `${c.path}@${c.version}`).join(', ')})`);
  }
  for (const r of react) {
    const wanted = r.dependencies[UTILS];
    if (!wanted) continue;
    for (const u of utils) {
      if (u.version !== wanted) problems.push(`${source} : ${r.path}@${r.version} attend ${UTILS} ${wanted}, ${u.path} est en ${u.version}`);
    }
  }
  return problems;
}

const problems = [...check('package-lock.json', lockCopies), ...check('node_modules', installedCopies)];
if (problems.length) {
  console.error(`✗ deps:check — ${problems.length} écart(s) :`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(`Alignez ${UTILS} sur la version exacte déclarée par ${REACT} (package.json), puis npm install.`);
  process.exit(1);
}
console.log(`✓ deps:check — ${UTILS} installé une fois, version attendue par ${REACT}.`);
