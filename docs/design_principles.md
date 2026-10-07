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
- **Exception — icônes sur fond de swatch fixe** : les icônes incrustées dans un swatch de couleur (ThemeToggle, ColorPicker) sont évaluées contre la couleur du swatch lui-même, pas contre le thème actif. Pas de paire `dark:` requise sur ces icônes précises.
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
9. Pour une action destructive : le focus par défaut est-il sur l'option non-destructive, et la fermeture est-elle bloquée pendant l'exécution ?

## 6. Quand l'utilisateur partage une capture
1. Identifier l'action principale et la friction principale (1 phrase).
2. Lister 2-4 problèmes UX concrets (pas du goût, du fonctionnel).
3. Proposer un redesign en s'appuyant sur les patterns canoniques (§4).
4. Pas de nouveau composant si un existant peut faire le job.
5. Coder seulement après validation des principes proposés.

## 7. Grand écran (≥ lg)

- **Sidebar** : 240 px fixe, `inset-s-0` (logique RTL). Groupes de navigation avec titres `text-xs font-semibold uppercase tracking-wide text-muted-foreground`. Entrée active : `bg-secondary text-secondary-foreground font-semibold`, icône `text-primary`. Menu compte ancré en bas, ouvre un Base UI Menu `side="top"`.
- **Contenu** : conteneur `max-w-300 mx-auto px-6 pt-8`. Le conteneur fournit le padding latéral desktop ; TopBar et pages utilisent `p-4` / `px-4`, jamais de `lg:px-*` dans une page.
- **TopBar desktop** : non-sticky, pas de blur/border, titre `text-[28px] font-semibold tracking-tight` aligné à gauche, lien retour au-dessus du titre, barre de recherche `h-11 w-80 rounded-full bg-card border border-border` à droite. Le breadcrumb reste mobile uniquement (`lg:hidden`).
- **Propriétés logiques** : toujours `ms/me/ps/pe/start/end` (jamais `ml/mr/pl/pr/left/right`) pour le support RTL.
- **Action de création unique** : « Nouvelle vente » vit dans la sidebar, pas dans les pages. Une seule CTA principale par écran ; ne pas dupliquer l'action en TopBar.
- **Bandeau unique** : la carte d'essai (`SidebarTrialCard`) vit dans la sidebar desktop. Ne jamais afficher deux bandeaux d'information simultanément.
- **Couleur réservée aux signaux** : les titres de section de la sidebar sont `text-muted-foreground` (neutre), pas `text-primary`. La couleur primaire reste réservée aux états actifs et aux signaux.
- **Menu compte ancré** : sur grand écran, le menu compte (Base UI `side="top"`) remplace le BottomSheet pour les actions de compte — exception au pattern §4 « Actions secondaires : BottomSheet ».
