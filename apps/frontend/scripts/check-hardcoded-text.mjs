#!/usr/bin/env node
/**
 * check-hardcoded-text.mjs — Garde-fou du texte écrit en dur (interface en fr / en / ar).
 * Exit 0 si tout est OK, exit 1 avec la liste des occurrences sinon.
 *
 * Signale, dans les fichiers .tsx de app/ et components/ :
 *   1. le texte JSX entre balises qui contient au moins une lettre (<p>Enregistrer</p>) ;
 *   2. une chaîne littérale affichée comme enfant JSX ({'Enregistrer'}, {ok ? 'Oui' : 'Non'}) ;
 *   3. une valeur littérale des attributs title, aria-label, placeholder et alt
 *      (title="Fermer", aria-label={`Supprimer ${nom}`}).
 * Ce qui passe par t() (ou toute autre fonction) n'est pas signalé.
 *
 * Analyse par le compilateur TypeScript (déjà présent pour `npm run typecheck`) :
 * une expression régulière confondrait le JSX avec les génériques et les comparaisons.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative, sep } from 'path';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['app', 'components'];
const ATTRIBUTES = new Set(['title', 'aria-label', 'placeholder', 'alt']);

/**
 * Exceptions documentées : préfixe de chemin (relatif à apps/frontend) → raison.
 * Ajouter une entrée ici doit rester exceptionnel et justifié.
 */
const EXCEPTIONS = {
  // Vitrine publique : textes propres, en français, destinés aux clients du commerçant
  // (indépendants de la langue de l'admin).
  'app/boutique/': 'vitrine publique, textes propres',
  'components/public-page/': 'vitrine publique, textes propres',
  // Site marketing : contenu éditorial en français, hors de l'application.
  'app/(marketing)/': 'site marketing',
  'components/marketing/': 'site marketing',
};

/** Noms de marque et termes qui ne se traduisent pas, affichés seuls (« M » : monogramme du logo). */
const BRANDS = new Set([
  'Mizan', 'mizan', 'M', 'WhatsApp', 'Telegram', 'Instagram', 'Facebook', 'TikTok', 'Google', 'Stripe',
  'Boutique+', 'Pro', 'PDF', 'CSV', 'OCR', 'IBAN', 'E-mail', 'SMS', 'EAN',
]);

const LETTER = /\p{L}/u;
/** Variable de modèle affichée telle quelle ({shop_name}) : du code, pas du texte. */
const TEMPLATE_VARIABLE = /^\{[a-z_]+\}$/;

/** Texte à signaler : au moins une lettre (entités HTML exclues), ni marque ni variable de modèle seule. */
function isText(raw) {
  const text = raw.replace(/&(?:[a-z]+|#\d+|#x[0-9a-f]+);/gi, ' ').replace(/\s+/g, ' ').trim();
  return LETTER.test(text) && !BRANDS.has(text) && !TEMPLATE_VARIABLE.test(text);
}

/** Parties littérales d'une expression affichée : les conditions et les appels sont ignorés. */
function literals(expr) {
  if (!expr) return [];
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return [expr.text];
  if (ts.isTemplateExpression(expr)) return [expr.head.text, ...expr.templateSpans.map((s) => s.literal.text)];
  if (ts.isParenthesizedExpression(expr)) return literals(expr.expression);
  if (ts.isConditionalExpression(expr)) return [...literals(expr.whenTrue), ...literals(expr.whenFalse)];
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return literals(expr.right);
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      return [...literals(expr.left), ...literals(expr.right)];
    }
  }
  return [];
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function scan(file, rel, problems) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const report = (node, text) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    problems.push(`  ${rel}:${line + 1}  ${JSON.stringify(text.replace(/\s+/g, ' ').trim())}`);
  };
  const visit = (node) => {
    if (ts.isJsxText(node) && isText(node.text)) report(node, node.text);
    else if (ts.isJsxExpression(node) && ts.isJsxElement(node.parent) || ts.isJsxExpression(node) && ts.isJsxFragment(node.parent)) {
      for (const text of literals(node.expression)) if (isText(text)) report(node, text);
    } else if (ts.isJsxAttribute(node) && ATTRIBUTES.has(node.name.getText(source)) && node.initializer) {
      const init = node.initializer;
      const texts = ts.isStringLiteral(init) ? [init.text] : ts.isJsxExpression(init) ? literals(init.expression) : [];
      for (const text of texts) if (isText(text)) report(node, text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const problems = [];
let scanned = 0;
for (const dir of DIRS) {
  for (const file of walk(join(root, dir))) {
    const rel = relative(root, file).split(sep).join('/');
    if (Object.keys(EXCEPTIONS).some((prefix) => rel.startsWith(prefix))) continue;
    scanned++;
    scan(file, rel, problems);
  }
}

if (problems.length) {
  console.error(`✗ Texte écrit en dur (${problems.length}) :\n${problems.join('\n')}`);
  console.error('\nPasser par t() avec une clé dans messages/fr.json, en.json et ar.json.');
  console.error('Exceptions : voir EXCEPTIONS et BRANDS dans scripts/check-hardcoded-text.mjs.');
  process.exit(1);
}
console.log(`✓ texte OK — ${scanned} fichiers, aucun texte d'interface écrit en dur`);
