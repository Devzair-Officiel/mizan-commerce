# Instructions de projet — SaaS mobile-first pour commerçants

> Ce document est le **contexte de référence** du projet. Il doit être collé dans les *Project instructions* de Claude (ou utilisé comme document fixe en début de toute conversation de développement) afin de garantir des réponses cohérentes, fiables et alignées avec les choix déjà faits.
>
> **Règle d'or** : tout ce qui figure ici est une décision validée. Si quelque chose doit changer, cela se fait explicitement en modifiant ce document, jamais au détour d'une réponse.

---

## 1. Identité du projet

- **Nom de travail** : SaaS commerçants (à renommer commercialement plus tard).
- **Pitch en une phrase** : *Une application mobile simple pour gérer, présenter et développer son commerce depuis son téléphone.*
- **Public cible** : petits commerçants qui gèrent aujourd'hui leur activité avec WhatsApp, des notes, du papier, des conversations dispersées, et qui n'ont pas d'outil centralisé.
- **Anti-positionnement** : ce n'est **pas** un ERP, **pas** un Shopify, **pas** une caisse enregistreuse complexe. C'est un **assistant quotidien de commerce** mobile-first.
- **Langue produit** : interface en français en V1, code et identifiants techniques en anglais (cf. §10).

---

## 2. Vision et problèmes résolus

Le produit centralise dans une seule application mobile :

> stock, ventes, clients, colis, notes, rappels, zakat, communication et présence en ligne.

Il résout :

- informations dispersées dans WhatsApp / Notes / papier ;
- manque de visibilité sur le stock réel ;
- commandes oubliées ou mal suivies ;
- clients et adresses difficiles à retrouver ;
- relances et paiements oubliés ;
- difficulté à préparer les colis ;
- calcul de zakat fait à la main et approximativement ;
- absence de page web simple pour présenter ses produits ;
- difficulté à publier régulièrement sur Telegram ou à préparer ses messages WhatsApp ;
- difficulté à trouver des partenaires halal pour concrétiser des projets sans prêt à intérêt.

---

## 3. Périmètre fonctionnel (vue d'ensemble)

L'application est organisée autour de 21 modules :

1. Authentification et compte
2. Boutique / espace commerçant
3. Tableau de bord
4. Produits
5. Stock (mouvements, alertes, seuils)
6. Clients
7. Commandes (statuts paiement + préparation)
8. Expédition (fiche colis, suivi)
9. Notes et rappels
10. Zakat commerciale (calcul indicatif)
11. OCR (factures fournisseur, adresses)
12. Détection d'objets / inventaire visuel
13. QR code / scan produit
14. Automatisations internes (rappels d'impayé, résumé du jour)
15. Messages WhatsApp préparés (jamais envoyés automatiquement)
16. Publications Telegram (programmables via bot)
17. Page web publique / mini-site vitrine
18. Projets et partenariats halal (mise en relation uniquement)
19. Exports (CSV / PDF)
20. Sécurité et droits (multi-tenant strict)
21. Abonnement SaaS (Stripe Billing)

> Le détail exhaustif des user stories (URS-001 à URS-088) est conservé dans le document `urs_saas_commercant_mobile.md` du projet. Toute discussion de fonctionnalité doit pouvoir être rattachée à un ou plusieurs URS.

---

## 4. Roadmap par version (à respecter strictement)

**V1 — Gestion interne (MVP)** : compte, boutique, produits + photos, stock, clients, commandes, notes, rappels, zakat simple, sécurité de base. URS-001 à URS-041 + URS-061 à URS-063.

**V2 — Communication simple** : messages WhatsApp préparés (copier / ouvrir WhatsApp), historique, publications Telegram programmées. URS-066 à URS-069.

**V3 — Page web publique** : activation page, thèmes simples, header, description, produits/services visibles, boutons WhatsApp/Telegram/Instagram, prévisualisation mobile. URS-070 à URS-078.

**V4 — Catalogue avancé et exports** : filtres, badges, demande de commande depuis la page, formulaire de contact, statistiques, exports commandes/stock/zakat. URS-058 à URS-060.

**V5 — Projets et partenariats halal** : fiches projets, profils partenaires, manifestation d'intérêt, documents, signalement, avertissements de cadrage. URS-079 à URS-088.

**V6 — IA, OCR et inventaire assisté** : OCR facture/adresse, QR code/scan, reconnaissance produit, détection visuelle de stock, comptage assisté avec validation humaine. URS-042 à URS-054.

**Règle stricte** : on ne commence **jamais** par l'IA, la détection visuelle ou la mise en relation. Le cœur produit doit d'abord résoudre :

> aider le commerçant à arrêter de gérer son activité dans WhatsApp, Notes et papier.

### MVP minimal à livrer en premier

- Créer un compte
- Créer une boutique
- Ajouter des produits avec photo
- Suivre le stock
- Ajouter des clients
- Créer des commandes
- Suivre les paiements
- Créer des notes et rappels
- Calculer une zakat indicative

---

## 5. Stack technique imposée

Cette stack est **figée** sauf décision explicite documentée ici.

| Couche | Technologie | Rôle |
|---|---|---|
| Frontend | Next.js + React + TypeScript | Admin commerçant, pages publiques, mobile-first, possible évolution PWA |
| UI | Tailwind CSS + shadcn/ui | Design propre, composants réutilisables |
| Formulaires | React Hook Form + Zod | Validation côté frontend |
| State serveur | TanStack Query | Cache, synchro, requêtes API |
| Backend métier | Django + Django REST Framework | Cœur applicatif, API REST |
| Back-office interne | Django Admin | Pour l'admin SaaS uniquement |
| Base de données | PostgreSQL managé OVHcloud | Données métier relationnelles |
| Cache / broker | Redis | Cache, files Celery, rate limit |
| Tâches async | Celery + Celery Beat | Rappels, OCR, Telegram, PDF, emails |
| Stockage fichiers | OVHcloud Object Storage (S3-compatible) | Photos, factures, documents |
| Service IA | FastAPI séparé | OCR + détection objets (isolé du backend métier) |
| OCR | PaddleOCR ou Tesseract | Lecture facture/adresse |
| Détection objets | YOLO / Ultralytics | Comptage visuel produits (V6) |
| Paiement SaaS | Stripe Billing | Abonnements |
| Emails | Brevo ou Resend (puis Amazon SES si volume) | Transactionnels |
| PDF | WeasyPrint (ou Playwright PDF) | Fiches colis, exports |
| Reverse proxy | Nginx ou Traefik | HTTPS, routage |
| Conteneurs | Docker + Docker Compose | Déploiement reproductible |
| Monitoring | Sentry + UptimeRobot (ou Better Stack) | Erreurs + uptime |
| CI/CD | GitHub Actions ou GitLab CI | Tests + déploiement |

### Choix qu'on n'utilise pas (et pourquoi)

- **Pas de Firebase / Supabase / BaaS clé en main** : on construit une base maîtrisée et portable.
- **Pas de Mongo / NoSQL** : le modèle est très relationnel (boutique → produits → mouvements de stock → commandes → lignes).
- **Pas de microservices au départ** : monolithe Django + un seul service séparé (IA FastAPI).

---

## 6. Architecture générale

```
[Utilisateur mobile / navigateur]
          ↓
[Frontend Next.js]
          ↓
[API Django REST Framework]
          ↓
[PostgreSQL managé OVHcloud]

[API Django REST] → [Object Storage OVHcloud]   (photos, factures, documents)
[API Django REST] → [Redis] → [Celery Workers]  (rappels, PDF, emails, Telegram, OCR)
[Celery / API]    → [Service IA FastAPI]        (OCR, analyse image, détection produits)
```

### Services Docker prévus

```
frontend-next
backend-django
worker-celery-default
worker-celery-ocr
worker-celery-telegram
celery-beat
redis
fastapi-ai
nginx
```

PostgreSQL n'est pas dans Docker en production : on utilise PostgreSQL managé OVHcloud.

### Organisation Git

**Monorepo** au départ :

```
saas-commerce/
  apps/
    frontend/       # Next.js
    backend/        # Django + DRF
    ai-service/     # FastAPI
  infra/            # Docker, nginx, configs
  docs/             # URS, fiche technique, ce document
```

---

## 7. Modèle de données — règles structurantes

### Multi-tenant par `shop_id`

- **Une seule base PostgreSQL**, un schéma principal, toutes les boutiques dans les mêmes tables.
- Chaque table métier porte une colonne `shop_id` (FK vers la boutique).
- **Pas de base par utilisateur** : trop coûteux à exploiter, à migrer, à sauvegarder.
- Tous les querysets côté backend sont filtrés par `shop_id` du membre courant (via `shop_members`).
- **Row Level Security PostgreSQL** envisagée comme défense supplémentaire.

### Entités principales (référence)

`User`, `Shop`, `ShopMember`, `Product`, `StockMovement`, `Customer`, `Order`, `OrderLine`, `Shipment`, `Note`, `Reminder`, `ZakatRecord`, `OcrDocument`, `WhatsappMessage`, `TelegramPost`, `PublicPage`, `PageSection`, `ContactButton`, `Project`, `ProjectFundingLine`, `ProjectDocument`, `PartnerProfile`, `ProjectInterest`, `ProjectReport`.

> Le schéma détaillé (champs par table) est dans le document URS.

### Conventions de schéma

- IDs en UUID (recommandé) ou bigint selon usage public/privé.
- `created_at`, `updated_at` sur toutes les entités métier.
- Soft delete (désactivation) plutôt que suppression sur produits, clients, projets.
- Mouvements de stock = source de vérité de la quantité (jamais réécrire `quantity` directement, toujours via un `StockMovement`).
- Argent stocké en entier (centimes) ou `Decimal` strict — **jamais `float`**.

---

## 8. Règles métier non négociables

### WhatsApp — manuel uniquement

- L'application **ne doit JAMAIS** envoyer automatiquement de message WhatsApp.
- Elle peut uniquement : préparer un message, permettre de le modifier, le copier, ouvrir WhatsApp avec un message prérempli (`wa.me/...?text=...`).
- L'envoi reste **toujours** une action humaine.
- L'historique stocke ce que l'utilisateur déclare avoir envoyé.

### Telegram — programmation autorisée

- Publication via bot Telegram uniquement, après que le commerçant a connecté son canal/groupe.
- Le bot doit avoir les droits nécessaires côté Telegram. Vérification automatique à la connexion.

### Zakat — calcul indicatif

- L'application affiche **toujours** clairement que le résultat est une **estimation indicative**.
- Calcul standard : **2,5 %** sur l'assiette zakatable.
- Assiette = stock zakatable (valeur estimée) + liquidités d'activité + créances clients récupérables − dettes commerciales court terme (selon ce que l'utilisateur saisit).
- L'utilisateur peut toujours corriger manuellement les montants proposés.
- Aucune valeur de nisab fixée par défaut sans permettre la modification.
- Export PDF possible.

### Module Projets / Partenariats halal — cadrage strict

La plateforme **NE DOIT PAS** :

- collecter de fonds ;
- promettre un rendement ;
- signer de contrat à la place des utilisateurs ;
- vendre des parts ;
- organiser de prêt à intérêt ;
- garantir la rentabilité ;
- conseiller juridiquement ou financièrement ;
- se présenter comme une plateforme de financement participatif.

Elle peut **uniquement** : permettre de présenter un projet, un besoin, une enveloppe indicative, chercher un associé/partenaire, échanger, partager des documents, signaler un projet douteux, et **rappeler que les accords se font directement entre les parties**.

Avertissements obligatoires : avant publication d'un projet et avant manifestation d'intérêt.

### IA / OCR / détection — toujours validation humaine

- L'IA **propose**, l'utilisateur **valide**.
- Aucune modification de stock automatique depuis l'IA sans confirmation explicite.
- Les résultats OCR / détection affichent un niveau de confiance quand c'est possible.
- Erreurs toujours corrigeables par l'utilisateur.

---

## 9. Principes UX non négociables

- **Mobile-first** : chaque écran est d'abord pensé pour un téléphone, puis adapté.
- Interface très simple, peu de texte, gros boutons, actions rapides.
- Formulaires courts, possibilité de corriger facilement.
- Photos et visuels mis en avant.
- Toujours demander validation humaine pour les actions IA.
- **Jamais** automatiser WhatsApp.
- **Jamais** modifier un stock automatiquement depuis l'IA sans validation.
- Boutons "Nouvelle vente", "Ajouter produit", "Ajouter client" accessibles en un tap depuis l'accueil.
- Le tableau de bord affiche toujours : commandes à préparer, paiements en attente, stock faible, rappels du jour.

---

## 10. Conventions de développement

### Nommage

- Code et identifiants techniques en **anglais** (`product`, `stock_movement`, `shop_id`).
- Interface utilisateur en **français** (V1).
- Tables et colonnes PostgreSQL en `snake_case` au pluriel pour les tables (`products`, `stock_movements`).
- Endpoints API en `kebab-case` au pluriel (`/api/products`, `/api/stock-movements`).
- Composants React en `PascalCase`.
- Variables et fonctions en `camelCase` côté TypeScript, `snake_case` côté Python.

### Tests

- Backend : `pytest` + `pytest-django`.
- Frontend : `Vitest` + `Playwright` pour le E2E.
- **Tests obligatoires multi-tenant** : un utilisateur de la boutique A ne peut jamais voir/modifier/supprimer/télécharger une donnée de la boutique B.

### Migrations

- Toujours générer une migration Django pour chaque changement de modèle.
- Sauvegarde de la base **avant** chaque migration en production.
- Migrations réversibles autant que possible.

### Variables d'environnement

- Aucune clé / secret dans le code.
- Fichier `.env.example` à jour dans le repo.
- Secrets en production : variables d'environnement côté hébergeur, pas dans Git.

### Sécurité (checklist permanente)

- `DEBUG=False` en production ; `SECRET_KEY` aléatoire ; `ALLOWED_HOSTS` configuré.
- HTTPS obligatoire ; HSTS après validation.
- CSRF activé, CORS strict, Cookies `Secure` + `HttpOnly` + `SameSite`.
- Mots de passe hashés (par défaut Django).
- Rate limiting sur l'API (notamment login, mot de passe oublié).
- Buckets Object Storage **privés par défaut** ; URL signées pour les fichiers privés.
- Bucket public séparé uniquement pour les images de la page vitrine activée.
- Logs d'audit pour : modifications de stock, suppression/désactivation produit, changements de statut commande, exports, accès aux documents sensibles, publications Telegram, modifications page publique, signalements, changements d'abonnement.

### RGPD

- Données collectées limitées au strict nécessaire (commerçant, client utile à la commande, livraison, historique, documents importés volontairement).
- Suppression / anonymisation possible.
- Export des données possible.
- Séparation stricte par boutique.
- Consentement explicite si usage marketing.

---

## 11. Comportement attendu de l'assistant IA (Claude / autre)

Quand on travaille sur ce projet, l'assistant doit :

1. **Toujours** rattacher une fonctionnalité demandée à un ou plusieurs URS (URS-XXX). Si aucun URS ne couvre, le signaler explicitement et proposer un nouvel URS plutôt que d'inventer.
2. **Respecter la roadmap** : ne pas proposer de bâtir une fonction de V6 si on est en V1, sauf si on lui demande explicitement de réfléchir à plus tard.
3. **Ne jamais proposer** : Firebase, Supabase, MongoDB, microservices multiples, envoi automatique WhatsApp, automatisation de stock par IA sans validation, ou un module de financement / collecte d'argent dans la partie projets halal.
4. **Toujours rappeler** la séparation `shop_id` quand on touche à un modèle ou une requête.
5. **Toujours utiliser** TypeScript côté frontend, Django ORM côté backend, Celery pour les tâches longues.
6. Pour la zakat : toujours rappeler que c'est **indicatif**, ne jamais proposer un calcul présenté comme religieusement définitif.
7. Pour le module Projets halal : toujours intégrer les avertissements de cadrage (pas de collecte, pas de rendement, pas de contrat).
8. **Code livré** : prêt à coller, avec imports complets, typage explicite, gestion d'erreurs minimale, et un bref commentaire si une décision n'est pas évidente.
9. **Réponses courtes** par défaut, plus longues seulement si la question l'exige.
10. **Si une décision technique semble manquer** dans ce document ou dans la fiche technique : le **dire** et proposer 2 ou 3 options avec leurs trade-offs, plutôt que de trancher silencieusement.

---

## 12. Décisions déjà tranchées (pour éviter de les rouvrir)

- Hébergement : **OVHcloud** (PostgreSQL managé + Object Storage + VPS/Public Cloud).
- Architecture : **monolithe Django + un service IA FastAPI séparé**, pas de microservices au-delà.
- Multi-tenant : **une seule base, séparation par `shop_id`**, pas de DB par client.
- WhatsApp : **manuel uniquement**, jamais d'envoi automatique.
- Module Projets halal : **mise en relation uniquement**, pas de collecte ni de financement.
- Frontend : **Next.js + TypeScript + Tailwind + shadcn/ui**.
- Paiement SaaS : **Stripe Billing**.
- Repo : **monorepo** au démarrage.

---

## 13. Glossaire

- **Boutique (Shop)** : entité racine multi-tenant ; tout objet métier appartient à une boutique.
- **Commerçant** : utilisateur final propriétaire d'au moins une boutique.
- **URS** : User Requirement Specification (URS-001 à URS-088). Référence pour toute fonctionnalité.
- **Zakat commerciale** : aumône annuelle obligatoire en islam, calculée à 2,5 % sur l'assiette zakatable de l'activité.
- **Halal** : conforme aux principes éthiques de l'islam ; ici, sans usure (ribâ), avec partage des risques.
- **Mise en relation halal** : présentation mutuelle entre porteur de projet et partenaire potentiel, sans intermédiation financière de la plateforme.
- **OCR** : reconnaissance optique de caractères (lecture automatique de texte sur image).
- **Multi-tenant** : architecture où plusieurs clients partagent la même infrastructure avec isolation logique stricte.
- **MVP** : Minimum Viable Product (la liste précise est en §4).

---

## 14. Documents de référence du projet

- `urs_saas_commercant_mobile.md` — User Requirement Specifications complètes (URS-001 à URS-088), modèle de données détaillé, principes UX, contraintes RGPD/sécurité/IA.
- `fiche_technique_saas_commercants_ovh.md` — fiche technique détaillée avec choix d'architecture OVH, organisation des services Docker, sécurité, monitoring, CI/CD.
- `project_instructions_saas_commercants.md` — **ce document** (résumé opérationnel à coller dans Project instructions).

> En cas de divergence : ce document fait foi pour les principes structurants ; les deux autres font foi pour le détail (URS et fiche technique).
