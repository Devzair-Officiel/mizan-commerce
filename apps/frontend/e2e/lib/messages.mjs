import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Dans le conteneur, apps/frontend/messages est monté en /messages (voisin de /e2e).
const DIR = fileURLToPath(new URL('../../messages/', import.meta.url));
const cache = new Map();

/** Texte d'interface attendu pour `locale` (clé pointée, sans paramètres ICU). */
export function msg(locale, key) {
  if (!cache.has(locale)) cache.set(locale, JSON.parse(readFileSync(`${DIR}${locale}.json`, 'utf8')));
  const value = key.split('.').reduce((node, part) => node?.[part], cache.get(locale));
  if (typeof value !== 'string') throw new Error(`Message introuvable : ${locale} ${key}`);
  return value;
}
