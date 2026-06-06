# Plan d'avancement — SaaS commerçants

> Fichier vivant : on coche au fur et à mesure. Format Markdown standard, lisible sur GitHub, GitLab, VS Code, Obsidian.
>
> **Convention** :
> - `[ ]` = à faire
> - `[~]` = en cours (remplacer manuellement par cette syntaxe)
> - `[x]` = fait
>
> Mettre à jour la date dans **Dernière mise à jour** quand on touche au fichier.

**Dernière mise à jour** : 2026-06-06
**Version actuelle en développement** : Phase V1 — RBAC (rôles & permissions par module)

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
- [ ] Mettre en place Sentry (DSN en env var, désactivé en local)

### Frontend Next.js de base

- [x] Initialiser projet Next.js + TypeScript
- [x] Installer Tailwind CSS + shadcn/ui
- [x] Installer React Hook Form + Zod
- [x] Installer TanStack Query
- [x] Mettre en place le client API avec gestion du token d'auth
- [x] Créer le layout mobile-first de base (header + bottom nav)

### Infrastructure OVH (peut être différé)

- [ ] Créer un VPS ou Public Cloud Instance OVH
- [ ] Provisionner PostgreSQL managé OVHcloud
- [ ] Provisionner un bucket Object Storage privé (`saas-private`) + un bucket public (`saas-public`)
- [ ] Configurer un nom de domaine + HTTPS (Let's Encrypt via Nginx/Traefik)
- [ ] Configurer un domaine de staging séparé

### CI/CD

- [ ] Configurer GitHub Actions (ou GitLab CI)
- [ ] Pipeline : lint → tests backend → tests frontend → build Docker → déploiement staging
- [ ] Tests obligatoires multi-tenant (un user de boutique A ne voit pas la boutique B)

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

### Gestion d'équipe & RBAC (URS-005, URS-061)

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

### Telegram (URS-068, URS-069)

- [ ] Modèle `TelegramAccount` (bot token, chat_id cible)
- [ ] Endpoint connexion bot avec vérification des droits via API Telegram
- [ ] Modèle `TelegramPublication` (message, image, planification, statut)
- [ ] Worker Celery Beat qui publie aux heures programmées
- [ ] Historique des publications
- [ ] Désactivation d'une publication programmée

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

- [ ] Initialiser le service FastAPI séparé
- [ ] Authentification interne entre Django et FastAPI (clé partagée)
- [ ] Endpoint health-check

### OCR factures fournisseur (URS-042 à URS-045)

- [ ] Intégration PaddleOCR ou Tesseract dans le service IA
- [ ] Endpoint upload facture + extraction texte brut
- [ ] Modèle `UploadedDocument`, `OcrResult`
- [ ] Extraction structurée : produits, quantités, prix
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

### Abonnement SaaS (URS-064, URS-065)

- [ ] Modèles `Subscription`, `SubscriptionPlan`
- [ ] Intégration Stripe Billing
- [ ] Webhook Stripe → mise à jour de l'abonnement local
- [ ] Limites offre gratuite (nb produits, nb commandes/mois)
- [ ] Page tarifs + page upgrade

### Monitoring

- [ ] Sentry actif sur backend + frontend
- [ ] UptimeRobot ou Better Stack configuré
- [ ] Logs structurés (JSON) en production
- [ ] Alertes mail sur erreurs critiques

### Backups

- [ ] Backups PostgreSQL automatiques activés
- [ ] **Test de restauration mensuel** (un backup non testé n'est pas un backup)
- [ ] Versioning Object Storage activé si possible
- [ ] Plan de rollback documenté

---

## Légende et bonnes pratiques d'usage

- Cocher la case **uniquement** quand la tâche est testée et déployée en staging.
- Si une tâche se découpe en sous-tâches non prévues, les ajouter en sous-puces et cocher au fur et à mesure.
- Si une tâche est annulée, la barrer avec `~~texte~~` plutôt que de la supprimer (trace de la décision).
- Pour estimer l'avancement d'une phase, compter `[x]` / total. Une phase est validée à 100 %.
