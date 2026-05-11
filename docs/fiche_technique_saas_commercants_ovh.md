# Fiche technique — SaaS mobile-first pour commerçants avec hébergement OVHcloud

## 1. Objectif technique

Construire une application SaaS solide, sécurisée, performante et évolutive, hébergée principalement sur l’écosystème OVHcloud.

L’application doit permettre de gérer :

- produits ;
- stock ;
- clients ;
- commandes ;
- expéditions ;
- notes et rappels ;
- zakat commerciale ;
- messages WhatsApp préparés ;
- publications Telegram ;
- pages publiques commerçants ;
- projets et partenariats halal ;
- OCR et détection visuelle à terme.

L’objectif n’est pas d’utiliser des solutions toutes faites inutiles comme Firebase, mais de construire une base technique maîtrisée, robuste, maintenable et adaptée à une vraie application métier.

---

## 2. Architecture générale recommandée

```text
[Utilisateur mobile / navigateur]
          ↓
[Frontend Next.js]
          ↓
[API Django REST]
          ↓
[PostgreSQL managé OVHcloud]

[API Django REST]
          ↓
[Object Storage OVHcloud]
          ↓
Photos produits, factures, documents, images publiques

[API Django REST]
          ↓
[Redis]
          ↓
[Celery Workers]
          ↓
Rappels, PDF, emails, Telegram, OCR, tâches longues

[Celery / API Django]
          ↓
[Service IA FastAPI]
          ↓
OCR, analyse image, détection produits
```

---

## 3. Stack technique recommandée

| Besoin | Technologie recommandée | Rôle |
|---|---|---|
| Frontend | Next.js + React + TypeScript | Interface admin, pages publiques, mobile-first |
| UI | Tailwind CSS + shadcn/ui | Design propre, composants réutilisables |
| Formulaires | React Hook Form + Zod | Validation propre côté frontend |
| State serveur | TanStack Query | Gestion des données venant de l’API |
| Backend métier | Django | Cœur applicatif robuste |
| API | Django REST Framework | API REST structurée |
| Base de données | PostgreSQL managé OVHcloud | Données métier relationnelles |
| Cache / broker | Redis | Cache, files de tâches, rate limit |
| Tâches async | Celery + Celery Beat | Rappels, OCR, Telegram, PDF |
| Fichiers | OVHcloud Object Storage compatible S3 | Stockage images/documents |
| IA / OCR | FastAPI séparé | Service IA isolé |
| OCR open source | PaddleOCR ou Tesseract | Lecture facture/adresse |
| Détection objets | YOLO / Ultralytics | Comptage visuel produits |
| Paiement SaaS | Stripe Billing | Abonnements |
| Emails | Brevo, Resend ou Amazon SES | Emails transactionnels |
| PDF | WeasyPrint ou Playwright PDF | Fiches colis, exports |
| Reverse proxy | Nginx ou Traefik | HTTPS, routage, sécurité |
| Conteneurs | Docker / Docker Compose | Déploiement reproductible |
| Monitoring erreurs | Sentry | Suivi erreurs frontend/backend |
| CI/CD | GitHub Actions ou GitLab CI | Tests et déploiement |

---

# 4. Frontend

## 4.1 Next.js + React + TypeScript

### Rôle

Next.js servira à construire :

- l’interface admin du commerçant ;
- les pages publiques des boutiques ;
- le mini-site / vitrine ;
- les pages publiques de projets et partenariats ;
- l’interface mobile-first.

### Pourquoi ce choix

Next.js est adapté parce qu’il permet :

- une bonne performance ;
- du SEO pour les pages publiques ;
- des routes dynamiques ;
- un rendu serveur ou statique selon les besoins ;
- une bonne expérience développeur avec React ;
- une évolution possible vers PWA.

### Exemple de routes

```text
/dashboard
/products
/orders
/customers
/stock
/zakat
/page-builder
/projects
/boutique/[slug]
/projets/[slug]
```

---

## 4.2 TypeScript

### Rôle

TypeScript ajoute du typage à JavaScript.

### Pourquoi c’est important

Il permet de réduire les erreurs, mieux structurer le code et rendre le projet plus maintenable.

Exemple :

```ts
type Product = {
  id: string;
  name: string;
  sellingPrice: number;
  stockQuantity: number;
};
```

---

## 4.3 Tailwind CSS + shadcn/ui

### Rôle

Tailwind CSS permet de construire rapidement des interfaces propres avec des classes utilitaires.

shadcn/ui fournit des composants modernes et personnalisables : boutons, formulaires, dialogues, menus, tableaux, etc.

### Pourquoi c’est adapté

Pour ton projet, tu as besoin d’une interface :

- simple ;
- mobile-first ;
- rapide à développer ;
- cohérente visuellement ;
- facile à maintenir.

---

## 4.4 React Hook Form + Zod

### Rôle

React Hook Form gère les formulaires côté frontend.

Zod permet de définir des schémas de validation.

### Exemple

```ts
const productSchema = z.object({
  name: z.string().min(2),
  sellingPrice: z.number().positive(),
  stockQuantity: z.number().int().min(0),
});
```

### Pourquoi c’est utile

Cela permet d’éviter les formulaires fragiles et de valider proprement les données avant envoi à l’API.

---

## 4.5 State serveur : TanStack Query

### Définition simple

TanStack Query sert à gérer les données qui viennent du serveur.

Par exemple :

- liste des produits ;
- détail d’une commande ;
- stock disponible ;
- clients ;
- rappels ;
- page publique.

### Problème résolu

Sans TanStack Query, tu dois gérer toi-même :

- le chargement ;
- les erreurs ;
- le cache ;
- le rafraîchissement ;
- la synchronisation après modification ;
- les requêtes répétées.

### Exemple concret

Quand l’utilisateur ouvre la page Produits :

```text
1. TanStack Query appelle l’API /products
2. Il garde les produits en cache
3. Si l’utilisateur ajoute un produit, il rafraîchit la liste
4. Si la connexion est lente, il garde un état propre
```

### Pourquoi c’est pertinent

Pour une application mobile-first, cela améliore fortement l’expérience utilisateur et évite de recoder toute la logique de gestion d’état serveur.

Source officielle : https://tanstack.com/query

---

# 5. Backend métier

## 5.1 Django

### Rôle

Django sera le cœur métier de l’application.

Il gérera :

- utilisateurs ;
- boutiques ;
- produits ;
- stock ;
- clients ;
- commandes ;
- rappels ;
- zakat ;
- pages publiques ;
- projets halal ;
- droits ;
- abonnement ;
- sécurité.

### Pourquoi ce choix

Django est adapté aux applications métier solides, avec :

- ORM ;
- migrations ;
- admin intégré ;
- authentification ;
- permissions ;
- protection contre plusieurs failles web courantes ;
- grande maturité.

Source officielle sécurité Django : https://docs.djangoproject.com/en/6.0/topics/security/

---

## 5.2 Django REST Framework

### Rôle

Django REST Framework servira à exposer l’API consommée par le frontend Next.js.

Exemple d’endpoints :

```text
GET /api/products
POST /api/products
GET /api/orders
POST /api/orders
GET /api/customers
POST /api/customers
```

### Pourquoi c’est utile

Cela permet de séparer clairement :

- frontend ;
- backend ;
- logique métier ;
- accès aux données.

---

## 5.3 Django Admin

### Rôle

Django Admin servira au back-office interne de la plateforme.

Il permettra à l’administrateur du SaaS de :

- voir les utilisateurs ;
- voir les boutiques ;
- gérer les signalements ;
- suspendre une page publique ;
- consulter les projets suspects ;
- gérer certains paramètres globaux.

### Pourquoi c’est utile

Cela évite de développer un back-office complet dès le départ.

---

# 6. Base de données

## 6.1 Choix : PostgreSQL managé OVHcloud

### Rôle

PostgreSQL stockera toutes les données métier :

- utilisateurs ;
- boutiques ;
- produits ;
- clients ;
- commandes ;
- mouvements de stock ;
- rappels ;
- zakat ;
- pages publiques ;
- projets ;
- messages préparés.

### Pourquoi PostgreSQL

Le projet est très relationnel.

Exemple :

```text
Une boutique possède plusieurs produits.
Un client possède plusieurs commandes.
Une commande possède plusieurs lignes.
Un produit possède plusieurs mouvements de stock.
```

PostgreSQL est très adapté à ce type de structure.

### Pourquoi managé chez OVHcloud

Une base managée permet de déléguer une partie importante de l’exploitation :

- maintenance ;
- sauvegardes ;
- supervision ;
- haute disponibilité selon l’offre ;
- mises à jour ;
- gestion d’infrastructure.

OVHcloud indique que ses bases PostgreSQL managées sont déployées, gérées, maintenues et scalées par OVHcloud, avec les sauvegardes et le trafic inclus selon l’offre.

Sources OVHcloud :

- PostgreSQL managé OVHcloud : https://www.ovhcloud.com/en/public-cloud/postgresql/
- FAQ Public Cloud Databases : https://help.ovhcloud.com/csm/en-public-cloud-databases-faq?id=kb_article_view&sysparm_article=KB0048918
- Backups Public Cloud Databases : https://help.ovhcloud.com/csm/en-public-cloud-databases-backups?id=kb_article_view&sysparm_article=KB0048766

---

## 6.2 Une seule base ou une base par utilisateur ?

### Recommandation

Utiliser :

```text
1 seule base PostgreSQL
1 schéma principal
Toutes les boutiques dans les mêmes tables
Séparation stricte par shop_id
```

### Pourquoi ne pas créer une base par utilisateur ?

Une base par utilisateur complique fortement :

- les migrations ;
- les sauvegardes ;
- les statistiques globales ;
- le support ;
- les coûts ;
- les mises à jour ;
- l’administration.

Pour un SaaS avec beaucoup de petits commerçants, ce n’est pas le bon choix au départ.

---

## 6.3 Modèle multi-tenant recommandé

Chaque table métier contient une colonne `shop_id`.

Exemple :

```text
products
- id
- shop_id
- name
- price
- stock_quantity

orders
- id
- shop_id
- customer_id
- total
- status

customers
- id
- shop_id
- name
- phone
```

### Exemple concret

```text
Produit A : shop_id = 10
Produit B : shop_id = 15
```

Un utilisateur de la boutique 10 ne doit jamais pouvoir voir le produit de la boutique 15.

---

## 6.4 Table shop_members

Il ne faut pas lier directement un utilisateur à une seule boutique.

Il vaut mieux créer une table intermédiaire :

```text
shop_members
- id
- user_id
- shop_id
- role
```

### Rôles possibles

```text
owner
admin
staff
viewer
```

### Pourquoi

Cela permet plus tard :

- plusieurs utilisateurs dans une boutique ;
- un propriétaire ;
- des employés ;
- des droits différents ;
- un utilisateur pouvant gérer plusieurs boutiques.

---

## 6.5 RLS PostgreSQL pour défense supplémentaire

### Définition simple

RLS signifie **Row Level Security**, ou sécurité au niveau des lignes.

Cela permet à PostgreSQL de bloquer directement l’accès aux lignes qu’un utilisateur n’a pas le droit de voir.

### Exemple simple

Dans la table `products`, PostgreSQL peut appliquer une règle :

```text
Un utilisateur de la boutique 10 ne peut lire que les lignes où shop_id = 10.
```

### Pourquoi c’est intéressant

Normalement, Django doit déjà filtrer toutes les requêtes par `shop_id`.

Mais RLS ajoute une protection supplémentaire au niveau de la base.

Cela donne deux couches :

```text
Couche 1 : Django filtre par shop_id
Couche 2 : PostgreSQL bloque aussi si shop_id ne correspond pas
```

### Pourquoi ce n’est pas obligatoire immédiatement

RLS ajoute de la complexité. Il faut bien le configurer et le tester.

### Recommandation

Commencer avec une séparation stricte côté Django, des tests solides, puis envisager RLS lorsque le modèle multi-tenant est stable.

Source officielle PostgreSQL : https://www.postgresql.org/docs/current/ddl-rowsecurity.html

---

## 6.6 Index à prévoir

Pour la performance, il faut indexer les colonnes utilisées souvent.

Exemples :

```sql
CREATE INDEX idx_products_shop_id ON products(shop_id);
CREATE INDEX idx_orders_shop_status ON orders(shop_id, status);
CREATE INDEX idx_orders_shop_created_at ON orders(shop_id, created_at);
CREATE INDEX idx_customers_shop_phone ON customers(shop_id, phone);
CREATE INDEX idx_stock_movements_product_date ON stock_movements(product_id, created_at);
```

### Pourquoi

Chaque requête filtrera souvent par `shop_id`.

Sans index, les performances peuvent chuter lorsque la base grossit.

---

# 7. Stockage de fichiers avec OVHcloud Object Storage

## 7.1 Pourquoi ne pas stocker les fichiers sur le serveur ?

Il ne faut pas stocker les fichiers importants directement dans le VPS applicatif.

Raisons :

- le disque du serveur peut saturer ;
- les sauvegardes sont plus difficiles ;
- les fichiers sont moins faciles à servir ;
- la montée en charge est plus compliquée ;
- en cas de migration serveur, les fichiers compliquent le déplacement.

---

## 7.2 Choix recommandé

Utiliser :

```text
OVHcloud Object Storage compatible S3
```

OVHcloud propose un Object Storage compatible S3, avec gestion de buckets et objets.

Sources OVHcloud :

- Guide Object Storage S3 : https://help.ovhcloud.com/csm/en-public-cloud-storage-s3-getting-started-object-storage?id=kb_article_view&sysparm_article=KB0047348
- Documentation Object Storage compatible S3 : https://help.ovhcloud.com/csm/en-gb-documentation-public-cloud-storage-object-storage-s3?id=kb_browse_cat&kb_category=8eaef5882c21fe144a4e082b79ed2fb9&kb_id=574a8325551974502d4c6e78b7421938

---

## 7.3 Fonctionnement global

Quand l’utilisateur ajoute une photo produit :

```text
1. L’utilisateur prend une photo depuis son mobile
2. Le frontend envoie la photo à l’API Django
3. Django vérifie les droits de l’utilisateur
4. Django envoie le fichier vers OVH Object Storage
5. OVH retourne une clé ou URL de fichier
6. Django enregistre la référence du fichier en base PostgreSQL
7. Le produit affiche la photo via une URL contrôlée
```

---

## 7.4 Ce qui est stocké en base

La base ne stocke pas le fichier lui-même.

Elle stocke seulement :

```text
product_images
- id
- product_id
- bucket
- object_key
- original_filename
- mime_type
- size
- visibility
- created_at
```

Exemple :

```text
bucket = app-products
object_key = shops/10/products/abc123.jpg
```

---

## 7.5 Organisation des buckets

Je recommande de séparer les usages.

```text
bucket-public-assets
bucket-private-documents
bucket-product-images
bucket-page-assets
bucket-project-documents
```

Ou plus simplement au départ :

```text
app-public
app-private
```

### app-public

Pour les fichiers pouvant être publics :

- logo boutique ;
- image de couverture ;
- images de produits visibles sur page publique.

### app-private

Pour les fichiers sensibles :

- factures ;
- documents projet ;
- photos d’étagères ;
- justificatifs ;
- exports privés.

---

## 7.6 Accès public ou privé

### Recommandation

Tout doit être privé par défaut.

Puis l’application génère des accès contrôlés.

### Fichiers publics

Les images affichées sur une page publique peuvent être servies publiquement ou via un proxy/CDN.

Exemples :

- logo ;
- photo produit publique ;
- image de couverture.

### Fichiers privés

Les documents sensibles ne doivent jamais être accessibles directement.

Exemples :

- facture fournisseur ;
- document projet ;
- photo d’étagère ;
- export stock ;
- rapport zakat.

Pour ces fichiers, l’application doit vérifier les droits avant de générer une URL temporaire.

---

## 7.7 URL signée

### Définition simple

Une URL signée est un lien temporaire qui donne accès à un fichier privé pendant une durée limitée.

Exemple :

```text
Accès valable 5 minutes
```

### Fonctionnement

```text
1. L’utilisateur demande à voir une facture
2. Django vérifie qu’il appartient à la bonne boutique
3. Django génère une URL signée
4. L’utilisateur accède temporairement au fichier
5. Le lien expire
```

### Pourquoi c’est important

Cela évite qu’un fichier sensible soit accessible publiquement par erreur.

---

## 7.8 Règles de sécurité fichiers

- Ne jamais faire confiance au nom original du fichier.
- Renommer les fichiers avec un identifiant unique.
- Vérifier le type MIME.
- Limiter la taille maximale.
- Séparer fichiers publics et privés.
- Générer des miniatures pour les images.
- Scanner les fichiers sensibles si nécessaire.
- Supprimer ou archiver les fichiers inutilisés.
- Enregistrer l’utilisateur qui a uploadé le fichier.

---

# 8. Redis, Celery et tâches asynchrones

## 8.1 Redis

### Définition simple

Redis est une base en mémoire très rapide.

Dans ce projet, Redis servira surtout à :

- transmettre les tâches à Celery ;
- gérer du cache ;
- stocker temporairement certains états ;
- aider au rate limiting.

---

## 8.2 Celery

### Définition simple

Celery permet d’exécuter des tâches en arrière-plan.

### Exemple

L’utilisateur importe une facture.

```text
1. L’image est envoyée
2. L’application répond rapidement : analyse en cours
3. Celery lance l’OCR en arrière-plan
4. Le résultat est enregistré
5. L’utilisateur voit le résultat plus tard
```

### Tâches concernées

- OCR facture ;
- extraction adresse ;
- génération PDF ;
- publication Telegram ;
- rappels ;
- emails ;
- exports CSV ;
- analyse d’image ;
- résumé quotidien.

---

## 8.3 Celery Beat

### Définition simple

Celery Beat est le planificateur de tâches.

Il permet de lancer des tâches à heure fixe.

Exemple :

```text
Tous les jours à 10h :
publier un post Telegram programmé
```

---

## 8.4 Workers séparés

Je recommande plusieurs files de tâches :

```text
default
emails
telegram
ocr
pdf
ai
```

### Pourquoi

Cela évite qu’une tâche lourde d’OCR bloque les emails ou les rappels.

---

# 9. Service IA / OCR

## 9.1 FastAPI séparé

### Rôle

Le service FastAPI sera séparé du backend principal.

Il s’occupera de :

- OCR facture ;
- OCR adresse ;
- détection produit ;
- analyse photo étagère ;
- comptage assisté.

### Pourquoi le séparer

L’IA peut avoir :

- dépendances lourdes ;
- traitements longs ;
- besoins GPU plus tard ;
- versions spécifiques ;
- risques de surcharge.

En séparant le service IA, le cœur métier Django reste stable.

---

## 9.2 OCR

### Fonctionnalités prévues

- lire une facture fournisseur ;
- extraire le texte brut ;
- détecter produits, prix, quantités ;
- proposer une entrée de stock ;
- lire une adresse client depuis une image ;
- toujours demander validation humaine.

### Outils possibles

```text
PaddleOCR
Tesseract
Google Document AI plus tard
AWS Textract plus tard
```

### Règle métier

L’OCR ne doit jamais modifier le stock automatiquement.

Toujours :

```text
OCR → proposition → correction utilisateur → validation → mise à jour
```

---

## 9.3 Détection visuelle

### Objectif

Analyser une photo d’étagère pour proposer un comptage d’articles visibles.

### Outil recommandé

```text
YOLO / Ultralytics
```

### Règle métier

L’IA propose, mais l’utilisateur valide.

```text
Détection proposée :
- Produit A : 8
- Produit B : 5

L’utilisateur corrige puis valide.
```

---

# 10. Paiement SaaS

## Choix recommandé : Stripe Billing

### Rôle

Stripe Billing permettra de gérer :

- offres gratuites ;
- abonnements Pro ;
- abonnements Business ;
- factures d’abonnement ;
- portail client ;
- changement d’offre ;
- annulation.

### Pourquoi ce choix

Stripe est très utilisé pour les SaaS, bien documenté et évite de développer soi-même toute la logique d’abonnement.

Source officielle : https://docs.stripe.com/billing

---

# 11. Emails transactionnels

## Outils possibles

```text
Brevo
Resend
Amazon SES
```

## Recommandation

Pour commencer :

```text
Brevo ou Resend
```

Plus tard, si gros volume :

```text
Amazon SES
```

## Emails concernés

- validation email ;
- mot de passe oublié ;
- invitation membre boutique ;
- export prêt ;
- notification projet ;
- alerte sécurité ;
- rappel abonnement.

---

# 12. PDF

## Outils recommandés

```text
WeasyPrint
Playwright PDF
```

## Usages

- fiche colis ;
- reçu simple ;
- export zakat ;
- export stock ;
- fiche projet ;
- bon de commande.

## Recommandation

Commencer avec WeasyPrint pour générer des PDF à partir de HTML/CSS.

---

# 13. Déploiement OVH

## 13.1 Infrastructure recommandée au départ

```text
OVH VPS ou Public Cloud Instance
Docker + Docker Compose
Nginx ou Traefik
PostgreSQL managé OVHcloud
OVH Object Storage
Redis
Celery workers
FastAPI IA
```

---

## 13.2 Variante plus robuste

```text
OVH Public Cloud Instance pour l’application
OVH Managed PostgreSQL pour la base
OVH Object Storage pour les fichiers
Redis sur instance séparée ou service managé selon budget
Load balancer plus tard
Backup automatisé
Monitoring
```

---

## 13.3 Organisation des services Docker

```text
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

PostgreSQL ne serait pas forcément dans Docker si tu utilises PostgreSQL managé OVHcloud.

---

# 14. Sécurité

## 14.1 Sécurité Django

À appliquer avant production :

```text
DEBUG = False
SECRET_KEY sécurisé
ALLOWED_HOSTS configuré
HTTPS obligatoire
CSRF activé
CORS strict
Cookies Secure
Cookies HttpOnly
Cookies SameSite
HSTS après validation
Content Security Policy
Rate limiting
Validation stricte des entrées
```

Source officielle checklist Django : https://docs.djangoproject.com/en/6.0/howto/deployment/checklist/

---

## 14.2 Sécurité multi-tenant

Tests obligatoires :

```text
Un utilisateur boutique A ne peut pas :
- voir produit boutique B
- modifier commande boutique B
- télécharger fichier boutique B
- voir client boutique B
- accéder page admin boutique B
```

---

## 14.3 Sécurité fichiers

- Buckets privés par défaut.
- URL signées pour fichiers privés.
- Vérification des permissions avant accès.
- Limitation taille fichier.
- Vérification type fichier.
- Renommage sécurisé.
- Séparation fichiers publics / privés.
- Logs d’accès aux documents sensibles.

---

## 14.4 Logs d’audit

À journaliser :

```text
- modification stock
- suppression/désactivation produit
- changement statut commande
- export données
- accès document sensible
- publication Telegram
- modification page publique
- signalement projet
- changement abonnement
```

---

# 15. Monitoring et supervision

## Outils recommandés

```text
Sentry
UptimeRobot ou Better Stack
Logs structurés
Grafana + Loki plus tard
Prometheus plus tard
```

## À surveiller

- erreurs backend ;
- erreurs frontend ;
- temps de réponse API ;
- tâches Celery échouées ;
- espace disque ;
- usage Object Storage ;
- consommation base ;
- tentatives de connexion suspectes.

---

# 16. CI/CD

## Outils

```text
GitHub Actions ou GitLab CI
Docker
pytest
Vitest
Playwright
```

## Pipeline recommandé

```text
1. Lint frontend
2. Tests frontend
3. Tests backend
4. Tests sécurité multi-tenant
5. Build Docker
6. Déploiement staging
7. Validation
8. Déploiement production
```

---

# 17. Environnements

## Local

```text
Docker Compose
PostgreSQL local
Redis local
MinIO optionnel pour simuler S3
Django
Next.js
FastAPI IA
```

## Staging

```text
Domaine staging
Base séparée
Bucket séparé
Variables d’environnement séparées
Données de test
```

## Production

```text
Domaine réel
PostgreSQL managé OVHcloud
Object Storage OVHcloud
HTTPS
Backups
Monitoring
Alertes
```

---

# 18. Backups et restauration

## À prévoir dès le départ

```text
Backups PostgreSQL automatiques
Sauvegarde avant migration
Test de restauration régulier
Versioning Object Storage si possible
Export manuel possible
Plan de rollback
```

## Point important

Un backup non testé n’est pas une vraie sécurité.

Il faut tester régulièrement :

```text
Puis-je restaurer la base ?
Combien de temps cela prend ?
Les fichiers sont-ils récupérables ?
Les migrations sont-elles réversibles ?
```

---

# 19. Organisation technique recommandée

## Dépôts Git possibles

### Option monorepo

```text
saas-commerce/
  apps/
    frontend/
    backend/
    ai-service/
  infra/
  docs/
```

### Option multi-repo

```text
saas-frontend
saas-backend
saas-ai-service
saas-infra
```

## Recommandation

Commencer avec un monorepo.

Pourquoi :

- plus simple au départ ;
- cohérence des versions ;
- documentation centralisée ;
- CI/CD plus simple à gérer au début.

---

# 20. Fiche technique synthétique finale

```text
Frontend :
Next.js + React + TypeScript

UI :
Tailwind CSS + shadcn/ui

Formulaires :
React Hook Form + Zod

State serveur :
TanStack Query

Backend :
Django + Django REST Framework

Base :
PostgreSQL managé OVHcloud

Multi-tenant :
Une seule base, séparation par shop_id, table shop_members, permissions strictes

Sécurité DB :
RLS PostgreSQL envisagé en défense supplémentaire

Fichiers :
OVHcloud Object Storage compatible S3, buckets privés par défaut, URL signées

Tâches async :
Redis + Celery + Celery Beat

IA/OCR :
Service FastAPI séparé, PaddleOCR/Tesseract, YOLO plus tard

Paiement :
Stripe Billing

Emails :
Brevo ou Resend au départ

PDF :
WeasyPrint

Déploiement :
OVH VPS/Public Cloud + Docker + Nginx ou Traefik

Monitoring :
Sentry + UptimeRobot/Better Stack

CI/CD :
GitHub Actions ou GitLab CI

Architecture :
Monolithe Django métier + service IA séparé
```

---

# 21. Décision finale recommandée

La meilleure base pour ce projet est :

```text
Next.js
Django REST Framework
PostgreSQL managé OVHcloud
OVHcloud Object Storage
Redis
Celery
FastAPI IA
Docker
Nginx / Traefik
```

La base de données doit être :

```text
Une seule base PostgreSQL multi-tenant
Séparation stricte par shop_id
Permissions applicatives fortes
Tests anti-fuite de données
RLS PostgreSQL envisagé pour renforcer la sécurité
```

Les fichiers doivent être :

```text
Stockés dans OVH Object Storage
Privés par défaut
Référencés en base par object_key
Accessibles via URL signées pour les documents sensibles
Publics uniquement quand ils doivent apparaître sur une page publique
```

Cette architecture évite les dépendances inutiles, garde les coûts sous contrôle, et pose des bases solides pour une application métier sérieuse, sécurisée et évolutive.
