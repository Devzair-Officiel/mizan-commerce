# Plan d'avancement — SaaS commerçants

> Fichier vivant : on coche au fur et à mesure. Format Markdown standard, lisible sur GitHub, GitLab, VS Code, Obsidian.
>
> **Convention** :
> - `[ ]` = à faire
> - `[~]` = en cours (remplacer manuellement par cette syntaxe)
> - `[x]` = fait
>
> Mettre à jour la date dans **Dernière mise à jour** quand on touche au fichier.

**Dernière mise à jour** : 2026-10-28
**En production depuis le 27/10/2026** : https://mizan-commerce.com, commit `0ceef86` (validé en exploitation le 27/10/2026)
**Version actuelle en développement** : Phase V3 — Page web publique / vitrine (démarrée), Phase V2 largement avancée (WhatsApp fait, Telegram abandonné : pas de publications automatiques)

---

## Phase 0 — Setup initial du projet

### Dépôt & organisation

- [x] Créer le dépôt Git (monorepo `saas-commerce/`)
- [x] Initialiser l'arborescence : `apps/frontend`, `apps/backend`, `apps/ai-service`, `infra/`, `docs/`
- [x] Ajouter `.gitignore` adapté Python + Node
- [x] Ajouter `README.md` racine
- [x] Copier les 3 documents de contexte dans `docs/` (URS, fiche technique, instructions) — instructions archivées et périmées : `docs/archive/project_instructions_saas_commercants.md` (2026-10-28)
- [ ] Créer la branche `main` protégée + branche `develop`

### Environnement local

- [x] Créer `docker-compose.yml` avec services : `postgres`, `redis`, `backend`, `frontend`, `ai-service`, ~~`nginx`~~ (absent de `docker-compose.yml` ; Caddy en production, `deploy/edge` — 2026-10-28)
- [x] Créer `.env.example` (sans secrets)
- [x] Documenter le démarrage local dans `README.md`
- [x] Tester `docker compose up` jusqu'à avoir tous les services qui démarrent

### Backend Django de base

- [x] Initialiser projet Django + Django REST Framework
- [x] Configurer la base PostgreSQL (locale via Docker)
- [x] Configurer les settings (`base.py`, `local.py`, `production.py`)
- [x] Mettre `DEBUG=False` par défaut, activer uniquement en local
- [x] Configurer CORS, CSRF, cookies sécurisés
- [x] Configurer Celery + Celery Beat avec Redis
- [~] Mettre en place Sentry (DSN en env var, désactivé en local) — backend et frontend, inactifs sans DSN (fiche technique §15) ; reste à créer le projet Sentry et renseigner les DSN

### Frontend Next.js de base

- [x] Initialiser projet Next.js + TypeScript
- [x] Installer Tailwind CSS + shadcn/ui
- [x] Installer React Hook Form + Zod
- [x] Installer TanStack Query
- [x] Mettre en place le client API avec gestion du token d'auth
- [x] Créer le layout mobile-first de base (header + bottom nav)

### Infrastructure OVH (peut être différé)

- [x] Créer un VPS ou Public Cloud Instance OVH — VPS OVH à Gravelines, 7,6 Go, projets `mizan-staging` et `mizan-production`, réseau `edge` (validé en exploitation le 27/10/2026) ; procédure : docs/exploitation/deploiement.md, `deploy/`
- ~~Provisionner PostgreSQL managé OVHcloud~~ — remplacé par PostgreSQL 16 en conteneur sur le VPS
- [x] PostgreSQL 16 en conteneur (image `deploy/postgres` avec WAL-G, volume nommé, `deploy/app/compose.yml`) — en service en production (validé en exploitation le 27/10/2026) ; sauvegardes : section Backups
- [~] Provisionner le bucket privé de production (`mizan-production-private`, et `mizan-staging-private` pour staging, prévus dans `deploy/env/*.env.example`), distinct de `mizan-private` (bucket de développement, jamais partagé avec la production) + un bucket public si besoin — `mizan-production-private` créé à Gravelines, chiffré SSE-OMK (constaté le 28/10/2026) ; `mizan-staging-private` non vérifié
- [x] Configurer un nom de domaine + HTTPS (Let's Encrypt via Caddy, `deploy/edge`) — `deploy/edge/sites/production.caddy`, www redirigé vers le domaine nu, enregistrements DNS dans docs/exploitation/deploiement.md (validé en exploitation le 27/10/2026)
- [x] Configurer un domaine de staging séparé — `staging.mizan-commerce.com` derrière une authentification basique (`deploy/edge/sites/staging.caddy`) ; staging arrêté hors validation (validé en exploitation le 27/10/2026)

### CI/CD

- [~] Configurer GitHub Actions (ou GitLab CI) — `.github/workflows/ci.yml`, Dependabot ; reste à protéger `main` : ruleset créé mais non appliqué (dépôt privé sans GitHub Team, constaté le 28/10/2026, docs/ci.md)
- [~] Pipeline : lint → tests backend → tests frontend → build Docker → déploiement staging — images publiées sur GHCR à chaque push sur `main` ; déploiement staging manuel (`deploy/deploy.sh`)
- [~] Tests obligatoires multi-tenant (un user de boutique A ne voit pas la boutique B) — dans `pytest`, obligatoires une fois `backend` requis sur `main`

---

## Phase V1 — MVP : Gestion interne

> Objectif : résoudre le désordre quotidien du commerçant.
> URS-001 à URS-041 + URS-061 à URS-063.

### Authentification & compte (URS-001 à URS-003)

- [x] Modèle `User` (Django custom user model)
- [x] Endpoint inscription email + mot de passe
- [x] Endpoint connexion (JWT) + persistance mobile (refresh 30j)
- [x] Endpoint mot de passe oublié + email de reset
- [x] Validation email à l'inscription
- [~] Correctif : jeton de vérification d'e-mail dédié (`apps/accounts/tokens.py`), toujours valable après une connexion ou un changement de mot de passe, invalidé par un changement d'adresse ; validité `EMAIL_VERIFICATION_TIMEOUT` (7 jours) ; les e-mails d'inscription, de renvoi et de réinitialisation annoncent la durée de leur réglage (`validity_label`, `apps/accounts/formatting.py`) au lieu de « 24 heures » en dur
- [x] Correctif : lien de vérification d'e-mail ouvert par un utilisateur déjà connecté (validé sur staging le 2026-10-26)
- [~] Correctif : course de rafraîchissement des jetons et boucle /login ↔ /dashboard (2026-10-26) — fenêtre de grâce de 30 s en mémoire, clé = empreinte du jeton (`lib/refresh-flights.ts`) ; échec définitif : 401 `session_expired`, les deux cookies effacés, une seule navigation vers `/login?session=expired` que `proxy.ts` ne renvoie jamais vers `/dashboard` ; journal `session_refresh_failed` / `session_refresh_graced` sans valeur sensible (`lib/session-log.ts`) ; audit `session-race`, `npm run test:session` ; reste la recette staging (docs/exploitation/deploiement.md §11)
- [~] Isolation staging/production : API_URL par alias unique mizan-<env>-backend (défaut constaté sur staging) (2026-10-26) — alias ajouté à `DJANGO_ALLOWED_HOSTS` par Compose ; garde-fou `deploy/check-api-url.sh` dans `deploy.sh`, contrôle statique `deploy/check-compose.sh` (job CI `deploy`), test local `deploy/edge/test-isolation.sh` (100/100 par environnement) ; ~~reste le redéploiement de staging et de la production~~ (docs/exploitation/deploiement.md §16) — commits `3f2c94a`, `6e55590`, production à `0ceef86` (validé en exploitation le 27/10/2026) ; redéploiement de staging non attesté (condition non remplie, décochée le 2026-10-28)
- [x] Pages frontend : inscription, connexion
- [x] Page mot de passe oublié (frontend)
- [x] Tests unitaires + multi-tenant

### Boutique / espace commerçant (URS-004, URS-005)

- [x] Modèle `Shop` (nom, devise, pays)
- [x] Modèle `ShopMember` (rôles `owner` / `admin` / `staff` + `permissions` JSONField)
- [x] Création automatique de boutique à l'inscription
- [x] Endpoints CRUD `Shop` (filtré par membership)
- [x] Page paramètres boutique (modifier nom, devise, pays)

### Gestion d'équipe & RBAC (URS-102)

- [x] Modèle `ShopMember` : rôles `owner` (créateur, indélébile) / `admin` (accès complet) / `staff` (accès filtré par modules)
- [x] Champ `permissions` JSONField sur `ShopMember` : liste de modules accessibles pour les `staff`
- [x] Modules toggleables : `products`, `orders`, `customers`, `payments`, `invoices`, `stock`, `messages`, `dashboard`
- [x] Modules admin-only (jamais délégables au staff) : `zakat`, `settings`
- [x] Service `create_staff_member` : création directe par l'admin (email + mot de passe), pas d'email d'invitation
- [x] Endpoint `/api/shop/members/` (liste, création, modification, suppression) avec permission `IsShopAdmin`
- [x] Endpoint `/api/me/` enrichi avec `membership.role`, `membership.is_admin`, `membership.permissions`
- [x] Hook frontend `useMe()` exposant la membership courante + constantes `TOGGLEABLE_MODULES`
- [x] Composant `AccessGuard` (props `module` ou `adminOnly`) avec layouts Next.js par module
- [x] Filtrage des entrées de navigation (`BurgerMenu`, `DesktopSidebar`, `BottomNav` + FAB) selon les permissions
- [x] Page `/settings/team` : liste des membres, ajout, édition rôle/permissions, suppression (auto-protection + protection owner)
- [x] Traductions complètes fr / en / ar pour la gestion d'équipe et les écrans 403
- [x] Formule Boutique+ (URS-102) : ajout et modification d'un membre refusés côté serveur ; hors formule, page Équipe = carte de mise à niveau + liste en lecture seule (retrait possible)
- [x] Suspension des employés et admins d'une boutique sans Boutique+ : `ShopMemberJWTAuthentication` (point unique, code `staff_suspended_plan`), écran `/suspended`, accès rétabli automatiquement au retour en Boutique+

### Tableau de bord (URS-006, URS-007)

- [x] Endpoint `/api/dashboard/today` agrégeant : commandes à préparer, paiements en attente, produits stock faible, rappels du jour
- [x] Page dashboard mobile-first
- [x] Boutons accès rapide : Nouvelle vente, Ajouter produit, Ajouter client

### Produits (URS-008 à URS-012)

- [x] Modèles `Product`, `ProductImage`
- [x] Endpoints CRUD produits (filtrés `shop_id`)
- [x] Upload photo produit vers Object Storage
- [x] Page liste produits avec recherche par nom/référence
- [x] Formulaire ajout/modification produit
- [x] Désactivation produit (soft delete via `is_active`)
- [x] Filtre "produits actifs uniquement" par défaut

### Stock (URS-013 à URS-017)

- [x] Modèle `StockMovement` (entrées, sorties, ajustements)
- [x] Règle : la quantité produit dérive **toujours** de la somme des mouvements
- [x] Endpoint historique des mouvements
- [x] Endpoint ajout entrée stock (réassort)
- [x] Endpoint ajout sortie stock (perte/casse) avec raison obligatoire
- [x] Pages frontend entrée/sortie stock
- [x] Champ seuil d'alerte sur produit
- [x] Affichage "stock faible" sur dashboard et fiche produit (propriétés calculées)
- [x] Affichage "rupture" sur la liste produits (propriété calculée)

### Clients (URS-018 à URS-021)

- [x] Modèle `Customer` (nom, téléphone, adresse, note)
- [x] Endpoints CRUD clients
- [x] Page liste clients avec recherche
- [x] Fiche client : historique commandes, montants, paiements en attente, dernière commande
- [x] Bouton "marquer à relancer" → crée un `Reminder` lié

### Commandes (URS-022 à URS-027)

- [x] Modèles `Order`, `OrderItem`
- [x] Statuts paiement : `unpaid`, `partial`, `paid`
- [x] Statuts préparation : `draft`, `to_prepare`, `prepared`, `shipped`, `cancelled`
- [x] Calcul automatique du total (lignes + livraison − remise)
- [x] Création commande avec ou sans client
- [x] Réservation stock automatique au passage en `to_prepare` (création d'un `StockMovement`)
- [x] Restauration stock à l'annulation
- [x] Impossibilité de supprimer une commande (uniquement annuler)
- [x] Page liste commandes avec filtres par statut
- [x] Page détail commande

### Notes & rappels (URS-032 à URS-035)

- [x] Modèle `Note` (lié à client / commande / libre)
- [x] Modèle `Reminder` (titre, date, statut)
- [x] Endpoints CRUD notes et rappels
- [x] Affichage des rappels du jour sur dashboard
- [x] Marquer un rappel comme terminé

### Zakat commerciale (URS-036 à URS-041)

Remplacée par la refonte ci-dessous (lots Z1 à Z3).

- [x] Modèle `ZakatCalculation`
- [x] Champ date annuelle de zakat sur boutique ou utilisateur
- [x] Calcul automatique de la valeur du stock zakatable (somme produits actifs × prix d'achat)
- [x] Saisie liquidités, créances, dettes court terme
- [x] Calcul à 2,5 % avec mention "estimation indicative" en évidence
- [x] Rappel automatique avant la date annuelle
- [x] Possibilité de corriger chaque montant manuellement
- [x] Sauvegarde du calcul dans l'historique

### Zakat — refonte (URS-105 à URS-108, proposées)

Règles, sources et choix d'avis : `docs/zakat_referentiel.md` (relecture par un référent
religieux avant mise en ligne, § 8).

- [x] **Z1 — Moteur et API (backend)** : calcul personnel (`ZakatCalculation.user`, 404 pour
      un autre admin), `ZakatProfile` (jour J, calendrier, seuil, choix d'avis sans valeur par
      défaut, part détenue), une fiche par personne et par année de hawl (409 avec
      `existing_id`), saisies ligne à ligne (créances, autres biens, dettes avec part à
      12 mois, stock hors Mizan), moteur unique `compute_totals` (2,5 % / 2,5775 %, statuts
      `choice_missing` et `nisab_unknown`), `GET/PATCH /api/zakat/profile/`,
      `GET /api/zakat/sources/`, écritures conditionnelles avec `version` (409), audit
      (création, suppression, justificatif), suppression des données zakat au retrait d'un
      membre. Migrations zakat 0007 à 0012 (arrêt sans rien supprimer si une personne a deux
      calculs la même année), core 0004. `finalize` et `reopen` conservés (obsolètes).
      Écran actuel : année déjà calculée (409) → redirection vers la fiche existante ;
      catégorie `loan` libellée « Paiement échelonné » (fr / en / ar).
- [x] **Z2a — Écrans** : accueil `/zakat` (jour J et anneau, une seule action, historique,
      choix repris), `/zakat/new` (fiche créée au clic), assistant `/zakat/[id]?etape=1..7`
      (barre d'étapes et colonne « Votre calcul » sur desktop, « Étape n sur 7 » et barre
      d'action sur mobile ; cartes de choix sans option cochée d'avance, « Continuer »
      désactivé tant que le choix manque ; saisies enregistrées automatiquement), écran
      Résultat (variante « sous le seuil »), `/zakat/reglages` (enregistrement automatique,
      section Zakat retirée des Paramètres), bandeau du tableau de bord (admins, jour J
      réglé). 409 gérés : année déjà prise (lien vers la fiche), conflit de version (fiche
      rechargée). Backend : choix propres à chaque fiche (la plus récente met à jour le
      profil), créances liées aux commandes avec changements signalés, 5 articles les plus
      élevés dans les sources, retrait de `finalize`, `reopen` et `draft/` ; migration
      zakat 0013 (toutes les fiches repassent en brouillon). Audit `audit-zakat` réécrit.
- [x] **Z2b — Justificatif et rappels** : justificatif PDF refondu (choix, date de dernière
      modification ; fr ou en, réservé à son auteur, téléchargement consigné) depuis le Résultat
      et l'historique ; style PDF commun avec les factures (aucune facture changée) ; rappel
      par e-mail de J-7 à J-1, une seule fois (réservation et envoi dans la même transaction),
      réglage et repère de l'accueil ; fiches « Fondement » (9 fiches, tiroir de 440 px sur
      desktop, feuille sur mobile) ouvertes depuis les choix, l'accueil, les repères des autres
      biens et le Résultat. Migration zakat 0014. Audit `audit-zakat` étendu (justificatif,
      tiroir et feuille au clavier).
- [x] **Z3 — Nettoyage** : retrait des anciens champs de `ZakatCalculation` (statut et date
      de finalisation, ventilations des créances, du stock et des dettes, éléments exclus,
      résultat figé, copie du seuil, `pdf_object_key`, `notes`) et des réglages zakat de
      `Shop` (`zakat_annual_date`, `nisab_method`, `nisab_unit_price`, constantes du seuil
      déplacées sur `ZakatProfile`) ; retrait de l'endpoint `stock-estimate` et du code lié.
      Migrations zakat 0015, shops 0010 (après la copie vers le profil, zakat 0009) et
      notes 0004 (suppression des rappels zakat automatiques encore en attente) ; retour
      arrière : colonnes recréées avec leurs valeurs par défaut, sans données. Catégorie de
      rappel `zakat` conservée (filtre de la liste, rappels existants). Aucun changement
      d'écran.
- [x] **Z4 — Suivi à l'encaissement et lignes personnelles** (URS-108, URS-105) : `id` stable
      et `scope` (`shop` / `personal`) sur chaque créance et dette ; suivi calculé à la lecture
      (`zakat/followups.py` : encaissé d'après le reste dû, commande annulée, part des créances
      sûres, options D4 sans valeur par défaut) ; seuls les gestes de la personne s'écrivent
      (`ZakatReceivableFollowUp`, UPDATE conditionnel, journal sans montant) ; « Marquer comme
      versée » sur la fiche (`paid_on`, `paid_amount`) ; carte d'accueil « À verser à
      l'encaissement », état des créances au Résultat et dans le justificatif ; choix
      « Boutique / Personnelle » obligatoire sous 100 % de part, portée `null` tant qu'elle n'est
      pas choisie (« choix à faire » sous 100 %, lignes à préciser listées) ; montant déduit par
      dette fourni par le serveur (`debt_deducted`). Migrations core 0005, zakat 0016 et 0017
      (`id` pour chaque ligne existante, `scope` `null`, `shop` pour une commande). Audit
      `audit-zakat` étendu (versement, portée, suivi).

### Sécurité & droits (URS-061 à URS-063)

- [x] Tous les querysets filtrés par `shop_id` du membre courant (middleware ou mixin)
- [x] Tests anti-fuite multi-tenant (boutique A ↔ boutique B) sur chaque endpoint sensible
- [x] Logs d'audit : modifications stock, suppressions, changements statut commande, exports
- [x] Mots de passe hashés (Django par défaut)
- [x] Rate limiting sur login, inscription, mot de passe oublié
- [x] Photos produits stockées dans bucket privé avec URL signées si pas page publique

### Variantes produits (URS-089 à URS-092)

- [x] Modèle `ProductVariant` (packaging, unité, base_quantity, prix vente/achat, stock, sku, code-barres)
- [x] Au moins une variante active requise pour qu'un produit soit vendable
- [x] Endpoints CRUD variantes (filtrés `shop_id`)
- [x] UI gestion des variantes depuis la fiche produit (`VariantsManager`)
- [x] Sélection de la variante dans la création de commande
- [x] Stock et seuil d'alerte portés par la variante, plus par le produit
- [x] SKU + code-barres en option par variante (préparation scan QR)
- [x] Labellisation `Article` (produits + services) dans la navigation

### Vue stock agrégée (URS-093)

- [x] Page `/stock` regroupant compteurs (actifs, faible, rupture)
- [x] Liste des derniers mouvements (entrée, sortie, réservation, perte, ajustement, libération)
- [x] Actions rapides : entrée stock / sortie stock depuis la page

### Facturation client (URS-094 à URS-099)

- [x] Modèles `Invoice`, `InvoiceLine`, `InvoiceSequence`
- [x] Snapshot complet vendeur (shop) et acheteur (customer/order) à l'émission
- [x] Service `issue_invoice_from_order` atomique avec `select_for_update` sur la séquence
- [x] Numérotation `fact-DDMMYY-NNNN`, compteur continu par boutique, jamais reset
- [x] Calcul total : base TVA = subtotal HT − remise + frais de port (règle FR/UE)
- [x] Synchronisation statut facture ↔ commande (`sync_invoice_from_order` après update paiement / annulation)
- [x] Champ `amount_paid` snapshotté pour affichage paiement partiel sans dépendance commande
- [x] Endpoints liste, détail, émission, changement de statut, téléchargement PDF
- [x] Page liste `/invoices` avec filtres (toutes, émises, payées, annulées)
- [x] Page détail avec pastille dérivée à 4 états (Non payée / Partiel — X € / Payée / Annulée)
- [x] Zone totaux UI : lignes Remise et Frais de port conditionnelles, lignes Payé / Reste à payer pour les partiels
- [x] PDF ReportLab : en-tête, vendeur/acheteur, lignes HT, totaux détaillés, mentions légales, statut paiement
- [x] Mentions légales libres saisies sur la boutique, reprises dans le snapshot et le PDF
- [x] Bouton « Émettre la facture » sur le détail commande quand aucune facture n'existe
- [x] Bouton « Marquer comme payée » caché si la facture est liée à une commande (synchro auto)
- [x] Immutabilité : seul le statut peut changer (vers paid/cancelled), montants et numéro figés

---

## Phase V2 — Communication simple

> URS-066 à URS-069. À démarrer **après** validation du MVP.

### WhatsApp préparé (URS-066, URS-067, URS-031)

- [x] Modèle `PreparedMessage`
- [x] Templates de messages : commande, suivi colis, relance impayé, promo
- [x] Endpoint génération message à partir d'un contexte (commande, client, produit)
- [x] Frontend : édition du message + bouton "Ouvrir WhatsApp" (`https://wa.me/{phone}?text={encodedMsg}`)
- [x] Marquage manuel "envoyé" + date
- [x] Historique des messages préparés
- [x] **Vérifier qu'aucun envoi automatique n'est possible**

### ~~Telegram (URS-068, URS-069)~~

Décision du 2026-10-16 : pas de publications automatiques.

- ~~Modèle `TelegramAccount` (bot token, chat_id cible)~~
- ~~Endpoint connexion bot avec vérification des droits via API Telegram~~
- ~~Modèle `TelegramPublication` (message, image, planification, statut)~~
- ~~Worker Celery Beat qui publie aux heures programmées~~
- ~~Historique des publications~~
- ~~Désactivation d'une publication programmée~~

---

## Phase V3 — Page web publique / vitrine

> URS-070 à URS-078.

### Activation et configuration

- [ ] Modèles `PublicPage`, `PublicPageSection`, `PublicProductVisibility`, `PublicService`, `ContactButton`
- [ ] Génération slug unique pour la page publique
- [ ] Toggle activation / désactivation
- [ ] URL publique `/boutique/[slug]` rendue par Next.js (SSR ou SSG)
- [ ] Thèmes simples (2-3 thèmes initiaux)

### Sections de la page

- [ ] Section header (logo, titre, sous-titre, image de couverture)
- [ ] Section description
- [ ] Section produits (sélection, badges promo/nouveauté/rupture)
- [ ] Section services (titre, description, prix ou "sur devis")
- [ ] Boutons de contact (WhatsApp, Telegram, Instagram, téléphone) + bouton principal
- [ ] Réorganisation et masquage des sections
- [ ] Aperçu mobile + desktop avant publication
- [ ] Gestion brouillon vs publié

### Commande depuis la page

- [ ] Bouton "Commander" produit → ouvre WhatsApp avec message préformaté
- [ ] Statistiques de vues (basique)

---

## Phase V4 — Catalogue avancé & exports

> URS-058 à URS-060 + améliorations catalogue.

### Catalogue avancé

- [ ] Filtres produits sur la page publique
- [ ] Badges promo / nouveauté / rupture
- [ ] Formulaire de contact sur la page publique
- [ ] Statistiques de vues détaillées

### Exports

- [~] Export CSV commandes (avec filtre période) — lot 1 des exports (URS-058) : app `exports` sans modèle, un jeu de données (période sur la date de création, filtres de la page Commandes, totaux hors annulées, reste dû par commande plancher 0, trop-perçu à part), CSV en flux (BOM, « ; », langue de l'interface), fenêtre « Exporter » de Commandes, journal d'audit (`orders_export`, migration `core/0007`), audit `exports` ; reste la recette et le passage en staging
  - [~] Rendus PDF et message WhatsApp du même jeu : PDF ReportLab à l'en-tête des factures (période, génération, totaux, « Page n sur N », 1 000 commandes au plus puis CSV proposé), préparé puis partagé (Web Share) sur mobile, téléchargé ailleurs ; message texte (15 commandes au plus), wa.me ou copie, aucun envoi automatique ; 10 rendus par minute et par utilisateur (`EXPORTS_RENDER_RATE`) ; reste la recette et le passage en staging
  - [~] Message tronqué (plus de 15 commandes) : dernière ligne « … et N autres commandes (liste complète en PDF ou CSV) » (fr/en/ar, aucun fichier promis) ; avertissement « Le message montre 15 commandes sur N » dans la fenêtre « Exporter » (plafond `whatsapp_max_rows` du résumé) : sur mobile avec partage de fichiers, « Partager le PDF avec le résumé » (PDF et texte préparés, puis partagés ensemble, un seul bouton plein), sinon « Passer au PDF », au-delà de 1 000 commandes « Passer au CSV » ; audit `exports` ; reste la recette sur un iPhone et un Android réels (texte joint au PDF repris ou non selon le système et l'application)
- [~] Export CSV stock (quantités, prix, valeur estimée) — lot 2 des exports (URS-059) : jeu de données du stock dans l'app `exports` (une ligne par format suivi, recherche et tri de l'onglet Niveaux, périmètre « Tout le stock » ou « À réapprovisionner » pré-choisi par le filtre d'état), valeur estimée max(0, quantité) × prix d'achat arrondie comme la zakat (test d'égalité), formats sans prix d'achat signalés ; CSV en flux ; fenêtre « Exporter le stock » sur l'onglet Niveaux, composants d'export partagés (`components/export/`) ; journal d'audit (`stock_export`, migration `core/0008`) ; audit `exports-stock` ; reste la recette et le passage en staging
  - [~] Rendus PDF et message WhatsApp du stock : PDF à l'en-tête des autres exports (1 000 formats au plus puis CSV proposé) ; message des réapprovisionnements (périmètre imposé, rétabli au retour au CSV ou au PDF ; négatifs, ruptures puis faibles ; 15 formats puis « … et N autres » ; « Rien à réapprovisionner » sans totaux) ; même débit que les commandes ; reste la recette
- [x] Export PDF zakat (mention "indicatif" obligatoire) — livré avec le justificatif de Z2b (Zakat — refonte)
- [ ] Export asynchrone via Celery + email de notification quand prêt

---

## Phase V5 — Projets et partenariats halal

> URS-079 à URS-088. Module sensible : cadrage strict obligatoire.

### Modèles

- [ ] Modèles `Project`, `ProjectFundingLine`, `ProjectDocument`, `PartnerProfile`, `ProjectInterest`, `ProjectReport`

### Fonctionnalités porteur

- [ ] Création fiche projet (titre, secteur, ville, pays, description, étape, besoin, partenariat)
- [ ] Indication montant indicatif + usage
- [ ] Type de partenariat (commercial / association / partage bénéfices-risques / apport + implication)
- [ ] Upload documents projet (visibilité publique ou privée)
- [ ] Toggle visibilité (public / privé / sur demande)

### Fonctionnalités partenaire

- [ ] Création profil partenaire (enveloppe, secteurs, compétences, géo, type d'implication)
- [ ] Exploration projets avec filtres (secteur, ville, pays, type de besoin)
- [ ] Manifestation d'intérêt avec message
- [ ] Réception et gestion des demandes côté porteur (accepter, refuser, archiver)

### Cadrage et sécurité

- [ ] Avertissement obligatoire avant publication d'un projet
- [ ] Avertissement obligatoire avant manifestation d'intérêt
- [ ] Texte clair : pas de collecte d'argent, pas de rendement promis, accords directs entre parties
- [ ] Bouton signalement avec choix de raison
- [ ] Modération admin (Django Admin) : suspension projet/profil
- [ ] Vérification : aucun champ de paiement ou montant garanti dans le module

---

## Phase V6 — IA, OCR, inventaire visuel

> URS-042 à URS-054. Service `ai-service` FastAPI séparé.

### Service IA — base

- [x] Initialiser le service FastAPI séparé
- [x] Authentification interne entre Django et FastAPI (clé partagée)
- [x] Endpoint health-check

### OCR factures fournisseur (URS-042 à URS-045)

- [x] Intégration PaddleOCR ou Tesseract dans le service IA
- [x] Endpoint upload facture + extraction texte brut
- [x] Modèle `UploadedDocument`, `OcrResult`
- [x] Extraction structurée : produits, quantités, prix
- [~] Matching déterministe des lignes OCR vers ProductVariant
- [ ] Affichage frontend des lignes détectées avec confiance
- [ ] Validation humaine ligne par ligne
- [ ] Création des `StockMovement` après validation uniquement

### Scan d'emballage (URS-109, proposée)

- [x] ai-service : code-barres EAN-8/12/13/14 (`zxing-cpp`), OCR local, contenance et description proposées (`POST /internal/product-scan`)
- [x] Secours vision interchangeable (`app/vision/` : `ProductVisionProvider`, OpenAI, registre `VISION_PROVIDER`, `none` par défaut) ; image réduite, ré-encodée en JPEG, EXIF retiré ; coût journalisé sans contenu
- [x] Backend : `POST /api/ocr/product-scan/` (image en mémoire seulement, mime et taille vérifiés, limite de débit), Open Food Facts par EAN validé (cache 30 jours), gating `product_scan`, journal d'audit sans contenu
- [x] Quota mensuel du secours vision (`max_vision_scans_per_month`, `ProductScanUsage`), incrément atomique, quota atteint = résultat local avec avertissement
- [x] Frontend : « Scanner l'emballage » à la création d'un article, champs vides seulement, badge « Détecté, à vérifier », prix jamais pré-rempli ; audit `e2e/audit-product-scan.mjs`
- [x] Qualité du scan — structuration du texte : toutes les lignes OCR (texte, position, hauteur, face/dos) envoyées, sans image, au modèle texte (`PRODUCT_TEXT_MODEL`, sortie structurée, `store=False`, aucun réessai) ; champs marque, désignation, variante, allégations, contenance, code-barres ; garde-fou qui écarte toute valeur absente du texte lu ; repli sur les règles locales
- [x] Qualité du scan — composition côté Django : nom = [marque] désignation [variante] [contenance], marque omise si c'est le nom de la boutique, description = allégations ; aucune donnée de la boutique envoyée à ai-service
- [x] Qualité du scan — secours image sur critère sémantique (nom absent, égal à la marque, un seul mot sans type de produit, texte pauvre, confiance basse), derrière `PRODUCT_SCAN_IMAGE_FALLBACK` (`false` par défaut) ; seule la face part
- [x] Qualité du scan — deux photos (face, puis « Ajouter le dos ») fusionnées ; indice « Cadrez l'étiquette de face » ; un champ encore égal à la détection est rafraîchi, une saisie jamais écrasée
- [x] Jeu d'étalon : `apps/ai-service/scripts/eval_product_scan.py` (score par champ et par fournisseur) sur `tests/fixtures/product_scan/*.json`, cas Ziyada ; aucune photo tierce commitée (README)
- [ ] Tests de coût réel par image avec plusieurs fournisseurs, puis choix du fournisseur et ajustement des quotas par formule
- [ ] Point d'entrée dans l'onboarding (composant `ProductScanCard` réutilisable)

### OCR adresses clients (URS-046)

- [ ] Endpoint extraction nom + téléphone + adresse depuis image
- [ ] Pré-remplissage formulaire client/commande
- [ ] Validation humaine obligatoire

### QR code produit (URS-052 à URS-054)

- [ ] Génération QR code par produit
- [ ] Téléchargement / impression QR code
- [ ] Scanner mobile dans l'app
- [ ] Après scan : ouverture fiche produit + actions rapides entrée/sortie stock

### Détection visuelle (URS-047 à URS-051)

- [ ] Modèles `Shelf`, `ShelfImage`, `DetectionResult`
- [ ] Upload photo d'étagère liée à un emplacement
- [ ] Intégration YOLO / Ultralytics dans le service IA
- [ ] Détection produits + comptage avec niveau de confiance
- [ ] Affichage frontend avec correction possible
- [ ] Application au stock **uniquement après validation humaine**

---

## Transversal — à faire en continu

### Design système

- [x] **Palette Sauge + Crème** — Remplacer la palette par défaut (menthe saturée hors-gamut + blanc pur) par la palette adoucie validée design : primaire Sauge `oklch(0.52 0.075 170)` (#367762), fond Crème `oklch(0.975 0.010 85)` (#FAF6EF). Inclut le mécanisme `overrides` par thème dans `buildThemeVars` (formule → overrides fond → overrides primaire) et les valeurs sombre calibrées (cards détachées du fond, contrastes vérifiés). Aucun autre thème impacté.
- [~] **Correctif police** — `--font-sans` ne se référence plus lui-même ; Geist + Noto Sans Arabic pour l'arabe
- [x] Polices hébergées (next/font/local), build indépendant de Google Fonts (validé sur staging le 2026-10-26)
- [~] Étape 2 — Jeu de données de démo réaliste (seed)
- [~] Étape 3 — Shell grand écran : sidebar groupée, en-tête de page, largeur max, bandeau unique
- [x] Étape 4 — Nouvel accueil : compteurs « À faire », listes, carte Ventes, écran de démarrage
- [~] Étape 5 — Commandes et Nouvelle vente : vente sans client, vue caisse, libellés de statuts
  - [x] 5a — page Commandes (liste, filtres, pagination/infinite scroll)
  - [x] 5b — Nouvelle vente (vue caisse desktop, client facultatif, paiement par défaut)
  - [x] 5c — Simplification statuts : suppression `draft`, création directe `to_prepare`, parcours livraison/sur-place/autre, `StatusSwitch` adaptatif, stock delta sur édition
- [~] C1+C2 — Gabarit des pages de liste (StatCard, ListToolbar, DataTable) appliqué à Commandes desktop
- [~] C2 — Détail d'une commande (desktop + mobile)
- [~] Mode sombre via tokens (fin des gris de palette, garde-fou `npm run tokens:check`) et marges latérales grand écran (`lg:px-8 xl:px-12 2xl:px-16`)
- [~] C2 — Nouvelle commande desktop et modification sur le même écran
- [~] C3 — Clients : liste (gabarit)
- [~] C3 — Fiche client (gabarit de détail)
- [~] Gabarit des pages de formulaire, appliqué au formulaire client
- [~] C3 — Articles et services : liste (gabarit)
- [~] C3 — Formulaire article (gabarit v2)
- [~] C4 — Stock : règles et API
- [~] C4 — Écrans du stock (niveaux, mouvements, entrées, sorties)
- [~] C4 — Fiche article
- [~] Gabarit de formulaire v3 (deux colonnes) appliqué aux formulaires article et client, photos d'articles carrées
- [~] Nom complet des clients (`display_name`) partout, recherche sur le prénom et le nom
- [~] Étape 6 — Onboarding revu et vocabulaire adapté au type d'activité
- [~] Étape 7 — Mobile : barre du bas, menu, accueil 2×2, saisie plein écran

### Après recette C1–C4

- [~] Lot 1 (bugs avant fusion)
  - [~] Suppression d'un article ou d'un format jamais utilisé (stock initial reconnu par `StockMovement.is_initial`)
  - [~] Rappels : mise à jour, compteurs, doublons
  - [~] Historique des messages WhatsApp
  - [~] Page bloquée sans défilement (un seul verrou de défilement : celui de Base UI)
- [~] Lot 2 (avant fusion)
  - [~] En-têtes de cartes teintés (bande `header-band`, titres et en-têtes de colonnes)
  - [~] Listes longues des fiches (5 + « Voir plus »)
  - [~] Sélecteur d'indicatif téléphonique
  - [~] Garde-fou Base UI (`npm run deps:check` : une seule copie de `@base-ui/utils`)
  - [~] Facture client : ne pas afficher le format par défaut dans les lignes
  - [~] Entrée de stock : carte de mise à niveau sur l'onglet facture fournisseur sans Boutique+
  - [ ] Fin de la recette
- [~] Lot 3 (avant fusion, avec maquette) : formats dans le formulaire article
  - [~] En-têtes des cartes de formulaire en bande teintée (formulaires article et client)
  - [~] Formats dans le formulaire article : tableau « Formats et prix », création et modification tout ou rien
  - [~] Formulaire article : ordre des champs (nom → unité → prix → stock → photo → référence)
- [~] Puis : pull request, fusion (session Postman abandonnée : Postman n'est plus utilisé, collection retirée du dépôt)
- [~] Lot 4 (après fusion)
  - [~] Page et formulaire Rappels + assignation à un employé
  - [~] Export de l'activité d'un client avec filtres (URS-104, proposée) : fenêtre « Exporter » de la carte Activité, contenu et période, nombre de lignes annoncé, CSV en flux (BOM, « ; », langue de l'interface), journal d'audit
    - [~] Relevé de compte en PDF et message WhatsApp — lot 3 des exports : jeu des commandes avec le client fixé (une ligne par commande : date, n°, statut, paiement, total, encaissé, reste dû ; annulées hors totaux), identité du client et « Situation au JJ/MM/AAAA » en en-tête, jamais les notes ; commandes créées dans la période, « À encaisser » de la carte respecté ; message : commandes à régler, de la plus récente à la plus ancienne, 15 puis « … et N autres », wa.me vers le téléphone du client s'il existe ; routes `/api/exports/customers/<id>/statement/(summary|pdf|whatsapp)/` (module Clients, client de la boutique, débit limité) ; format dans la fenêtre « Exporter l'activité » (CSV inchangé, qui défile à 360×640 : comportement existant, non modifié ; PDF et WhatsApp sans défilement) ; garde-fou anti-formule partagé (`apps/core/spreadsheet.py`), `format` au journal `customer_activity_export` (sans migration) ; audit `activity-export` ; reste la recette
  - [~] Bloc Ventes de l'accueil (URS-006) : 7 jours, 12 mois et depuis l'ouverture, courbe avec bulle souris et clavier, tableau équivalent, période gardée sur le compte
  - [~] Modèles de messages WhatsApp et ton (URS-066/067) : ton de la boutique, cinq modèles personnalisables, aperçu, rendu unique côté serveur
  - [~] Rappels automatiques (URS-055 à 057) : relance d'impayé, commandes en attente, résumé du jour par e-mail
- [~] Lot 5 — Factures fournisseur
  - [~] Import PDF : texte lu directement si le PDF en contient, sinon lecture d'image
  - [~] Création d'un article depuis une ligne « à associer », pré-remplie et mémorisée (article seulement : une entrée de stock ne porte pas sur un service) ; ligne ignorée (frais de port, remise…), mémorisée pour le fournisseur et rétablissable
- [~] Lot 6 — Factures clients
  - [x] Nouveau design (référence : maquettes couleur et neutre validées)
  - [x] Logo et couleur d'accent : automatique (tirée du logo, contraste vérifié), au choix ou neutre
  - [x] Récapitulatif du compte client en option
  - [x] Mentions légales configurables
  - [x] Réglages dédiés, instantanés d’émission, PDF A4 paginés et exemples
  - [x] Pages liste et détail au gabarit (§9/§10), indicateurs, facettes et tri serveur, audit smoke
  - [ ] Dette : factures et justificatif de zakat en PDF arabe (français utilisé en attendant)
- [~] Lot 7 — Compte et réglages
  - [x] Badge d'abonnement (sidebar, menu mobile) — formule courante, « Essai · N j », « Essai terminé » ; remplace les cartes d'essai, audit `account-menu`
  - [x] Raccourci clair/sombre dans le header (à côté de la loupe sur mobile, avant la barre de recherche sur desktop)
  - [x] Menu desktop : sidebar translucide déployée (272 px) ou en rail (80 px, préférence gardée sur le compte), accordéon Articles → Catalogue / Stock, groupe Compte avec Abonnement, pied d'une ligne dont « ⋯ » ouvre le menu du compte (apparence, langue, Se déconnecter), bouton replier/déplier sur le bord et Ctrl+B, sans défilement à 1440×900, flyout du rail au survol et au clavier, audit `sidebar`
  - [x] Refonte de Paramètres boutique, Équipe, Abonnement et Mon profil (maquettes d'abord)
    - [x] Page Abonnement (7c-1) : votre formule (essai « Jour N sur 14 », CTA « Garder »), votre activité comparée aux plafonds Découverte, choix de formule mensuel / annuel (prix annuels 0 / 90 / 190 / 390 €, migration 0005 ; revus en 160 / 290 € par la migration 0014), 4 cartes sur desktop et onglets sur mobile, paiement en ligne pas encore activé (`UpgradeSheet`), résiliation discrète ; audit `subscription`
    - [x] Paramètres boutique et Équipe (7c-2) : sous-navigation desktop collante (208 px), liens verrouillés visibles et formule traduite, « Autres réglages » sur mobile ; cartes Boutique à plat et barre d'enregistrement dans la colonne ; formules sur 4 colonnes dès 880 px de conteneur, sinon 2 × 2 sur desktop ; Équipe en tableau / cartes, usage et plafond API, places disponibles et ajout limité via `UpgradeSheet` ; audits `settings`, `team` et audits existants adaptés
    - [x] Mon profil (7c-3) : en-tête du compte et vérification d’email, cartes Informations / Mot de passe côte à côte sur desktop et empilées sur mobile, composants et logique existants conservés ; audit `profile`, six maquettes 7c versionnées
    - [x] Pages marketing : grille 4 offres (Pricing, Faq)
    - [x] Pages marketing (7d-2) : largeur globale 1400 px, marges fluides, cartes et notes alignées, pastille Boutique flottante, CTA final et anneaux du sceau contenus sur mobile ; recette aux six largeurs ci-dessous
    - [x] Pages marketing (7d-3) : 8 cartes cohérentes avec la grille, partenariats et mentions d'attente retirés, section Valeurs recentrée sur la zakat ; contrôle des métadonnées et recette aux quatre largeurs ci-dessous
    - [~] Pages marketing (7d-4) : « Prêt en trois étapes » en cartes crème avec mini-interfaces HTML/CSS, lien d'inscription, grille responsive et réduction des animations ; recette à 375 / 390 / 768 / 1024 / 1440 px, staging non validé
    - [~] Pages marketing (7d-5) : section Zakat crème, transition SVG dorée et exemple statique explicite, liens vers `/zakat` et la FAQ, calculateur inchangé ; recette en production à 320 / 375 / 390 / 768 / 1024 / 1440 px, trois étapes identiques au pixel près, staging non validé
  - [x] Formules, données et gating (7b-1) : Découverte 0 € (`free`), Solo 9 € (ex-`pro`), Boutique 19 € (ex-`boutique_plus`, essai 14 j), Commerce+ 39 € (revus en 16 € et 29 € par la migration 0014) ; codes renommés en place (migrations 0003, 0004) ; limites Découverte 30 articles, 15 ventes/mois, 15 clients ; membres 1/1/4/∞ ; limites atomiques (verrou boutique) ; commandes et zakat dès Découverte, exports en Boutique, logo et couleur des factures en Boutique ; endpoint `GET /subscriptions/plans/` ; textes de la page Abonnement fr/en/ar
  - [x] Formules, jauges et cartes de mise à niveau (7b-2) : compteurs d'usage dans `GET /subscriptions/current/` (articles actifs, ventes du mois, clients actifs, membres) ; `UsageGauge` (ambre dès 80 %, rouge à la limite) dans Paramètres → Abonnement et en bandeau des listes Commandes, Clients, Articles ; limite atteinte : le bouton de création (et « Vendre ») ouvre `UpgradeSheet` au lieu du 400 ; `UpgradeCard` au bénéfice sur Facture PDF, WhatsApp, membres, exports, OCR, logo et couleur des factures (contrôles figés sous Boutique) ; limites articles et clients aussi à la réactivation (verrou atomique, test de concurrence) ; résumé quotidien réservé à `daily_digest` ; pastille de formule traduite par code ; audit `usage`, audit `sidebar` stabilisé
- [ ] Lot 8 — Facturation et devis professionnels (URS-110 à 117, spécification `docs/specs/spec_facturation_devis_pro.md`, maquettes `docs/maquettes/facturation/`)
  - [ ] 8.1 Facture libre (URS-110) : brouillon, lignes personnalisables, conformité, client et catalogue à la volée
    - [x] Backend : modèles, migrations, services, endpoints, tests
    - [x] Éditeur mobile et desktop, enregistrement automatique
    - [x] PDF : descriptions multilignes, unité, nature de l'opération, SIREN du client
    - [ ] Backlog : mentions vendeur absentes de `Shop` (forme juridique, capital, RCS, TVA sur les débits, pénalités de retard)
  - [ ] 8.2 Devis et avoirs (URS-111, URS-112)
    - [x] Compteurs par type de document (`DocumentSequence`)
    - [x] App `quotes` : statuts, envoi, expiration, conversion en facture (brouillon)
    - [ ] Avoirs total et partiel, `credited_total` atomique
    - [ ] PDF devis et avoir
  - [ ] 8.3 Hub Documents, dupliquer, modèles, paiements partiels (URS-113)
    - [ ] Aperçu PDF d'un brouillon marqué « BROUILLON »
  - [ ] 8.4a Lien en ligne et acceptation du devis (Boutique, URS-114)
  - [ ] 8.4b Acomptes et facture de solde (Boutique, URS-115), sous-spécification d'abord
  - [ ] 8.4c Factures récurrentes (Boutique, URS-116)
  - [ ] 8.4d Remise et TVA par ligne (Boutique, URS-117), sous-spécification d'abord
  - [ ] 8.5 Facturation électronique : cadrage

### Tests

- [ ] Tests unitaires backend (pytest) sur chaque modèle et endpoint
- [ ] Tests E2E frontend (Playwright) sur les parcours clés
- [ ] Tests de sécurité multi-tenant systématiques
- [ ] Couverture > 70 % sur le backend

### Documentation

- [ ] Documentation API (OpenAPI / Swagger via DRF)
- [ ] Guide d'installation locale dans `README.md`
- [ ] Schéma de base de données à jour
- [ ] Changelog des versions

### Sécurité & RGPD

- [x] Page mentions légales — mises à jour pour l'éditeur réel et Stripe (commits `820cb33`, `4472011`) ; en ligne (validé en exploitation le 27/10/2026)
- [x] Page politique de confidentialité — mises à jour pour l'éditeur réel et Stripe (commit `820cb33`) ; en ligne (validé en exploitation le 27/10/2026)
- [~] Page CGV (/cgv) : en ligne (validé en exploitation le 27/10/2026) ; relecture juridique non faite
- [ ] Endpoint export des données utilisateur
- [ ] Endpoint suppression / anonymisation du compte
- [ ] Consentement marketing si applicable
- [~] Admin Django interne : navigation par domaine, accès superuser seul, modèles sensibles en lecture seule, thème Sauge/Crème (lots 1a, 1b, 2) — outil interne, aucun URS ne le couvre ; règles d'usage dans docs/exploitation/acces-admin-django.md
  - [~] Lot 1a : site `MizanAdminSite` (superuser actif seul, connexion refusée aux autres comptes staff), navigation par domaine, lecture seule par défaut, IBAN/BIC, jetons, texte OCR, montants zakat et données de formulaire d'axes jamais affichés ; seules écritures (`User.is_active`, nom, téléphone ; `PublicPage.is_active`/`is_published`) tracées dans AuditLog (sans donnée personnelle ; `NO_SHOP_ID` pour un compte sans boutique), jetons de rafraîchissement révoqués à la désactivation — migration `core.0010` (choix d'action seulement) ; testé en local, reste à déployer et valider en staging
  - [~] Lot 1a-bis : action « Changer la formule » sur les abonnements sans lien Stripe (superuser seul, formulaire intermédiaire, motif obligatoire ; refus si lié à Stripe, en retard de paiement ou suspendu, formule désactivée, date passée, date avec Découverte) via `subscriptions.services.set_plan_manually` (garde atomique dans l'UPDATE), date de fin facultative à la fin de la journée dans le fuseau de la boutique, retour silencieux sur Découverte par `expire_trials` ; colonne et filtre « se termine sous 7 jours » ; actions d'audit `subscription_plan_assigned` et `subscription_assignment_ended` — migration `core.0011` (choix d'action seulement) ; badge sur la formule effective ; testé en local, reste à déployer et valider en staging
  - [ ] Lot 1b : confort du support (requêtes N+1, recherche par boutique, liens depuis la fiche boutique, `date_hierarchy`)
  - [ ] Lot 2 : thème Sauge/Crème clair et sombre, badges de statut, tableau de bord (compteurs)

### Durcissement avant production (2026-10-25)

- [x] Node 24 partout (images frontend, CI, `@types/node`) (validé sur staging le 2026-10-26)
- [x] Révocation des jetons de rafraîchissement (liste noire, déconnexion, mot de passe, purge quotidienne, rafraîchissement à vol unique dans le proxy Next.js) (validé sur staging le 2026-10-26) — migrations `token_blacklist` (paquet simplejwt), vérifications dans docs/exploitation/deploiement.md (« Sessions »)
- [x] Limitation de débit partagée (compteurs DRF dans Redis base 1, ouverte si Redis tombe, adresse du visiteur transmise par le proxy Next.js) (validé sur staging le 2026-10-26) — vérifications dans docs/exploitation/deploiement.md (« Limitation de débit »)
- [x] Blocage de connexion par (compte, adresse) avec la vraie adresse du visiteur (django-axes, même clé que la limitation DRF, IPv6 par /64 ; 5 échecs, 15 min, réponse 429 `too_many_attempts` avec délai restant ; remise à zéro à la connexion réussie et à la réinitialisation du mot de passe) (validé sur staging le 2026-10-26) — fonctionnement, levée et recette dans docs/exploitation/deploiement.md (« Blocage de connexion »)
- [x] Isolation des conteneurs (`no-new-privileges`, aucune capacité sauf `NET_BIND_SERVICE` pour Caddy, `pids_limit`, backend et frontend en lecture seule avec tmpfs) (validé sur staging le 2026-10-26) — vérifications dans docs/exploitation/deploiement.md (« Isolation des conteneurs »)
- [x] Fichiers envoyés (plafond de 50 Mpx et bombes de décompression refusées dans le backend et l'ai-service, images vérifiées entières et au bon format, taille de page des PDF bornée avant rendu, `request_body` de Caddy à 17 Mio pour le scan et 11 Mio ailleurs) (validé sur staging le 2026-10-26) — vérifications dans docs/exploitation/deploiement.md (« Fichiers envoyés »)
- [x] Compte PostgreSQL applicatif (mizan_app) et durcissement de postgres (validé sur staging le 2026-10-26) — rôle sans attribut d'administration, propriétaire de la base, mis en place par `mizan-db-roles` à chaque déploiement ; postgres et backup en `user: postgres`, sans capacité, en lecture seule ; nouvelles variables `APP_DB_USER` et `APP_DB_PASSWORD` ; procédure dans docs/exploitation/deploiement.md (« Comptes PostgreSQL »)

### Abonnement SaaS (URS-064, URS-065, URS-100)

- [x] Modèles `Subscription`, `SubscriptionPlan` + seed des ~~3~~ 4 plans (Découverte, Solo, Boutique, Commerce+ : migration `0004_rename_plans`, 2026-10-28)
- [x] Essai 14j Boutique (ex-Boutique+) à l'inscription (URS-100) + tâche Celery d'expiration
- [x] Gating `HasPlanForFeature` câblé sur orders / invoices / zakat / whatsapp / public_pages / multi_user (ajout et modification d'un membre) / ocr
- [x] Limites offre gratuite (nb produits, nb commandes/mois)
- [x] Endpoints `GET /current/` + `POST /change/` (résiliation → free)
- [x] Frontend : bandeau d'essai, page Settings → Abonnement, gating UI menus
- [~] Intégration Stripe Billing — Lot 1 : code et tests prêts (commit `6987be3`) ; Stripe en mode réel (validé en exploitation le 27/10/2026, docs/exploitation/stripe.md) ; sous-lots 3b, 4 et 5b encore ouverts (condition non remplie, décochée le 2026-10-28)
  - [x] Lot 3a : code et tests prêts (checkout, portail, résiliation, reprise) (commit `deb4fb6`) — paiement 3D Secure, portail, résiliation en fin de période puis reprise, annulation immédiate (validé en exploitation le 27/10/2026)
  - [~] Lot 3b : code et tests prêts (changement de formule : aperçu, montée immédiate, descente programmée) (commit `c78196b`) — déployé en production ; changement de formule et descente programmée non éprouvés en production (2026-10-28)
  - [~] Lot 4 : code et tests prêts (retard de paiement à J+15, rappels, rappel de fin d'essai ; correction après relecture : résiliation retentée jusqu'à aboutir, message de fin séparé et unique, facture ouverte annulée) — commits `91f8b69`, `e23d14f`, `9f35659`, déployé ; reste [~] tant qu'aucun impayé réel n'a été observé en production (2026-10-28)
  - [~] Lot 5a : code prêt (souscription, retour de paiement, portail, résiliation et reprise, bandeau d'impayé) (commit `237504b`) — parcours de souscription, portail, résiliation et reprise (validé en exploitation le 27/10/2026) ; bandeau d'impayé non éprouvé, aucun impayé réel (condition non remplie, décochée le 2026-10-28)
    - [~] correctif : activité d'un abonné payant face aux limites réelles (commit `7a369d9`, déployé ; validation non attestée)
  - [~] Lot 5b : code prêt (changement de formule, changement programmé, bandeaux globaux) — 2026-10-24 (commit `febeb81`, déployé) ; changement de formule non éprouvé en production (2026-10-28)
  - [x] Changement de prix (Boutique 16 € / 160 €, Commerce+ 29 € / 290 €) (commit `e6c06f8`) : `stripe_sync_plans --allow-live` lancé en production, six prix « inchangé », identifiants enregistrés en base (validé en exploitation le 27/10/2026) ; `stripe_migrate_prices` sans objet (aucun abonné à migrer) ; ~~à appliquer en test puis en production avec stripe_sync_plans et stripe_migrate_prices~~ — migration `0014_plan_prices_boutique_commerce_plus`, procédure dans docs/exploitation/deploiement.md (« Changement de prix »)
- [x] Webhook Stripe → mise à jour de l'abonnement local — Lot 2 : code et tests prêts (commits `48dceb0`, `afc2c61`) ; webhook de production à 6 événements, traité (200) et abonnement synchronisé (validé en exploitation le 27/10/2026)
- [x] Page tarifs publique + flow upgrade payant (de Découverte vers une formule payante) — `components/marketing/Pricing.tsx`, page Abonnement (lot 5a) ; paiement réel de 9 € (Solo) (validé en exploitation le 27/10/2026) ; le changement entre formules payantes relève du lot 3b

### Monitoring

- [~] Sentry actif sur backend + frontend — intégré, inactif tant que les DSN ne sont pas renseignés ; `SENTRY_DSN` vide en production (constaté le 28/10/2026)
- [ ] **Avant l'invitation de testeurs** : créer le projet Sentry et renseigner `SENTRY_DSN` (backend, `production.env`) et `NEXT_PUBLIC_SENTRY_DSN` (frontend, variable GitHub de build, `ci.yml`)
- [x] UptimeRobot ou Better Stack configuré — UptimeRobot, mot-clé sur `/healthz` (base + Redis, sans authentification) et sur les pages (validé en exploitation le 27/10/2026)
- [~] Logs structurés (JSON) en production — Django, gunicorn et Celery sur stdout, données personnelles masquées
- [ ] Alertes mail sur erreurs critiques

### Backups

- [x] Backups PostgreSQL automatiques activés — WAL-G : journal archivé en continu (perte ≤ 1 min), sauvegarde complète chaque nuit, 30 jours, chiffrée, bucket dans une autre région, surveillance par signal ; éprouvé en local avec MinIO (`deploy/backup/test-local.sh`), ~~à activer sur le serveur (bucket, clé, URL de surveillance)~~ — docs/exploitation/sauvegardes.md ; en production : WAL-G vers `mizan-backups/production/` (Paris), Healthchecks : sauvegarde à 02:30 UTC et archivage WAL toutes les 5 min (validé en exploitation le 27/10/2026), sauvegarde verte le 28/10/2026
- [~] **Test de restauration mensuel** (un backup non testé n'est pas un backup) — automatique (service `backup`, signal RESTORE_TEST_HEARTBEAT_URL) ; restauration manuelle à un instant précis : `deploy/backup/restore.sh` — contrôle Healthchecks le 1er du mois à 04:00 UTC, premier passage prévu le 01/11/2026
- [~] Versioning Object Storage activé si possible — procédure documentée (bucket privé des fichiers), à activer sur OVH ; désactivé sur `mizan-production-private` (constaté le 28/10/2026)
- [~] Plan de rollback documenté — `deploy/rollback.sh` + docs/exploitation/deploiement.md, à éprouver en staging (non attesté au 28/10/2026)

### Dette technique connue

- [ ] **PRIORITAIRE, bloquant de la checklist de lancement** — Facture issue d'une
      commande : `unit_price` de la commande est traité comme HT et la TVA est ajoutée
      par-dessus (commande de 20 € → facture de 24 €), alors que la synchronisation
      marque la facture payée à 20 € réglés. Décision produit requise : prix saisis HT
      ou TTC pour une boutique assujettie ? À traiter avant le lancement, avec une
      étape 0 (relevé de tous les endroits qui lisent `unit_price`). Relevé au lot 8.2,
      sous-étape 4b (2026-10-30), non corrigé dans ce lot. Cas de test chiffré :
      boutique à TVA 20 %, variante à 10,00, commande de 2 → `total_amount` 20,00 ;
      `issue_invoice_from_order` → `subtotal_ht` 20,00, `tax_amount` 4,00, `total_ttc`
      24,00 ; `update_payment(order, 20,00)` → facture `paid`, `amount_paid` 20,00 :
      4,00 jamais réclamés. Reproduit par `_ctx` (qty=2) de
      `apps/invoices/test_credit_note_payments.py`, notamment
      `ConcurrentCreditNotePaymentTest` (assertion sur `ctx.order.total_amount`).

- [ ] Avoirs (URS-112) : cas d'un second avoir partiel sur la même ligne d'une facture,
      relevé à la revue de la sous-étape 4a (2026-10-30), à reprendre.

- [ ] Tests de `quotes` : `_make_shop` importé depuis `apps/invoices/tests.py` (import
      croisé entre apps) ; le déplacer dans une aide partagée (`apps/core/testing.py`
      ou une fabrique).

- [ ] Drapeau de blocage de modération sur `PublicPage`, à poser avant la mise en
      ligne de la V3 : une page dépubliée depuis l'admin interne peut aujourd'hui être
      republiée par le commerçant (serializer de mise à jour et `publish_page`). Le
      drapeau, posé par l'admin seul, doit refuser la publication côté serveur.

- [ ] Fin d'une formule attribuée depuis l'admin interne : le retour sur Découverte
      est silencieux (aucun e-mail, rien dans l'app avant ni après la date de fin).
      Prévenir le commerçant (e-mail et/ou bandeau) dans un lot séparé ; aucun URS ne
      le couvre encore.

- [ ] `seed_data.handle()` fait ~470 lignes et `_seed_new_products` 68 lignes ;
      découper en sous-commandes ou helpers dédiés hors périmètre de la refonte UX.

- [ ] Mettre en place Vitest côté frontend (aucun test, aucun script
      npm run test actuellement) — voir CLAUDE.md pour la note associée

- [ ] Auditer et corriger l'i18n de ConfirmDialog (components/ui/dialog.tsx) :
      les valeurs par défaut du composant (confirmLabel='Confirmer',
      cancelLabel='Annuler') et plusieurs appelants codent le texte en dur
      en français plutôt que de passer par next-intl. Repéré sur au moins :
      VariantRow.tsx (confirmLabel="Supprimer"), notes/page.tsx
      (title="Supprimer cette note ?"), zakat/[id]/page.tsx (title +
      confirmLabel), customers/[id]/page.tsx:152 (confirmLabel absent,
      tombe sur le défaut français), invoices/[id]/page.tsx:134,144
      (confirmLabel), color-picker.tsx:49 ('Une erreur est survenue.').
      ConfirmDialog est utilisé dans 16 endroits au total — liste non
      exhaustive, à auditer en entier avant correction.

- [ ] Empty state texte seul sur reminders/page.tsx:231-234 — pas de pattern
      canonique (icône + titre + sous-titre) contrairement à notes/page.tsx,
      qui a reçu ce traitement lors du chantier UX. À aligner.

- [ ] Variante par défaut identifiée par son nom stocké en français (`'Par défaut'`) :
      remplacer par un booléen `is_default` sur `ProductVariant`, avec migration des données.
      Centralisé dans `lib/products.ts` (`DEFAULT_VARIANT_NAME` + `isDefaultVariant()`) en attendant.

- [ ] « Ce mois-ci » (page Commandes) compte les commandes créées dans le mois faute de
      date de remise : ajouter une date de clôture (`completed_at`) sur `Order`.

- [ ] **max-lines-per-function** : 62 fichiers du frontend dépassent la limite de 80 lignes
      par fonction (règle ESLint ajoutée à l'étape 5b). Ces fichiers sont listés dans la
      surcharge `eslint.config.mjs` (bloc commenté "Dette"). Retirer chaque fichier de
      cette liste au fur et à mesure qu'il est découpé.

- [ ] Unité facturée d'un format (`ProductVariant.unit_label`, URS-110) : modifiable par
      l'API (`PATCH /api/products/<id>/variants/<variant_id>/`), absente du formulaire
      article, déjà sous dette `max-lines-per-function`. À ajouter au découpage de ce
      formulaire, au plus tard avec le lot 8.2.

- [ ] Éditeur de facture libre (URS-110), écarts à la maquette `01_editeur_facture_libre.html`
      : ni lien « Depuis le catalogue » (sélecteur d'articles), ni étiquette « Catalogue /
      Nouvelle prestation » sur la ligne ; la suggestion à la saisie couvre le catalogue et
      l'historique. À reprendre avec le lot 8.2.
      Écart assumé : le prix unitaire porte le code de la devise (« EUR ») et non le
      symbole, comme le formulaire article.
      Mobile (360 px, arabe) : le libellé du prix unitaire est tronqué (« سعر الو… ») dans
      sa demi-colonne, à côté du suffixe « EUR » (`EditorLine.tsx`).

- [ ] Facture issue d'une commande : imprimer aussi la nature de l'opération ? Décision à
      prendre à part. Aujourd'hui, seule la facture libre la fige dans son instantané
      (`drafts._freeze`) et l'imprime ; une facture de commande n'en porte pas, pour ne pas
      y écrire « prestation de services » par défaut.

- [ ] Limites de formule (URS-100) : plusieurs boutons de création n'ont pas de garde côté
      client à la limite (actions rapides, états vides, « Nouvelle vente » depuis une fiche
      client, accueil d'une nouvelle boutique, /orders/new). Le serveur refuse (400), mais
      la carte de mise à niveau ne s'ouvre pas avant le formulaire.

- [ ] Réglage du résumé quotidien modifiable sous la formule Boutique (Découverte, Solo) alors
      que l'envoi y est suspendu : le verrouiller côté réglages, comme les autres options
      réservées à Boutique.

- [ ] Journal d'activité (Commerce+) : écran de lecture des logs d'audit existants — à livrer
      avant le lancement. Exclure les actions `zakat_*` de l'écran (données personnelles).

- [x] Audit invoices ar 1440 : contrôle de disposition non adapté au RTL. Corrigé : ordre
      logique lu dans le sens réel du document (`getComputedStyle(document.documentElement)
      .direction`), contre-épreuve condition inversée en échec en fr comme en ar.

- [ ] Audits qui déduisent le sens d'écriture de la langue (`locale === 'ar'`) au lieu du
      document : account-menu:87, customer-form:45, sales:83, sidebar:50, 149, 154, 159,
      177, subscription:162-165. Les passer sur `getComputedStyle(document.documentElement)
      .direction`, comme invoices, puis relancer chacun dans les 8 configurations. Sans
      urgence : sidebar:180 déplace le pointeur de 600 px vers la droite sans tenir compte
      du sens (impact probablement nul).

- [x] Audit invoices, recherche par numéro : échec intermittent en 1440 fr clair, sur main
      comme sur Z3 (environ 1 passage sur 3), déjà vu en 360 ar sombre. Le serveur renvoie
      bien 1 facture sur 24 ; le contrôle lit la liste juste après `networkidle`, encore vide
      (0 lien), et la bonne ligne n'apparaît qu'ensuite, une seule fois. Corrigé : réponse
      filtrée attendue avant la saisie (`waitForResponse`), puis liste égale au résultat ;
      `networkidle`, déjà atteint au chargement, n'attendait pas la requête. 0 échec sur 10
      en 1440 ar clair avant comme après (course mesurée : marge de 13 à 148 ms).

- [ ] Catégorie de rappel zakat : plus aucun rappel automatique depuis Z2b. Décider du filtre
      de la liste et du reclassement des rappels restants.

- [ ] Sondes de formule de test_plans.py : un 404 compte comme accès autorisé ; exiger 200
      pour chaque module.

- [x] Scan d'emballage (URS-109) : plafond mensuel par boutique sur les appels de
      structuration du texte — « lectures avancées » : `ProductScanUsage.text_count`,
      `SubscriptionPlan.max_text_scans_per_month` (Découverte 10, Solo 30, Boutique 60,
      Commerce+ 130, NULL = illimité, formule effective), réservation SQL atomique avant
      l'appel (`structure=true` envoyé par Django seul), remboursement si la structuration
      n'aboutit pas, face + dos = une place (empreinte de la face en cache 15 min) ;
      plafond atteint → règles locales + avertissement `text_quota_reached` et mise à
      niveau ; jauge « Ce mois-ci » dans Paramètres → Abonnement si `VISION_PROVIDER`
      ≠ none. Limite connue : processus tué entre réservation et remboursement → place
      perdue. Coût unitaire (≈ 0,03 €) à confirmer sur facture réelle.

- [ ] Fonctions de shell du serveur non versionnées dans le dépôt (raccourcis
      utilisés en exploitation, absents de `deploy/`) — 2026-10-28.

- [ ] Aligner la région d'exemple des `.env.example` sur eu-west-par : les modèles
      (`deploy/env/*.env.example`) proposent `sbg` pour les sauvegardes, alors que
      `mizan-backups` est à Paris (constaté le 28/10/2026, docs/exploitation/sauvegardes.md).

- [ ] Rédiger un court document de décisions produit pour remplacer le document
      archivé (`docs/archive/project_instructions_saas_commercants.md`), en conservant
      les règles métier toujours valables : WhatsApp manuel uniquement, zakat
      indicative, cadrage du module projets halal, validation humaine de l'IA,
      ordre de la roadmap — 2026-10-28.

- [ ] Commentaires « ≈ 6,1 Go sur 12 » périmés : `deploy/env/production.env.example`
      (limites mémoire) et `deploy/app/compose.yml` (en-tête) ; le VPS a 7,6 Go
      (validé en exploitation le 27/10/2026).

- [ ] Texte d'aide de `seed_data --reset` périmé (`seed_data.py`, `add_arguments`) :
      il annonce « garde les users et boutiques », alors que l'option supprime les
      boutiques des comptes de démo (`@example.*`), voir CLAUDE.md et COMMANDS.md.

- [ ] Commentaire périmé de `apps/backend/apps/subscriptions/models.py`
      (`stripe_price_id` « préparé pour la future intégration Stripe ») : la
      facturation Stripe est branchée et les identifiants de prix sont renseignés.

- [ ] Fidélité (`apps/backend/apps/loyalty/`, tables documentées dans
      docs/schema_base_donnees.md le 2026-10-28) : aucune URS ne la couvre ; en
      créer une ou la rattacher.

- [ ] Le proxy /app/api/* traduit un 429 du backend en 503. Il devrait relayer le 429
      avec l'en-tête Retry-After. Un utilisateur multi-onglets peut atteindre 10
      refresh/min et voir une panne.

- [ ] L'annulation d'une commande crée-t-elle un avoir ? Aujourd'hui, elle annule la
      facture liée (`sync_invoice_from_order`) ; si la facture a déjà un avoir, elle
      reste inchangée (cas journalisé, spec facturation §12 D4). Décision produit et
      comptable à prendre, hors lot 8.2.

- [ ] `sync_invoice_from_order` (`apps/backend/apps/invoices/services.py`) lit la
      facture puis l'écrit (`invoice.save()`), sans mise à jour conditionnelle ni
      verrou : deux changements simultanés de la commande peuvent s'écraser.

- [ ] Autres verrous `FOR UPDATE` sur la boutique, à passer en `select_for_update(no_key=True)`
      un par un, chacun avec son test de concurrence (vrais threads, déterministe) :
      `subscriptions/limits.py:41`, `shops/services.py:46` et `:109`, `invoices/settings.py:61`.
      `FOR UPDATE` bloque le contrôle de clé étrangère (`FOR KEY SHARE`) de toute insertion
      qui référence la boutique ; l'émission d'une facture interbloquait ainsi avec
      l'enregistrement de son brouillon (corrigé pour l'émission et l'envoi d'un devis, 2026-10-30).

- [ ] Éditeur de facture : « Émettre » attend l'enregistrement en cours (`flush()` enchaîné
      dans `useIssueFlow.start`), mais `confirm` ne relance pas `flush()` et la saisie reste
      possible pendant la préparation : une frappe dans cet intervalle peut partir après
      l'émission (refusée en `not_draft`, la facture émise ne la contient pas). Relancer
      `flush()` dans `confirm` ou verrouiller la saisie pendant la préparation — 2026-10-30.

- [ ] Devis (lot 2) : écart de TVA devis → facture si le régime change entre l'envoi et
      l'émission. La conversion applique le taux actuel de la boutique, pas celui du devis
      (test `test_convert_applies_the_shop_current_tax_rate_not_the_quote_one`).

- [ ] Validité du devis par boutique (lot 3) : 30 jours par défaut (1 à 365) pour toutes
      les boutiques aujourd'hui ; réglage par boutique avec les modèles.

- [ ] Note pour le lot 3 : un devis expiré ne peut pas être accepté ; « Dupliquer » permet
      de relancer un devis expiré.

---

## Mise en production

Procédure : docs/exploitation/deploiement.md (« Premier déploiement », « Ouverture au public »).

- [x] Serveur OVH (VPS Gravelines), DNS, pare-feu, Caddy, certificats
- [x] Staging en ligne (staging.mizan-commerce.com)
- [x] Base de production créée et migrée, rôle mizan_app, sauvegarde complète et archivage WAL vers mizan-backups/production
- [x] Production ouverte au public (Caddy, `EDGE_SITES=*`, certificat mizan-commerce.com) — `deploy/edge/sites/production.caddy`, inscription ouverte (validé en exploitation le 27/10/2026)
- [~] reCAPTCHA v3 : clé de site dans la variable GitHub `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` et clés secrètes dans staging.env et production.env — `.github/workflows/ci.yml` ; production (validé en exploitation le 27/10/2026) ; staging.env non attesté (condition non remplie, décochée le 2026-10-28)
- [x] Supervision : sonde de disponibilité sur `/healthz` et adresses de surveillance des sauvegardes (Healthchecks) — UptimeRobot et 3 contrôles Healthchecks (validé en exploitation le 27/10/2026)
- [x] Compte administrateur de production (tunnel SSH) — créé, confirmé par l'exploitant le 28/10/2026 (date de création non communiquée)
- [ ] Recette de production sur le vrai domaine
- [x] Stripe en mode réel : compte activé, clé restreinte, webhook de production, réglages, stripe_sync_plans — paiement réel, webhook, portail, résiliation, reprise, annulation et remboursement (validé en exploitation le 27/10/2026, docs/exploitation/stripe.md)
- [ ] Relecture juridique des CGV (articles n, p, q, s)
- [ ] Textes arabes à faire relire (docs/i18n/ar_a_relire_lot5.md et e-mails du lot 4)
- ~~Staging arrêté après la recette de production (mémoire du VPS : 7,6 Go)~~ — scindée le 2026-10-28 : la recette de production n'est pas faite
- [x] Staging arrêté hors validation d'une mise à jour (constaté le 27/10/2026 ; mémoire du VPS : 7,6 Go)
- [ ] Recette de production complète

---

## Exploitation — À faire

Procédures : docs/exploitation/ (déploiement, sauvegardes, Stripe : docs/exploitation/stripe.md).

- [ ] Vérifier le préfixe et le bas de page légal sur la première vraie facture Stripe (réglages de facture faits le 27/10/2026)
- [ ] Test de restauration automatique : premier passage le 01/11/2026 (contrôle Healthchecks)
- [ ] Relecture juridique des CGV (dont les mentions de facture et les pénalités de retard) et des textes arabes
- [ ] Préavis de 30 jours aux abonnés avant toute hausse de prix
- [ ] Durcir DMARC de `p=none` vers `quarantine`
- [ ] Ne jamais soumettre le domaine au préchargement HSTS sans avoir vérifié tous les sous-domaines
- [ ] Ne pas fusionner la branche Dependabot `@types/node` 26 (Node 24 en service)
- [ ] Audit des promesses de la page Tarifs avant toute annonce publique (voir « Checklist de lancement »)
- [ ] Statut de la demande PayPal à vérifier

### Avant l'invitation de testeurs

Voir aussi la tâche Sentry de la section Monitoring.

- [ ] Tester le changement de formule depuis l'application : montée immédiate avec prorata, descente programmée en fin de période, annulation d'un changement programmé — de préférence sur le staging en mode test (lots 3b et 5b)
- [ ] Vérifier que support@mizan-commerce.com reçoit bien les e-mails (enregistrement MX et boîte de réception)
- [ ] Créer une URS pour la fidélité (le code de `apps/backend/apps/loyalty/` n'en a pas), puis la rattacher au plan

---

## Checklist de lancement

Revue du 2026-10-16 — **ne pas publier la landing avant que tout soit livré**.
La grille décrit la cible commerciale. Les cases ci-dessous restent ouvertes tant que
la livraison complète et la recette de lancement ne sont pas attestées ; la présence
d'une clé dans `FEATURE_MIN_PLAN` ou de code partiel ne suffit pas.

- [ ] Fidélité — modèles, services et API dans `apps/backend/apps/loyalty/`, mais aucune interface commerçant ; gating de formule Boutique à raccorder sur ces vues.
- [ ] Statistiques de ventes — décision du 2026-10-21 : accessibles à toutes les formules, sans gating Boutique (clé `sales_stats` retirée, grille réduite à « Exports ») ; graphique et API présents (`components/dashboard/sales/`, `apps/backend/apps/core/views.py`, `apps/backend/apps/core/services.py`), reste la recette du lot 4.
- [ ] Inventaire photo (Boutique) — promis dans Pricing et Features ; clé `visual_inventory` seulement, détection visuelle de la phase V6 non livrée.
- [ ] QR codes (Boutique) — promis dans Pricing ; clé `qr_codes` seulement, génération, impression et scan de la phase V6 non livrés.
- [ ] Page boutique en ligne — code admin et public présent (`apps/backend/apps/public_pages/`, `app/boutique/`, `components/public-page-admin/`) ; phase V3 encore non validée dans ce suivi, recette de publication à terminer.
- [ ] Modèles de messages — décision du 2026-10-21 : personnalisation accessible dès Solo, avec WhatsApp, sans gating Boutique (clé `message_templates` retirée) ; code et audit présents (`components/settings/messages/`, `e2e/audit-message-templates.mjs`), reste la recette du lot 4.
- [ ] Rôles et permissions — déjà implémentés et cochés en V1, écran Équipe livré en 7c ; confirmer la recette de lancement (gating `multi_user`, limites 1 / 1 / 4 / illimité), sans les présenter comme du code absent.
- [ ] Journal d'activité — logs d'audit existants (`apps/backend/apps/core/models.py`), mais écran de lecture Commerce+ non livré.
- [ ] Support prioritaire — clé `priority_support` déclarée ; aucun parcours ni engagement de support attesté dans le code ou ce suivi.
- [~] Souscription payante — backend codé et testé sans réseau (`apps/backend/apps/subscriptions/`) : paiement (Checkout), portail, résiliation et reprise, webhooks, changement de formule, retard de paiement (règle des 15 jours) et rappel de fin d'essai ; ~~restent le frontend, la recette en mode test Stripe et la mise en production~~ (frontend : lots 5a/5b ; en production : paiement, portail, résiliation, reprise, annulation et remboursement, validé en exploitation le 27/10/2026) ; restent le changement de formule et un impayé réel, non éprouvés en production (2026-10-28).
- [ ] Libellés des fonctions perdues lors d'un changement de formule : étendre SHIPPED_FEATURES (`apps/frontend/lib/plan-features.ts`) à chaque fonction livrée.
- [ ] Factures fournisseurs (Boutique) — promises dans Pricing et Features ; import et lecture présents (`apps/backend/apps/ocr/`), lot 5 encore en cours, recette complète à terminer.
- [ ] Exports (Boutique) — promis dans Pricing ; activité client CSV présente (`apps/backend/apps/customers/views.py`) ; commandes en CSV, PDF et WhatsApp livrées (lot 1, `apps/backend/apps/exports/`) ; stock en CSV, PDF et WhatsApp livré (lot 2) ; relevé de compte d'un client en PDF et WhatsApp livré (lot 3) ; reste la recette.
- [ ] Partenariats halal (V5) : retirés de la landing, à remettre quand le module est livré.
- [ ] **Bloquant** — Réviser la politique de confidentialité (texte lu sur l'emballage, traitement d'images, envoi au fournisseur IA) AVANT d'activer le scan IA en production, pour chacun de ses deux niveaux : (1) texte seul, `VISION_PROVIDER` hors de `none` — le texte lu part au fournisseur, jamais l'image ; (2) image en secours, `PRODUCT_SCAN_IMAGE_FALLBACK=true` — la photo de face part aussi.
- [ ] **Bloquant** — Facture issue d'une commande : prix de la commande traités comme HT, TVA ajoutée par-dessus (commande de 20 € → facture de 24 €, marquée payée à 20 €). Décision produit (prix saisis HT ou TTC pour une boutique assujettie) puis correctif avec étape 0, avant le lancement ; cas chiffré dans « Dette technique connue » (2026-10-30).
- [~] Adresse du siège saisie dans lib/legal.ts, identique à celle du registre et de Stripe — adresse saisie (commit `4472011`) ; concordance avec le registre et Stripe non vérifiable dans le dépôt (2026-10-28)
- [x] Textes publics de la zakat à aligner sur la refonte : FAQ (« dettes immédiatement exigibles » tranche une divergence), section Halal, tableau de vérification 7d (clé zakat.disclaimer disparue).

### Vérification des affirmations marketing (lot 7d)

| Affirmation conservée | Appui vérifié dans le dépôt |
| --- | --- |
| Découverte / Solo / Boutique / Commerce+, prix mensuels 0 / 9 / 16 / 29 € et annuels 0 / 90 / 160 / 290 € ; « 2 mois offerts » à l'annuel (chaque annuel vaut 10 mensualités) | Landing `apps/frontend/components/marketing/Pricing.tsx` ; page Abonnement : prix lus dans `GET /subscriptions/plans/`, mois offerts calculés par `freeMonthsPerYear` (`apps/frontend/lib/plan-pricing.ts`) ; migrations abonnements `0004_rename_plans`, `0005_plan_yearly_price` et `0014_plan_prices_boutique_commerce_plus`, `seed_plans` ; lot 7b/7c ci-dessus. ~~Prix Stripe à aligner par `stripe_sync_plans` (puis `stripe_migrate_prices` pour les abonnés en cours) avant d'annoncer la nouvelle grille.~~ Fait : `stripe_sync_plans` en production, six prix « inchangé », `stripe_migrate_prices` sans objet (validé en exploitation le 27/10/2026). |
| Découverte sans limite de durée, 30 articles actifs, 15 ventes/mois, 15 clients actifs ; Solo et au-delà illimités | Migrations des plans, `apps/backend/apps/subscriptions/limits.py` ; lot 7b. La création est bloquée dès le plafond atteint, sans supprimer les données ; désactivation articles/clients et nouveau mois libèrent les places correspondantes. |
| Stock, notes, rappels et calcul de la zakat dès Découverte | `apps/backend/apps/subscriptions/permissions.py`, modules V1 cochés ci-dessus. |
| Essai Boutique de 14 jours pour les nouveaux comptes, sans carte, puis retour automatique sur Découverte ; résiliation immédiate, données intactes | `start_trial_or_default`, `expire_trial`, `downgrade_to_free` dans `apps/backend/apps/subscriptions/services.py`, tâche `expire_trials`, `Shop.effective_plan` ; seul l'abonnement est modifié, aucun objet métier supprimé. |
| Factures PDF numérotées, WhatsApp préparé et relance automatique des impayés en Solo | `apps/backend/apps/invoices/services.py`, `apps/backend/apps/invoices/pdf.py`, `apps/backend/apps/comms/`, `apps/backend/apps/notes/services.py` (`auto_reminders`) ; V1/V2 et lots 4/6. La relance crée un rappel interne ; WhatsApp reste envoyé manuellement. |
| Boutique : tout Solo, vous + 3 membres, factures avec logo/couleur ; Commerce+ : tout Boutique, équipe illimitée | Migrations des plans, `enforce_member_limit`, vues Équipe et facturation ; lots 6/7b/7c. Les autres bénéfices annoncés sont soumis aux cases de lancement ci-dessus. |
| Utilisation dans le navigateur ; données séparées par boutique | Routes Next.js existantes, filtrage `get_shop` des vues métier et tests multi-tenant ; V1 Sécurité & droits. Aucune promesse de chiffrement, d'export intégral ou de suppression à la demande dans la FAQ. |
| Français, anglais et arabe avec lecture droite-à-gauche | `apps/frontend/i18n/locales.ts`, catalogues fr/en/ar, direction de `apps/frontend/app/layout.tsx`. |
| Zakat : trésorerie, stock à sa valeur du jour, créances et autres biens ajoutés au jour J ; dettes déduites selon l'avis choisi ; choix laissé au commerçant là où les écoles divergent, chaque règle avec ses sources ; calcul personnel, visible par son seul auteur ; estimation | `docs/zakat_referentiel.md` (§ 1) ; `compute_totals` dans `apps/backend/apps/zakat/services.py` (dettes selon `debts_mode`, sans valeur par défaut ; aucun montant tant qu'un choix manque) ; fiches « Fondement » `apps/frontend/components/zakat/basis/basisCatalog.ts` et textes `zakat.basis.*` (règle, sources, avis) ; `get_calculation` filtre par boutique et par personne (404 pour un autre membre) ; lots Z1 à Z3. |

Écarts éditoriaux : les bénéfices détaillés demandés pour la landing ne figurent pas
tous mot pour mot dans `plans.*.fN` (notamment fidélité, statistiques, inventaire photo,
QR codes et détail des factures). Les noms restent ceux de l'app ; les accroches et
les listes suivent le brief 7d, sans modifier les traductions de l'application.
Les anciennes promesses hors-ligne, application installable, import Excel/CSV,
partenariats halal, chiffrement et export/suppression des données à volonté ont été
retirées de la FAQ faute de livraison attestée. La résiliation en fin de période
et la condition automatique « nisab atteint » ont été corrigées selon le code.

Recette locale du 2026-10-16 : lint (0 erreur, 7 avertissements préexistants),
typecheck, text, deps, i18n, tokens et build validés dans Docker. Dépendances de
l'hôte incomplètes : son typecheck échoue, celui du conteneur passe.
Pricing et FAQ vérifiés visuellement et avec Playwright à 1440 / 768 / 360 px :
prix mensuels/annuels, 4 CTA vers `/register`, 10 accordéons sans coupure,
grilles 4 / 2 / 1 et seuils 639 / 640 / 1099 / 1100 px ; aucune erreur navigateur.
Écart préexistant hors lot : à 360 px, le bouton « Créer mon compte — gratuit »
de `components/marketing/FinalCta.tsx` déborde de 24 px (document large de 384 px).
Pricing et FAQ ne débordent pas. Validation staging non effectuée dans ce lot.

Recette 7d-2 du 2026-10-16 : toutes les sections examinées à 360 / 768 / 1024 /
1440 / 1920 / 2560 px. Conteneur global 1400 px et padding `clamp(20px, 4vw, 56px)` ;
titres de section limités à 720 px, FAQ à 800 px, titre/texte final à 760 / 540 px,
tous centrés. Même structure des quatre cartes, prix alignés par rangée, boutons
de 56 px et notes avec 40,3 px réservés ; « Commencer gratuitement » sur une ligne
à 1440 px. Le CTA final et le débordement de 9 px des anneaux du sceau halal révélé
après sa correction sont corrigés : aucun défilement horizontal aux six largeurs.
Images proportionnelles, prix mensuels/annuels vérifiés, aucune erreur navigateur.
Contrôles Docker 7d-2 validés : lint (0 erreur, 7 avertissements préexistants),
typecheck, text, deps, i18n, tokens et build. Pas de validation staging dans ce lot.

Traitements particuliers : le hero conserve son gabarit de 1640 px et son image
proportionnelle ; « Comment ça marche » conserve sa maquette fixe de 330 × 670 px.
Cette dernière laisse un espace latéral marqué à 1920 / 2560 px : un réagencement
du visuel demanderait un lot graphique dédié. Les marges de lecture de la FAQ et
du CTA final sont intentionnelles. Écart éditorial préexistant hors de ce lot de
largeur, résolu en 7d-3 : Features conservait une pastille d'attente et les sections
Features / How / Halal annonçaient encore les partenariats.

Recette 7d-3 du 2026-10-16 : 8 cartes conservées, Factures PDF et Factures fournisseurs
et inventaire photo conformes au brief ; troisième étape limitée à la page boutique,
aux messages et aux factures. La section Valeurs ne comporte plus que la zakat,
avec texte élargi, titre adapté et anneaux séparés du paragraphe sur mobile.
La promesse « au juste montant » de Problem a aussi été remplacée par une estimation.
Recherche complète dans les sources marketing et contrôle du titre / de la description
rendus : aucune mention de partenariat, ribâ ou annonce d'attente. Aucun Open Graph
ou Twitter spécifique à la landing n'est déclaré ; aucune mention héritée à retirer.
Recette visuelle et Playwright à 360 / 1024 / 1440 / 1920 px : pas de débordement,
alignement des tarifs conservé, aucune erreur navigateur. Les fonctions Boutique
encore non livrées restent bloquantes dans la checklist de lancement ci-dessus.
Contrôles Docker 7d-3 validés : lint (0 erreur, 7 avertissements préexistants),
typecheck, text, deps, i18n, tokens et build. Validation staging non effectuée.

## Légende et bonnes pratiques d'usage

- ~~Cocher la case **uniquement** quand la tâche est testée et déployée en staging.~~ (remplacée le 2026-10-28 : la production a été ouverte directement, validations datées)
- Cocher la case quand la tâche est testée et déployée : en staging, ou directement en production avec une validation attribuée et datée.
- Si une tâche se découpe en sous-tâches non prévues, les ajouter en sous-puces et cocher au fur et à mesure.
- Si une tâche est annulée, la barrer avec `~~texte~~` plutôt que de la supprimer (trace de la décision).
- Pour estimer l'avancement d'une phase, compter `[x]` / total. Une phase est validée à 100 %.
- Toute nouvelle fonctionnalité réservée à une formule livre dans le même lot : sa clé de gating côté serveur, sa ligne `plans.*.fN` en fr/en/ar et sa vérification dans l'audit subscription.

## Discipline de mise à jour

Ce fichier doit être modifié **dans le même commit** que la fonctionnalité qu'il décrit, jamais après coup. Un `[x]` coché dans un commit séparé, ou plus tard, est un signal que la discipline a été relâchée.
