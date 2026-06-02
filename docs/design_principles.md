# Design principles — Mizan

> Lu quand on revoit le design d'une page. Garder court.

## 1. Posture
Je suis un designer produit mobile-first. Je raisonne ergonomie avant esthétique :
- **Qui fait quoi en 1 tap ?** L'action principale est unique et évidente.
- **Pouce-friendly** : zones tappables dans la moitié basse de l'écran, ≥ 44px.
- **1 décision par écran**. Si l'écran demande 2 choix simultanés → BottomSheet.
- **Le moindre détail compte** : alignement pixel, tabular-nums pour les chiffres,
  espacement régulier (gap-3/4/5, pas de valeurs arbitraires).

## 2. Tokens (jamais de couleur brute pour l'identité)
- Identité : `--primary`, `--card`, `--background`, `--muted`, `--foreground`,
  `--muted-foreground`, `--border`, `--destructive` (via Tailwind: `bg-primary`,
  `text-foreground`, etc.).
- Signaux sémantiques uniquement (red/amber/green) : danger, attente, succès.
  Toujours en paire light/dark : `text-amber-600 dark:text-amber-400`.
- Rayons : `rounded-2xl` cartes, `rounded-full` boutons d'action, `rounded-xl` chips.

## 3. Hiérarchie typo
- Heading section : `text-xs font-semibold uppercase tracking-wide text-muted-foreground`
- Titre item : `text-sm font-semibold text-foreground`
- Sous-titre : `text-xs text-muted-foreground`
- Métrique : `text-2xl/3xl/4xl font-bold tabular-nums`
- Jamais de `font-weight` inférieur à 500 sur du texte critique.

## 4. Patterns canoniques (page de référence : Clients + Détail client)
- **Hero card** : avatar/icône + nom + badge contextuel + barre d'actions principales.
- **Stats** : grille 2 colonnes en haut, **cards cliquables = filtres**.
- **Listes** : `rounded-2xl border bg-card` englobant, rows `divide-y divide-border`.
- **Empty state** : icône ronde `bg-muted` + titre + sous-titre, jamais une ligne sèche.
- **Loading** : skeleton `bg-muted animate-pulse`, jamais "Chargement…" seul.
- **Actions secondaires** : BottomSheet, pas de menu déroulant.
- **Confirmation destructive** : `confirm()` natif tant qu'on n'a pas de Dialog stylé.
- **Feedback tactile** : `active:scale-95` ou `active:scale-[0.98]` partout.

## 5. Avant de proposer un redesign (checklist)
1. Quelle action principale ? Est-elle unique et au-dessus du fold pouce ?
2. Les infos secondaires sont-elles regroupées ou dispersées ?
3. Y a-t-il un état vide / chargement / erreur ?
4. Les chiffres sont-ils en `tabular-nums` et alignés à droite ?
5. Y a-t-il des couleurs brutes au lieu des tokens ?
6. Tap targets ≥ 44px ? Espacement ≥ 12px entre éléments cliquables ?
7. Light + dark testés mentalement ?
8. Le pattern existe-t-il déjà ailleurs (Clients/Détail client) ? Suivre, ne pas inventer.

## 6. Quand l'utilisateur partage une capture
1. Identifier l'action principale et la friction principale (1 phrase).
2. Lister 2-4 problèmes UX concrets (pas du goût, du fonctionnel).
3. Proposer un redesign en s'appuyant sur les patterns canoniques (§4).
4. Pas de nouveau composant si un existant peut faire le job.
5. Coder seulement après validation des principes proposés.
