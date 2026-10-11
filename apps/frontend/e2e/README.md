# Audits navigateur (Playwright)

Scripts lancés **sans Node sur la machine** : service Docker Compose `e2e` (image officielle `mcr.microsoft.com/playwright`, profil `audit`, ne démarre pas avec la stack). Il cible le frontend du réseau compose (`http://frontend:3000`) et se connecte avec le **compte dédié aux audits** `e2e@example.com` (mot de passe `Mizan1234!`, créé par `seed_data`).

```bash
# Depuis la racine du dépôt, stack démarrée (docker compose up -d)
docker compose run --rm e2e                                   # tous les audits
docker compose run --rm e2e npm run audit:pages               # écrans principaux
docker compose run --rm e2e npm run audit:customer-form       # formulaire client
docker compose run --rm e2e npm run audit:zakat               # zakat : erreurs notifiées, plus d'alert()
docker compose run --rm e2e npm run audit:products-list       # liste Articles et services
docker compose run --rm e2e npm run audit:product-form        # formulaire article
docker compose run --rm -e ONLY=clients,articles e2e npm run audit:pages   # écrans choisis
```

Code de sortie 0 = tout est conforme, 1 = au moins une vérification en échec (détaillée dans la sortie).

## Compte et boutique d'audit

- `e2e@example.com` possède sa propre boutique, « Boutique Audit » (France, EUR, articles et services, vente sur place, Boutique+), avec quelques articles, services, clients et commandes (`apps/backend/apps/core/management/commands/_seed_e2e.py`). « Nadia Relance » a une commande impayée : l'audit y teste « Relancer ».
- Les audits créent tout ce dont ils ont besoin **dans cette boutique**, jamais dans celles des autres comptes de démo ; l'audit du formulaire client vérifie à la fin qu'aucun client de test n'existe dans la boutique de Youssef.
- Ils restent **relançables plusieurs fois de suite** : ce qu'ils créent est archivé ou supprimé à la fin, et ce qu'ils modifient est remis en place au début.
- `seed_data --reset` supprime la boutique et la recrée (comptes `@example.*` uniquement).
- `openSession(browser, viewport, { email })` permet, si besoin, de se connecter avec un autre compte de démo.

## Contenu

- `lib/watch.mjs` — **console surveillée** : toute erreur ou tout avertissement en console et toute exception non rattrapée font échouer l'audit ; **éléments interactifs imbriqués** (bouton dans un lien, etc.).
- `lib/session.mjs` — navigateur, connexion (compte `e2e@example.com` par défaut ; une connexion par taille d'écran : la limite `auth` du backend reste basse), langue (`NEXT_LOCALE`) et thème (réponse `/auth/me/` réécrite, préférences du compte intactes).
- `lib/messages.mjs` — textes attendus lus dans `../messages/*.json` (montés en lecture seule) : `msg` (texte brut) et `fmt` (paramètres ICU appliqués : `{var}`, `select`, `plural` avec `=n` et `#`).
- `lib/products.mjs` — appels du backend par le proxy (`api`, `allResults`), création d'un article de test, désactivation en fin d'audit.
- `audit-pages.mjs` — écrans principaux à 1440px et 360px.
- `audit-customer-form.mjs` — gabarit de formulaire sur le formulaire client, à 1440px et 360px, clair et sombre, français et arabe :
  - sections : Identité ouverte avec le badge « Obligatoire », Contact, Adresse et Notes repliées à l'ouverture, avec leur résumé si elles sont remplies (sinon leur explication) ; ouverture au clic, à Entrée et à Espace (`aria-expanded`) ;
  - actions sous la carte, sans cadre, dans le `<form>` ; « Annuler » demande confirmation si le formulaire est modifié ;
  - erreurs : champ obligatoire vide, e-mail invalide (client) et numéro invalide (serveur) dans une section repliée → la section s'ouvre, le focus va sur le champ, l'erreur est sous le champ ;
  - notifications « Client créé » et « Client enregistré », une seule région `aria-live`, placée en bas (mobile) ou dans le coin bas (desktop, à gauche en arabe) ;
  - téléphone : « 06 12 34 56 78 » enregistré en `+33612345678`, affiché `+33 6 12 34 56 78`, « Relancer » ouvre `wa.me/33612345678` ;
  - aucun client de test dans la boutique de Youssef. Les clients créés (« Audit e2e … ») sont archivés à la fin.
- `audit-products-list.mjs` — liste Articles et services à 1440px et 360px, clair et sombre, français et arabe :
  - 25 articles « Audit lot NN » (un tiers en rupture, un tiers en stock faible, un tiers en stock) créés une seule fois, réactivés au début et désactivés à la fin : la liste dépasse une page de 20 ;
  - desktop : titre et nombre total, 20 rangées et « 1 à 20 sur N », page 2 conforme à l'API, tri par l'en-tête « Prix » dans les deux sens (`aria-sort`), nombres du menu « Stock » égaux à `/products/facets/`, filtre appliqué puis retiré ;
  - mobile : 20 rangées puis « Charger plus », rappel du tri, fenêtre Filtres dont le bouton annonce le nombre exact, pastille du filtre ;
  - indicateurs « En rupture » et « Stock faible » : un clic filtre (articles actifs à ce niveau, nombre de l'indicateur), un second le retire ;
  - boutique de services (`services@example.com`) : seul « Services actifs », aucun stock ni type (indicateurs, filtre, colonne, fenêtre Filtres).
- `audit-product-form.mjs` — formulaire article, mêmes tailles, thèmes et langues :
  - création d'un article : Article choisi, unité et son aide, sections repliées, « Nom » obligatoire, photo (PNG), prix d'achat avec marge calculée, stock initial et seuil ; résumés des sections ; « Article créé » ; valeurs relues dans l'API ;
  - modification : bouton désactivé tant que rien ne change, type en badge, unité en lecture seule, résumés dès l'ouverture, stock actuel en lecture seule et lien « Faire une entrée de stock », garde « quitter sans enregistrer », « Article enregistré » ;
  - service : ni unité, ni prix d'achat, ni stock, ni référence ; résumé de la description ; création puis modification du prix ;
  - article à deux formats (« Audit formats ») : informations communes seulement, lien « Gérer les formats » ;
  - boutique de services : ni choix de type, ni unité, ni stock ; boutique de Youssef : aucun article « Audit ». Les articles créés sont désactivés à la fin (il n'existe pas de suppression d'article).
- `audit-zakat.mjs` — un calcul finalisé dont la réouverture échoue (réponse simulée) : l'erreur est notifiée, aucune `alert()` ni boîte de dialogue native. Les calculs créés sont supprimés.

## Exceptions de la console surveillée

Seulement les messages de l'outillage de développement qui ne viennent pas de notre code (`[Fast Refresh]`, `[HMR]`, invitation React DevTools) et l'échec du WebSocket de rechargement à chaud dans l'**aperçu de la page publique** : l'iframe est en `sandbox` sans `allow-same-origin` (origine opaque), le serveur de dev refuse donc ses ressources de développement. C'est attendu en développement ; le sandbox ne doit pas être assoupli (voir `components/public-page-admin/PreviewCard.tsx`).

## Notes

- Version de Playwright figée dans `package.json` ; elle doit correspondre au tag de l'image dans `docker-compose.yml`.
- `next.config.ts` autorise l'hôte `frontend` en développement (`allowedDevOrigins`) et Chromium traite `http://frontend:3000` comme origine sûre (`crypto.randomUUID`).
- Les limites de requêtes `user` et `anon` sont relevées dans `config/settings/local.py` pour que les audits ne les atteignent pas.
