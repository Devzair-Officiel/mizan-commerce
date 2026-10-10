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
  Toujours en paire light/dark. Pour du texte normal (≥ 12px) : `text-amber-700 dark:text-amber-400`
  et `text-red-700 dark:text-red-400`. Pour les grandes métriques ou les badges : `text-amber-600`/`text-red-600`.
  Ne jamais utiliser `-500` sur fond clair (contraste insuffisant WCAG).
- **Exception — icônes sur fond de swatch fixe** : les icônes incrustées dans un swatch de couleur (ThemeToggle, ColorPicker) sont évaluées contre la couleur du swatch lui-même, pas contre le thème actif. Pas de paire `dark:` requise sur ces icônes précises.
- Rayons : `rounded-2xl` cartes, `rounded-full` boutons d'action, `rounded-xl` chips.
- **Libellés de bouton** : un libellé de bouton ne revient jamais à la ligne — `whitespace-nowrap` obligatoire. Si le label est trop long à 360 px, le raccourcir (troncature `truncate` en dernier recours). Le composant `<Button>` applique déjà `whitespace-nowrap` ; les `<button>` natifs doivent l'ajouter manuellement.

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
- **Contenu** : conteneur `max-w-400 mx-auto px-6 pt-8`. Le conteneur fournit le padding latéral desktop ; TopBar et pages utilisent `p-4` / `px-4`, jamais de `lg:px-*` dans une page. Pages formulaires (settings, profil, édition client/produit) : ajouter `max-w-3xl mx-auto w-full` sur leur div ou form racine pour éviter l'étirement sur très grand écran.
- **TopBar desktop** : non-sticky, pas de blur/border, titre `text-[28px] font-semibold tracking-tight` aligné à gauche, lien retour au-dessus du titre, barre de recherche `h-11 w-80 rounded-full bg-card border border-border` à droite. Le breadcrumb reste mobile uniquement (`lg:hidden`).
- **Propriétés logiques** : toujours `ms/me/ps/pe/start/end` (jamais `ml/mr/pl/pr/left/right`) pour le support RTL.
- **Action de création** : chaque page de liste porte sa propre action de création dans l'en-tête, à droite du titre (« Nouvelle commande », « Nouveau client »…), voir §9. « Nouvelle vente » reste dans la sidebar comme raccourci global. Une seule CTA principale par écran : pas d'autre bouton primaire dans la page.
- **Bandeau unique** : la carte d'essai (`SidebarTrialCard`) vit dans la sidebar desktop. Ne jamais afficher deux bandeaux d'information simultanément.
- **Couleur réservée aux signaux** : les titres de section de la sidebar sont `text-muted-foreground` (neutre), pas `text-primary`. La couleur primaire reste réservée aux états actifs et aux signaux.
- **Menu compte ancré** : sur grand écran, le menu compte (Base UI `side="top"`) remplace le BottomSheet pour les actions de compte — exception au pattern §4 « Actions secondaires : BottomSheet ».
- **Filtres en menu** : sur grand écran, les filtres d'une liste s'ouvrent dans un Base UI Menu (`FilterMenuButton`) — autre exception au §4. Sur mobile, ils restent dans la feuille « Filtres ».
- **`hideSearch` sur TopBar** : passer `hideSearch` sur toute page qui possède son propre champ de recherche (Commandes, Catalogue, Clients) et sur toute page de création/édition (Nouvelle vente, nouveau produit/client, édition produit/client). La recherche globale reste visible sur le tableau de bord et les pages de détail sans champ local.

## 8. Navigation mobile (< lg)

Trois types d'écrans — règle fixe :

| Type | Contenu TopBar gauche | Barre du bas |
|------|-----------------------|--------------|
| **Page de rubrique** (accueil, commandes, clients, catalogue, factures, stock, rappels, notes, zakat, paramètres) | Menu burger | Visible |
| **Page de détail** (une commande, un client, un article, une facture, un calcul…) | Flèche retour (`back`) | Visible |
| **Écran de saisie** (nouvelle vente, création/modification, entrée/sortie de stock, import facture) | Flèche retour (`back`) | **Visible** |

Application :
- Passer `back` sur les pages de détail et de saisie. La barre du bas est toujours visible — même sur les écrans de saisie.
- Sur les écrans de saisie, la `MobileSubmitBar` se place juste au-dessus de la barre du bas (`bottom: calc(3.5rem + env(safe-area-inset-bottom, 0px))`), version compacte (`py-2`, bouton `h-11`). Le contenu de la page conserve assez de `pb` pour ne pas être caché derrière les deux barres.
- **Garde de saisie** : si l'utilisateur a commencé à saisir (articles ou client renseignés), quitter par la barre du bas, le BurgerMenu ou la flèche retour déclenche une confirmation native (`window.confirm`). La page appelle `registerDirtyChecker` à l'effet et `unregisterDirtyChecker` au démontage.
- **Plus de fil d'Ariane sur mobile** : le `<Breadcrumb>` est supprimé ; la flèche retour suffit.
- **Bandeau d'essai dans le menu** : `SidebarTrialCard` vit exclusivement dans le BurgerMenu. Un seul point d'accès, jamais deux bandeaux simultanés.
- **Barre du bas** : 5 emplacements fixes (Accueil, Clients, Vendre au centre, Commandes, Catalogue). `bg-card border-t`. Onglet actif : icône dans pastille `bg-secondary`, libellé `text-primary font-semibold`. « Vendre » : bouton `h-14 w-14`, `ring-4 ring-card`, `-mt-7` → `/orders/new` direct. Badge : style neutre `bg-muted text-foreground` avec liseré `border-card`.
- **BurgerMenu** : `bg-card`, entièrement défilable (pas de pied fixe). En-tête avec carré `M` bg-primary + nom boutique. Groupes issus de `lib/navigation.tsx`, sans les entrées déjà dans la barre du bas. Badge Stock : `bg-destructive/10 text-destructive`. Badge Rappels : `bg-muted text-foreground`.

## 9. Gabarit des pages de liste

Référence : Commandes (`docs/maquettes/model-commandes.html`). S'applique à Clients, Articles et services, Stock, Rappels, Factures. Composants génériques dans `components/list/` et `components/ui/StatCard.tsx` ; état dans l'URL via `lib/hooks/useListUrlState.ts`.

Cinq zones, dans cet ordre, espacées de `gap-5` sur desktop :

1. **En-tête** — `TopBar` avec `hideSearch`. À gauche : titre + nombre total en sous-titre (« 50 commandes »). À droite : l'action de création de la page, `ListCreateButton` (`h-11 rounded-full`, primaire, icône `Plus`).
2. **Indicateurs** — grille de 3 `StatCard` (`gap-4`). Libellé `text-[0.8125rem]` muted, pastille d'icône 30 px, valeur `26px font-bold`, sous-texte muted. Ton `neutral | amber | green | red` pour la pastille ; `toneValue` colore aussi la valeur (montant à encaisser). Une carte cliquable **applique un filtre** à la liste (`onClick` + `pressed`, bouton bascule) ; un second clic le retire. Pas de carte purement décorative.
3. **Barre d'outils** — `ListToolbar` (`role="search"`). Recherche à gauche, largeur fixe ~21rem, `h-10 rounded-full`, libellé masqué visuellement (`sr-only`), placeholder qui dit quoi chercher. Puis un `FilterMenuButton` par filtre (« Statut  Tous ▾ ») : Base UI Menu à choix unique (`Menu.RadioGroup`), valeur active en `font-semibold`. **Jamais de `<select>` natif.** Lien « Effacer les filtres » seulement si un filtre est actif (il garde le tri). À droite, le tri courant en toutes lettres (« Trié par date, plus récentes d'abord »).
4. **Tableau** — `DataTable` avec colonnes déclarées (`key` = champ de tri DRF, `header`, `align`, `sortable`, `firstDirection`, `primary`, `cell`). En-têtes sur `bg-muted`, `text-xs font-semibold` en casse normale, couleur `color-mix(in srgb, var(--foreground) 72%, var(--muted))`. En-tête triable = bouton : flèche sur la colonne triée, double flèche discrète (opacité 60 %) sinon ; `aria-sort` sur le `th` ; un clic inverse le sens. Dates et montants commencent en décroissant. Ligne entière cliquable vers le détail (`hover:bg-muted/50`, curseur main) ; la cellule `primary` contient le vrai lien (clavier, clic droit, ctrl+clic). Ligne inactive (annulée, archivée) en `text-muted-foreground`. Cellules `px-5 py-3.5`, montants `text-end tabular-nums`.
5. **Pied** — `DataTablePagination` dans la carte du tableau : « 1 à 20 sur 50 » à gauche ; à droite précédente, pages numérotées (ellipse au-delà de 7 pages, jamais pour cacher une seule page), suivante. Page courante `bg-secondary` + `aria-current="page"`.

**URL = état.** Recherche, filtres, tri et page vivent dans l'URL : un lien depuis l'Accueil (`/orders?due=true`) ouvre la liste filtrée, et le bouton retour restaure l'état précédent. Filtres, tri et page ajoutent une entrée d'historique ; la recherche remplace l'entrée courante après 300 ms de pause. Le tri par défaut n'apparaît pas dans l'URL. Changer un filtre ou le tri revient à la page 1.

**Backend.** Chaque liste expose ses `ordering_fields` ; un statut se trie dans l'ordre du parcours (annotation `Case/When`), pas alphabétiquement, avec un départage stable par date. Les indicateurs viennent d'un endpoint `GET /api/<app>/summary/` (service + vue fine), avec la même définition que le filtre qu'ils appliquent.

**Équivalent mobile (< lg).** Pas d'indicateurs ni de tableau : recherche toujours visible + bouton « Filtres » qui ouvre une feuille (BottomSheet) contenant « Trier par » puis les filtres ; filtres actifs en puces retirables sous la recherche ; liste en cartes (groupées par date quand le tri est par date, liste simple sinon) avec « Charger plus ». Le tri et les filtres utilisent les mêmes paramètres d'URL que le desktop.
