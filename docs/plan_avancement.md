# Plan d'avancement — SaaS commerçants

> Fichier vivant : on coche au fur et à mesure. Format Markdown standard, lisible sur GitHub, GitLab, VS Code, Obsidian.
>
> **Convention** :
> - `[ ]` = à faire
> - `[~]` = en cours (remplacer manuellement par cette syntaxe)
> - `[x]` = fait
>
> Mettre à jour la date dans **Dernière mise à jour** quand on touche au fichier.

**Dernière mise à jour** : 2026-10-16
**Version actuelle en développement** : Phase V3 — Page web publique / vitrine (démarrée), Phase V2 largement avancée (WhatsApp fait, Telegram abandonné : pas de publications automatiques)

---

## Phase 0 — Setup initial du projet

### Dépôt & organisation

- [x] Créer le dépôt Git (monorepo `saas-commerce/`)
- [x] Initialiser l'arborescence : `apps/frontend`, `apps/backend`, `apps/ai-service`, `infra/`, `docs/`
- [x] Ajouter `.gitignore` adapté Python + Node
- [x] Ajouter `README.md` racine
- [x] Copier les 3 documents de contexte dans `docs/` (URS, fiche technique, instructions)
- [ ] Créer la branche `main` protégée + branche `develop`

### Environnement local

- [x] Créer `docker-compose.yml` avec services : `postgres`, `redis`, `backend`, `frontend`, `ai-service`, `nginx`
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

- [~] Créer un VPS ou Public Cloud Instance OVH — VPS dédié retenu ; préparation du serveur documentée (docs/exploitation/deploiement.md), reste à le commander
- ~~Provisionner PostgreSQL managé OVHcloud~~ — remplacé par PostgreSQL 16 en conteneur sur le VPS
- [~] PostgreSQL 16 en conteneur (image `deploy/postgres` avec WAL-G, volume nommé, `deploy/app/compose.yml`) — sauvegardes : section Backups
- [ ] Provisionner le bucket privé de production (`mizan-production-private`, et `mizan-staging-private` pour staging, prévus dans `deploy/env/*.env.example`), distinct de `mizan-private` (bucket de développement, jamais partagé avec la production) + un bucket public si besoin
- [~] Configurer un nom de domaine + HTTPS (Let's Encrypt via Caddy, `deploy/edge`) — reste les enregistrements DNS
- [~] Configurer un domaine de staging séparé — `staging.mizan-commerce.com` derrière une authentification basique (Caddy)

### CI/CD

- [~] Configurer GitHub Actions (ou GitLab CI) — `.github/workflows/ci.yml`, Dependabot ; reste à protéger `main` (docs/ci.md)
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

- [x] Modèle `ZakatCalculation`
- [x] Champ date annuelle de zakat sur boutique ou utilisateur
- [x] Calcul automatique de la valeur du stock zakatable (somme produits actifs × prix d'achat)
- [x] Saisie liquidités, créances, dettes court terme
- [x] Calcul à 2,5 % avec mention "estimation indicative" en évidence
- [x] Rappel automatique avant la date annuelle
- [x] Possibilité de corriger chaque montant manuellement
- [x] Sauvegarde du calcul dans l'historique

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

- [ ] Export CSV commandes (avec filtre période)
- [ ] Export CSV stock (quantités, prix, valeur estimée)
- [ ] Export PDF zakat (mention "indicatif" obligatoire)
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
- [~] Puis : pull request, fusion (session Postman abandonnée : Postman n'est plus utilisé, collection retirée du dépôt)
- [~] Lot 4 (après fusion)
  - [~] Page et formulaire Rappels + assignation à un employé
  - [~] Export de l'activité d'un client avec filtres (URS-104, proposée) : fenêtre « Exporter » de la carte Activité, contenu et période, nombre de lignes annoncé, CSV en flux (BOM, « ; », langue de l'interface), journal d'audit
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
  - [ ] Dette : factures PDF en arabe (français utilisé en attendant)
- [~] Lot 7 — Compte et réglages
  - [x] Badge d'abonnement (sidebar, menu mobile) — formule courante, « Essai · N j », « Essai terminé » ; remplace les cartes d'essai, audit `account-menu`
  - [x] Raccourci clair/sombre dans le header (à côté de la loupe sur mobile, avant la barre de recherche sur desktop)
  - [x] Menu desktop : sidebar translucide déployée (272 px) ou en rail (80 px, préférence gardée sur le compte), accordéon Articles → Catalogue / Stock, groupe Compte avec Abonnement, pied d'une ligne dont « ⋯ » ouvre le menu du compte (apparence, langue, Se déconnecter), bouton replier/déplier sur le bord et Ctrl+B, sans défilement à 1440×900, flyout du rail au survol et au clavier, audit `sidebar`
  - [x] Refonte de Paramètres boutique, Équipe, Abonnement et Mon profil (maquettes d'abord)
    - [x] Page Abonnement (7c-1) : votre formule (essai « Jour N sur 14 », CTA « Garder »), votre activité comparée aux plafonds Découverte, choix de formule mensuel / annuel (prix annuels 0 / 90 / 190 / 390 €, migration 0005), 4 cartes sur desktop et onglets sur mobile, paiement en ligne pas encore activé (`UpgradeSheet`), résiliation discrète ; audit `subscription`
    - [x] Paramètres boutique et Équipe (7c-2) : sous-navigation desktop collante (208 px), liens verrouillés visibles et formule traduite, « Autres réglages » sur mobile ; cartes Boutique à plat et barre d'enregistrement dans la colonne ; formules sur 4 colonnes dès 880 px de conteneur, sinon 2 × 2 sur desktop ; Équipe en tableau / cartes, usage et plafond API, places disponibles et ajout limité via `UpgradeSheet` ; audits `settings`, `team` et audits existants adaptés
    - [x] Mon profil (7c-3) : en-tête du compte et vérification d’email, cartes Informations / Mot de passe côte à côte sur desktop et empilées sur mobile, composants et logique existants conservés ; audit `profile`, six maquettes 7c versionnées
    - [x] Pages marketing : grille 4 offres (Pricing, Faq)
    - [x] Pages marketing (7d-2) : largeur globale 1400 px, marges fluides, cartes et notes alignées, pastille Boutique flottante, CTA final et anneaux du sceau contenus sur mobile ; recette aux six largeurs ci-dessous
    - [x] Pages marketing (7d-3) : 8 cartes cohérentes avec la grille, partenariats et mentions d'attente retirés, section Valeurs recentrée sur la zakat ; contrôle des métadonnées et recette aux quatre largeurs ci-dessous
  - [x] Formules, données et gating (7b-1) : Découverte 0 € (`free`), Solo 9 € (ex-`pro`), Boutique 19 € (ex-`boutique_plus`, essai 14 j), Commerce+ 39 € ; codes renommés en place (migrations 0003, 0004) ; limites Découverte 30 articles, 15 ventes/mois, 15 clients ; membres 1/1/4/∞ ; limites atomiques (verrou boutique) ; commandes et zakat dès Découverte, exports en Boutique, logo et couleur des factures en Boutique ; endpoint `GET /subscriptions/plans/` ; textes de la page Abonnement fr/en/ar
  - [x] Formules, jauges et cartes de mise à niveau (7b-2) : compteurs d'usage dans `GET /subscriptions/current/` (articles actifs, ventes du mois, clients actifs, membres) ; `UsageGauge` (ambre dès 80 %, rouge à la limite) dans Paramètres → Abonnement et en bandeau des listes Commandes, Clients, Articles ; limite atteinte : le bouton de création (et « Vendre ») ouvre `UpgradeSheet` au lieu du 400 ; `UpgradeCard` au bénéfice sur Facture PDF, WhatsApp, membres, exports, OCR, logo et couleur des factures (contrôles figés sous Boutique) ; limites articles et clients aussi à la réactivation (verrou atomique, test de concurrence) ; résumé quotidien réservé à `daily_digest` ; pastille de formule traduite par code ; audit `usage`, audit `sidebar` stabilisé

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

- [ ] Page mentions légales
- [ ] Page politique de confidentialité
- [ ] Endpoint export des données utilisateur
- [ ] Endpoint suppression / anonymisation du compte
- [ ] Consentement marketing si applicable

### Abonnement SaaS (URS-064, URS-065, URS-100)

- [x] Modèles `Subscription`, `SubscriptionPlan` + seed des 3 plans
- [x] Essai 14j Boutique+ à l'inscription (URS-100) + tâche Celery d'expiration
- [x] Gating `HasPlanForFeature` câblé sur orders / invoices / zakat / whatsapp / public_pages / multi_user (ajout et modification d'un membre) / ocr
- [x] Limites offre gratuite (nb produits, nb commandes/mois)
- [x] Endpoints `GET /current/` + `POST /change/` (résiliation → free)
- [x] Frontend : bandeau d'essai, page Settings → Abonnement, gating UI menus
- [ ] Intégration Stripe Billing
- [ ] Webhook Stripe → mise à jour de l'abonnement local
- [ ] Page tarifs publique + flow upgrade payant

### Monitoring

- [~] Sentry actif sur backend + frontend — intégré, inactif tant que les DSN ne sont pas renseignés
- [ ] UptimeRobot ou Better Stack configuré — sonde prête : `/healthz` (base + Redis, sans authentification)
- [~] Logs structurés (JSON) en production — Django, gunicorn et Celery sur stdout, données personnelles masquées
- [ ] Alertes mail sur erreurs critiques

### Backups

- [~] Backups PostgreSQL automatiques activés — WAL-G : journal archivé en continu (perte ≤ 1 min), sauvegarde complète chaque nuit, 30 jours, chiffrée, bucket dans une autre région, surveillance par signal ; éprouvé en local avec MinIO (`deploy/backup/test-local.sh`), à activer sur le serveur (bucket, clé, URL de surveillance) — docs/exploitation/sauvegardes.md
- [~] **Test de restauration mensuel** (un backup non testé n'est pas un backup) — automatique (service `backup`, signal RESTORE_TEST_HEARTBEAT_URL) ; restauration manuelle à un instant précis : `deploy/backup/restore.sh`
- [~] Versioning Object Storage activé si possible — procédure documentée (bucket privé des fichiers), à activer sur OVH
- [~] Plan de rollback documenté — `deploy/rollback.sh` + docs/exploitation/deploiement.md, à éprouver en staging

### Dette technique connue

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

- [ ] Limites de formule (URS-100) : plusieurs boutons de création n'ont pas de garde côté
      client à la limite (actions rapides, états vides, « Nouvelle vente » depuis une fiche
      client, accueil d'une nouvelle boutique, /orders/new). Le serveur refuse (400), mais
      la carte de mise à niveau ne s'ouvre pas avant le formulaire.

- [ ] Réglage du résumé quotidien modifiable sous la formule Boutique (Découverte, Solo) alors
      que l'envoi y est suspendu : le verrouiller côté réglages, comme les autres options
      réservées à Boutique.

- [ ] Journal d'activité (Commerce+) : écran de lecture des logs d'audit existants — à livrer
      avant le lancement.

---

## Checklist de lancement

Revue du 2026-10-16 — **ne pas publier la landing avant que tout soit livré**.
La grille décrit la cible commerciale. Les cases ci-dessous restent ouvertes tant que
la livraison complète et la recette de lancement ne sont pas attestées ; la présence
d'une clé dans `FEATURE_MIN_PLAN` ou de code partiel ne suffit pas.

- [ ] Fidélité — modèles, services et API dans `apps/backend/apps/loyalty/`, mais aucune interface commerçant ; gating de formule Boutique à raccorder sur ces vues.
- [ ] Statistiques de ventes — graphique et API présents (`components/dashboard/sales/`, `apps/backend/apps/core/views.py`, `apps/backend/apps/core/services.py`), lot 4 encore en cours ; restriction `sales_stats` à raccorder côté serveur.
- [ ] Inventaire photo (Boutique) — promis dans Pricing et Features ; clé `visual_inventory` seulement, détection visuelle de la phase V6 non livrée.
- [ ] QR codes (Boutique) — promis dans Pricing ; clé `qr_codes` seulement, génération, impression et scan de la phase V6 non livrés.
- [ ] Page boutique en ligne — code admin et public présent (`apps/backend/apps/public_pages/`, `app/boutique/`, `components/public-page-admin/`) ; phase V3 encore non validée dans ce suivi, recette de publication à terminer.
- [ ] Modèles de messages — code et audit présents (`components/settings/messages/`, `e2e/audit-message-templates.mjs`), lot 4 encore en cours ; restriction `message_templates` à raccorder côté serveur.
- [ ] Rôles et permissions — déjà implémentés et cochés en V1, écran Équipe livré en 7c ; confirmer la recette de lancement (gating `multi_user`, limites 1 / 1 / 4 / illimité), sans les présenter comme du code absent.
- [ ] Journal d'activité — logs d'audit existants (`apps/backend/apps/core/models.py`), mais écran de lecture Commerce+ non livré.
- [ ] Support prioritaire — clé `priority_support` déclarée ; aucun parcours ni engagement de support attesté dans le code ou ce suivi.
- [ ] Souscription payante — Stripe Billing et webhooks non livrés ; l'API publique autorise uniquement le retour sur Découverte (`apps/backend/apps/subscriptions/views.py`).
- [ ] Factures fournisseurs (Boutique) — promises dans Pricing et Features ; import et lecture présents (`apps/backend/apps/ocr/`), lot 5 encore en cours, recette complète à terminer.
- [ ] Exports (Boutique) — promis dans Pricing ; activité client CSV présente (`apps/backend/apps/customers/views.py`), lot 4 encore en cours ; terminer la recette et préciser le périmètre (exports généraux V4 encore non cochés).
- [ ] Partenariats halal (V5) : retirés de la landing, à remettre quand le module est livré.

### Vérification des affirmations marketing (lot 7d)

| Affirmation conservée | Appui vérifié dans le dépôt |
| --- | --- |
| Découverte / Solo / Boutique / Commerce+, prix mensuels 0 / 9 / 19 / 39 € et annuels 0 / 90 / 190 / 390 € | `settings.subscription.plans.*` dans `apps/frontend/messages/fr.json`, migrations abonnements `0004_rename_plans` et `0005_plan_yearly_price` ; lot 7b/7c ci-dessus. |
| Découverte sans limite de durée, 30 articles actifs, 15 ventes/mois, 15 clients actifs ; Solo et au-delà illimités | Migrations des plans, `apps/backend/apps/subscriptions/limits.py` ; lot 7b. La création est bloquée dès le plafond atteint, sans supprimer les données ; désactivation articles/clients et nouveau mois libèrent les places correspondantes. |
| Stock, notes, rappels et calcul de la zakat dès Découverte | `apps/backend/apps/subscriptions/permissions.py`, modules V1 cochés ci-dessus. |
| Essai Boutique de 14 jours pour les nouveaux comptes, sans carte, puis retour automatique sur Découverte ; résiliation immédiate, données intactes | `start_trial_or_default`, `expire_trial`, `downgrade_to_free` dans `apps/backend/apps/subscriptions/services.py`, tâche `expire_trials`, `Shop.effective_plan` ; seul l'abonnement est modifié, aucun objet métier supprimé. |
| Factures PDF numérotées, WhatsApp préparé et relance automatique des impayés en Solo | `apps/backend/apps/invoices/services.py`, `apps/backend/apps/invoices/pdf.py`, `apps/backend/apps/comms/`, `apps/backend/apps/notes/services.py` (`auto_reminders`) ; V1/V2 et lots 4/6. La relance crée un rappel interne ; WhatsApp reste envoyé manuellement. |
| Boutique : tout Solo, vous + 3 membres, factures avec logo/couleur ; Commerce+ : tout Boutique, équipe illimitée | Migrations des plans, `enforce_member_limit`, vues Équipe et facturation ; lots 6/7b/7c. Les autres bénéfices annoncés sont soumis aux cases de lancement ci-dessus. |
| Utilisation dans le navigateur ; données séparées par boutique | Routes Next.js existantes, filtrage `get_shop` des vues métier et tests multi-tenant ; V1 Sécurité & droits. Aucune promesse de chiffrement, d'export intégral ou de suppression à la demande dans la FAQ. |
| Français, anglais et arabe avec lecture droite-à-gauche | `apps/frontend/i18n/locales.ts`, catalogues fr/en/ar, direction de `apps/frontend/app/layout.tsx`. |
| Zakat : stock, trésorerie, créances recouvrables, dettes immédiatement exigibles, taux par défaut 2,5 %, nisab à renseigner, estimation indicative | `apps/backend/apps/zakat/services.py`, `apps/backend/apps/zakat/models.py`, mentions `zakat.disclaimer` dans le catalogue français ; V1 Zakat. |

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

- Cocher la case **uniquement** quand la tâche est testée et déployée en staging.
- Si une tâche se découpe en sous-tâches non prévues, les ajouter en sous-puces et cocher au fur et à mesure.
- Si une tâche est annulée, la barrer avec `~~texte~~` plutôt que de la supprimer (trace de la décision).
- Pour estimer l'avancement d'une phase, compter `[x]` / total. Une phase est validée à 100 %.
- Toute nouvelle fonctionnalité réservée à une formule livre dans le même lot : sa clé de gating côté serveur, sa ligne `plans.*.fN` en fr/en/ar et sa vérification dans l'audit subscription.

## Discipline de mise à jour

Ce fichier doit être modifié **dans le même commit** que la fonctionnalité qu'il décrit, jamais après coup. Un `[x]` coché dans un commit séparé, ou plus tard, est un signal que la discipline a été relâchée.
