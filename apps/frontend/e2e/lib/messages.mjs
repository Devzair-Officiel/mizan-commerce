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

/** Position de l'accolade fermante qui répond à celle de `start`. */
function closing(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}' && --depth === 0) return i;
  }
  throw new Error(`ICU mal formé : ${src}`);
}

/** Options `clé {texte}` d'un select ou d'un plural. */
function options(src) {
  const out = {};
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open < 0) break;
    const end = closing(src, open);
    out[src.slice(i, open).trim()] = src.slice(open + 1, end);
    i = end + 1;
  }
  return out;
}

/** Sous-ensemble d'ICU utilisé par nos messages : `{var}`, select, plural (`=n`, `#`). */
function format(src, values, locale, hash) {
  let out = '';
  for (let i = 0; i < src.length; i += 1) {
    if (src[i] === '#' && hash !== undefined) { out += hash; continue; }
    if (src[i] !== '{') { out += src[i]; continue; }
    const end = closing(src, i);
    const [name, type, ...rest] = src.slice(i + 1, end).split(',');
    const value = values[name.trim()];
    i = end;
    if (!type) { out += String(value); continue; }
    const choices = options(rest.join(','));
    if (type.trim() === 'select') {
      out += format(choices[String(value)] ?? choices.other, values, locale, hash);
    } else {
      const n = Number(value);
      const branch = choices[`=${n}`] ?? choices[new Intl.PluralRules(locale).select(n)] ?? choices.other;
      out += format(branch, values, locale, new Intl.NumberFormat(locale === 'ar' ? 'ar-u-nu-latn' : locale).format(n));
    }
  }
  return out;
}

/** Texte d'interface attendu, paramètres ICU appliqués : `fmt('fr', 'articles.list.count', { kind, count })`. */
export function fmt(locale, key, values = {}) {
  return format(msg(locale, key), values, locale);
}
