# Spécification — Facturation et devis professionnels

> À placer dans `docs/specs/spec_facturation_devis_pro.md`. Document de travail pour Claude Code : à lire en entier avant le premier lot, puis lot par lot.
> Rédigée le 2026-10-29 à partir d'une lecture du dépôt (`apps/backend/apps/invoices`, `subscriptions`, `customers`, `products`) et de maquettes validées par le fondateur. Les points marqués **[À VÉRIFIER]** n'ont pas pu être confirmés dans le code : les contrôler avant d'écrire du code.

## 0. Objectif

Passer du module « facture émise depuis une commande » à un système de facturation et de devis professionnel, simple par défaut et puissant à la demande :

1. Créer une **facture libre** (sans commande), avec brouillon, lignes personnalisables, client et prestation créés à la volée.
2. Créer et suivre des **devis**, les faire accepter (en ligne en Boutique), les transformer en facture.
3. Corriger une facture émise par un **avoir**.
4. Réutiliser : **dupliquer** une facture, **modèles** de document.
5. Un **hub « Documents »** unique (devis, factures, avoirs).
6. Fonctions Boutique : lien et acceptation en ligne, acomptes, factures récurrentes, remise et TVA par ligne.

Référence UX : les maquettes validées (voir §9). Référence de design : `docs/design_principles.md` et les composants existants (§6).

## 1. Constats vérifiés dans le code

| Constat | Conséquence |
|---|---|
| `Invoice.order` est un `OneToOneField` nullable | Une facture sans commande est possible sans casser le modèle |
| `Invoice.number`, `issued_at`, `due_date` sont obligatoires ; contrainte `unique_invoice_number_per_shop` sur `(shop, number)` | Un brouillon sans numéro viole la contrainte : la rendre conditionnelle |
| `Invoice.STATUS_*` = `issued`, `paid`, `cancelled` | Ajouter `draft` |
| `InvoiceLine.description` est un `CharField(300)` ; pas d'unité, pas de position (tri par `created_at`) | Ajouter `details`, `unit`, `position` |
| `InvoiceSequence` est un `OneToOneField` sur `Shop` (un seul compteur) | Généraliser en un compteur par type de document |
| `_next_invoice_number` verrouille la séquence (`select_for_update`) et produit `fact-DDMMYY-NNNN` | Réutiliser le même mécanisme pour devis et avoirs |
| `cancel_invoice` : « pas d'avoir en v1, juste un drapeau de statut » | Les avoirs sont à créer (lot 2) |
| `tax_rate` est unique par facture ; `_compute_totals` fait les totaux | Conserver pour les lots 1 à 3 ; TVA par ligne = lot 4d |
| Le snapshot vendeur (`seller_*`) et acheteur (`buyer_*`) est copié à l'émission ; `Invoice.presentation` (JSON) garde le design | Reprendre le même principe pour devis et avoirs |
| `Customer` : unicité `Lower(name)` par boutique ; pas de type ni de SIREN | Ajouter `customer_type` et `siren` |
| `ProductVariant.unit` est un choix fermé (`piece`, `g`, `kg`, `mL`, `L`, `m`) | « nuit », « trajet »… impossibles : ajouter `unit_label` libre |
| `SubscriptionPlan` porte les plafonds (`max_products`, `max_orders_per_month`, …) ; `FEATURE_MIN_PLAN` porte le gating qualitatif ; `limits.py` verrouille la boutique avant de compter | Réutiliser ces deux mécanismes |
| Les routes factures : liste/création, `summary/`, `facets/`, `<id>/`, `<id>/status/`, `<id>/pdf/` | Étendre, ne pas dupliquer |
| `plan_avancement.md` dit que Postman n'est plus utilisé ; `CLAUDE.md` demande encore de le synchroniser | Ne pas utiliser Postman ; corriger `CLAUDE.md` séparément |

## 2. Décisions produit validées

1. **Pas de plafond mensuel de factures en Solo** : la séparation des formules se fait par fonctionnalités (§3).
2. **Avoirs en Solo** (corriger une facture est une nécessité).
3. **Acceptation du devis en ligne réservée à Boutique.**
4. **Numérotation** : `devis-DDMMYY-NNNN`, `fact-DDMMYY-NNNN` (inchangé), `avoir-DDMMYY-NNNN`, compteurs continus et distincts par boutique et par type, numéro attribué à l'émission / à l'envoi (jamais sur un brouillon).
5. **Brouillon** pour factures et devis, sans numéro, modifiable et supprimable.
6. **Sous-lignes** : repoussées (le champ `details` multiligne suffit).
7. **Unité** : texte libre avec suggestions (nuit, heure, jour, semaine, trajet, personne, forfait, pièce).
8. **TVA** : globale par document (lots 1 à 3).
9. **Modèles** ouverts dès Solo, 3 maximum ; illimités en Boutique. **Dupliquer** une facture : toutes formules ayant les factures.
10. **Contrôle de conformité** à l'émission : niveau « recommandé », non bloquant, tracé dans l'audit.
11. **Facturation électronique (réforme)** : hors périmètre, à cadrer séparément (lot 5).

## 3. Découpage par formule

Découverte : inchangée (pas de facture).

| Capacité | Clé de gating | Plan minimum |
|---|---|---|
| Facture libre, brouillons, contrôle de conformité | `invoices` (existante) | Solo |
| Devis (validité, statuts, conversion en facture) | `quotes` (nouvelle) | Solo |
| Avoirs | `credit_notes` (nouvelle) | Solo |
| Dupliquer, modèles de document | `document_templates` (nouvelle) | Solo, plafond `max_document_templates` = 3 |
| Modèles illimités | même clé, `max_document_templates` = `NULL` | Boutique |
| Logo, couleur, mise en page (devis et avoirs inclus) | `invoice_branding` (existante) | Boutique |
| Lien en ligne et acceptation du devis | `quote_online_accept` (nouvelle) | Boutique |
| Acomptes et facture de solde | `deposit_invoices` (nouvelle) | Boutique |
| Factures récurrentes | `recurring_invoices` (nouvelle) | Boutique |
| Remise et TVA par ligne | `line_tax_discount` (nouvelle) | Boutique |
| Export comptable | `exports` (existante) | Boutique |

Règles communes (déjà dans `plan_avancement.md`) : toute fonctionnalité réservée à une formule livre **dans le même lot** sa clé de gating côté serveur, sa ligne `plans.*.fN` en fr/en/ar et sa vérification dans l'audit `subscription`.

Comportement à la rétrogradation : les documents existants restent lisibles ; la création des fonctions gatées est refusée. Les modèles en excès restent consultables, la création d'un nouveau est refusée.

## 4. Règles transverses (à respecter dans tous les lots)

Rappel de `CLAUDE.md` et des règles non négociables :

- Tout queryset filtré par `shop_id` ; mixin `ShopScopedQuerysetMixin` ; **tests multi-tenant** sur chaque endpoint (boutique A ne voit ni ne modifie la boutique B).
- Argent en `Decimal`, jamais `float`. Totaux calculés **côté serveur uniquement** (le client n'affiche qu'une estimation).
- Logique métier dans `services.py`, jamais dans les vues ni les serializers. Pas de `fields = '__all__'`. Type hints partout.
- **Atomicité** : toute écriture dépendant d'une lecture préalable (numéro, compteur, statut, solde) utilise une condition SQL (`filter(...).update(...)` conditionnel, contrôle du nombre de lignes modifiées, ou `select_for_update` dans `transaction.atomic`). Pas de lecture puis écriture.
- JWT en cookies HttpOnly uniquement, jamais en `localStorage`. Appels authentifiés via les route handlers `/app/api/*`.
- Stock : une facture ou un devis **ne touche jamais** au stock. Seul le flux commande passe par `stock.services.create_movement()`.
- Chaque nouvelle app Django : `factories.py` (factory_boy + faker) et seeding dans `seed_data`.
- Chaque lot : migrations mentionnées explicitement, cases du `plan_avancement.md` cochées **dans le même commit**, URS rattaché.
- Frontend : TypeScript strict sans `any`, TanStack Query, React Hook Form + Zod, une fonction ≤ 80 lignes (règle ESLint existante), tokens uniquement (`npm run tokens:check`), `npm run lint`, `typecheck`, `i18n`, `text`, `deps`, `build` verts.
- Audit : tracer émission, envoi de devis, acceptation, conversion, avoir, suppression de brouillon, émission avec avertissements (via le mécanisme d'audit existant **[À VÉRIFIER : nom du helper dans `apps/core`]**).

**URS** (URS-105 à URS-109 sont déjà prises par la zakat et le scan d'emballage) : 110 facture libre, 111 devis, 112 avoirs, 113 hub Documents + dupliquer + modèles, 114 acceptation en ligne, 115 acomptes, 116 récurrentes, 117 remise et TVA par ligne.

---

## 5. Lots

### Lot 1 — Facture libre (URS-110)

**Backend**

- `Invoice` : ajouter `STATUS_DRAFT = 'draft'` ; rendre `issued_at` et `due_date` nullables ; remplacer la contrainte par `UniqueConstraint(fields=['shop','number'], condition=~Q(number=''), name=...)` ; ajouter `operation_category` (`goods` | `services` | `mixed`, défaut `services`), `buyer_siren` (snapshot), `kind` (`invoice` pour l'instant, préparé pour `credit_note`).
- `InvoiceLine` : ajouter `details` (`TextField`, blank), `unit` (`CharField(30)`, blank), `position` (`PositiveIntegerField`) ; ordering `['position', 'created_at']`. Migration de données : `position` = rang selon `created_at` par facture.
- `Customer` : `customer_type` (`individual` | `business`, défaut `individual`), `siren` (9 chiffres, validation de forme, blank).
- `ProductVariant` : `unit_label` (`CharField(30)`, blank).
- Services (`invoices/services.py` ou un module de services dédié : brouillons, émission et suggestions dans `invoices/drafts.py`, `services.py` faisant déjà 405 lignes) :
  - `create_draft_invoice(shop, user, data)`, `update_draft_invoice(invoice, data, expected_updated_at)` : remplace les lignes dans une transaction ; **concurrence optimiste** par `filter(pk, shop, status='draft', updated_at=expected).update(...)`, 0 ligne = 409.
  - `delete_draft_invoice(invoice)` : uniquement `draft` (condition SQL).
  - `issue_invoice(invoice, *, acknowledged_warnings)` : dans `transaction.atomic`, réserver le numéro (`_next_number`), puis `filter(pk, shop, status='draft').update(status='issued', number=..., issued_at=..., due_date=...)` ; 0 ligne = 409 et la transaction annule aussi l'incrément (aucun trou de numérotation). Snapshots vendeur et acheteur, `presentation`, totaux recalculés. Audit.
  - Rendre `_compute_totals` publique (`compute_totals`) : devis et avoirs l'importeront.
  - `mark_paid` doit fonctionner pour les factures sans commande.
- Nouveau `invoices/compliance.py` : fonction pure `check_invoice(invoice) -> list[ComplianceIssue]` (`code`, `level` = `blocking` | `recommended`, `target` = champ ou écran à compléter). Règles françaises appliquées **uniquement si** `seller_country == 'FR'`. Bloquant : aucune ligne, total nul, pas de client. Recommandé : identité et adresse du vendeur, SIREN ou SIRET du vendeur, mention de TVA ou de franchise, SIREN du client professionnel, nature de l'opération, conditions de paiement et pénalités (B2B). **[À VÉRIFIER]** : champs vendeur réellement disponibles (`Shop.siret`, `vat_number`, `tax_id`, forme juridique, capital ; `tax_id` et `siret` se recoupent) et option TVA sur les débits.
- Catalogue et clients à la volée :
  - `products.services.create_service_from_line(...)` : crée `Product(type='service')` + variante par défaut, `unit_label`, prix HT ; appelle `enforce_product_limit` ; nom déjà pris → 409 avec l'id existant (proposer « mettre à jour le prix »).
  - Création de client depuis la facture via l'endpoint existant `POST /api/customers/` (`enforce_customer_limit` dans `perform_create`) ; doublon de nom → **400 sur le champ `name`** (comportement actuel, pas de 409). La ligne « Créer « X » » n'apparaît pas quand un client de ce nom existe déjà (comparaison insensible à la casse, comme la contrainte `Lower(name)`).
- Endpoints (tous `HasPlanForFeature.for_feature('invoices')` + permission de module `invoices`) :
  - `POST /api/invoices/drafts/` · `PATCH /api/invoices/<id>/draft/` · `DELETE /api/invoices/<id>/draft/`
  - `GET /api/invoices/<id>/compliance/` · `POST /api/invoices/<id>/issue/`
  - `GET /api/invoices/line-suggestions/?q=` : catalogue + lignes déjà facturées de la boutique, 8 résultats maximum.
  - `POST /api/products/from-invoice-line/`
- PDF (`pdf_blocks.py`, 411 lignes **[À VÉRIFIER avant modification]**) : descriptions multilignes, unité, nature de l'opération, SIREN client ; pagination des lignes longues.
- `InvoiceSequence` : ne pas encore généraliser (lot 2).

**Frontend**

- Routes : `/invoices/new` et `/invoices/[id]/edit` (brouillon uniquement). Écran `Départ` (vide / modèle / dupliquer) ajouté au lot 3 ; au lot 1, « Nouvelle facture » ouvre directement l'éditeur.
- Éditeur mobile et desktop conformes aux maquettes (§9) : cartes à bande teintée (`FormSection`/`FormCard`), champs à étiquette flottante (`FloatingInput`, `FloatingSelectBase`), stepper de quantité, total de ligne en puce teintée, `BottomSheet` pour unité, menu de ligne, client et vérification. Barre flottante « Total TTC + Émettre » (`FloatingActionBar`, variante `summary`) sur mobile ; carte « Récapitulatif » avec le bouton Émettre sur desktop (même pattern que `DesktopSaleTicket`).
- **Réutiliser avant de créer** : `FreeLineView`, `CustomerPicker`, `QuickAddDialogs`, `ProductPicker`, `DesktopSaleTicket` ; étendre plutôt que dupliquer. **[À VÉRIFIER]** ce qui est réellement réutilisable.
- Enregistrement automatique : debounce ~800 ms vers `PATCH …/draft/`, gestion du 409 (recharger), indicateur « Enregistré à HH:MM ».
- Suppression de ligne : annulation possible quelques secondes (pas de `confirm()`).
- Hooks : étendre `useInvoices.ts` ; nouveaux hooks de brouillon et de suggestions.
- i18n fr/en/ar pour tous les libellés (y compris le message de vérification et les noms des contrôles).
- Audit Playwright : ajouter `e2e/audit-invoice-editor.mjs` sur le modèle des audits existants.

**Tests (pytest)** : brouillon sans numéro ; deux brouillons simultanés sans conflit d'unicité ; double émission concurrente (un seul succès, pas de trou de numéro) ; `PATCH` périmé → 409 ; suppression d'une facture émise refusée ; multi-tenant sur tous les endpoints ; conformité FR vs pays étranger ; création de service avec doublon ; totaux en `Decimal`.

**Migrations** : `Invoice` (statut, nullables, contrainte, champs), `InvoiceLine` (3 champs + données), `Customer` (2 champs), `ProductVariant` (1 champ).

### Lot 2 — Devis et avoirs (URS-111, URS-112)

**Backend**

- Généraliser les compteurs : `DocumentSequence(shop, kind, last_number)` avec `unique(shop, kind)` ; migrer les lignes d'`InvoiceSequence` vers `kind='invoice'` (aucune rupture de numérotation) ; `_next_number(shop, kind, date)` ; préfixes `devis`, `fact`, `avoir`.
- Extraire un modèle abstrait `BillingDocument` (snapshots vendeur/acheteur, totaux, `presentation`, `notes`, `currency`) utilisé par `Invoice` et `Quote`. **`makemigrations` ne doit rien produire de nouveau pour `Invoice` à cette étape** (sinon, arrêter et signaler).
- Nouvelle app `apps/backend/apps/quotes/` : `Quote`, `QuoteLine` (mêmes champs de ligne que `InvoiceLine`), statuts `draft`, `sent`, `accepted`, `declined`, `expired`, `invoiced` ; champs `valid_until`, `sent_at`, `viewed_at`, `accepted_at`, `accepted_name`, `declined_at`, `invoice` (`OneToOne` nullable vers la facture créée, `related_name='quote'` : seul lien entre devis et facture, §12 D8). Numéro attribué à l'envoi.
- Services `quotes/services.py` : création et mise à jour de brouillon (mêmes garanties que le lot 1), `send_quote` (numéro + `valid_until`), `mark_accepted_manually`, `mark_declined`, `convert_quote_to_invoice` (voir ci-dessous), `expire_quotes`.
- **Conversion** : crée une **facture en brouillon** liée (`Quote.invoice` ; `invoice.quote` par le lien inverse, aucun champ sur `Invoice`) avec les lignes, le client et les conditions du devis, puis ouvre l'éditeur ; l'émission suit le flux normal. Transition atomique : `Quote.objects.filter(pk, shop, status='accepted', invoice__isnull=True).update(...)`, 0 ligne = 409 (pas de double facture).
- Tâche Celery Beat quotidienne `expire_quotes` : `filter(status='sent', valid_until__lt=today).update(status='expired')`.
- **Avoirs** (dans l'app `invoices`) : `Invoice.kind = 'credit_note'`, `credited_invoice` (FK nullable), `credit_reason` ; montants stockés **positifs**, signe négatif appliqué à l'affichage et dans les agrégats (vérifié à l'étape 0 du lot 2 : `invoice_summary`, `PAYMENTS` et facettes ne filtrent pas sur `kind`, règles en §12). `Invoice.credited_total` (Decimal) mis à jour de façon atomique : `filter(pk, credited_total + montant <= total_ttc).update(credited_total=F('credited_total') + montant)`, 0 ligne = erreur (on ne crédite jamais plus que la facture). Service `issue_credit_note(invoice, lines, reason)` (avoir total ou partiel, remise au prorata : §12 D5) ; numéro `avoir-…`.
- `cancel_invoice` : conservé sans changement pour les factures sans avoir (la synchronisation « commande annulée → facture annulée » en dépend) ; l'interface ne propose plus « Annuler » pour une facture émise, mais « Créer un avoir » (§10, question 1 ; §12 D4).
- PDF : titre « DEVIS » (validité, zone « Bon pour accord, date, signature », conditions), titre « AVOIR » (référence de la facture d'origine, motif). Mêmes blocs, mêmes options de design (`invoice_branding` en Boutique).
- Envoi : ajouter les modèles de message WhatsApp « devis » et « relance de devis » dans `comms` (`PreparedMessage`), toujours en envoi manuel.
- Endpoints : `/api/quotes/` (CRUD brouillon, `…/send/`, `…/convert/`, `…/status/`, `…/pdf/`), `/api/invoices/<id>/credit-notes/`. Gating `quotes` et `credit_notes`.
- Mentions de devis (à vérifier juridiquement) : date, **durée de validité**, identité du vendeur, client, détail des prestations avec prix unitaires, totaux HT et TTC, taux de TVA, conditions de paiement et délais, caractère gratuit du devis, zone « bon pour accord ». Contrôle de conformité propre aux devis dans `quotes/compliance.py`.

**Frontend** : écran détail de devis (hero, suivi, prestations, conditions) mobile et desktop ; éditeur de devis = éditeur de facture avec libellés adaptés (même composants, pas de copie) ; action principale selon l'état (envoyer, relancer, transformer en facture, voir la facture) ; création d'avoir depuis la page détail d'une facture.

**Tests** : numérotation continue par type ; conversion concurrente (une seule facture) ; expiration ; avoir dépassant la facture refusé (condition atomique) ; multi-tenant ; migration d'`InvoiceSequence` sans changement du prochain numéro.

### Lot 3 — Hub Documents, dupliquer, modèles, paiements (URS-113)

**Backend**

- `GET /api/documents/` : liste unifiée en lecture seule (factures, devis, avoirs) par `QuerySet.union()` sur des `values()` de même forme (`id`, `kind`, `number`, `customer_name`, `status`, `total`, `date`, `due_or_valid`), triée et paginée, **scopée à la boutique** ; `GET /api/documents/summary/` pour les 4 indicateurs (à encaisser, en retard, devis en attente, devis acceptés à facturer). « À encaisser » = `total_ttc − credited_total − amount_paid` des factures émises. Pas de SQL brut.
- `DocumentTemplate(shop, name, kind, payload JSON, created_by)` : `payload` validé côté serveur par un serializer strict (lignes, unité, prix, conditions, notes ; **jamais** de client). `SubscriptionPlan.max_document_templates` (nullable, 3 en Solo, `NULL` en Boutique et au-delà) ; `enforce_template_limit` dans `limits.py` sous verrou de boutique. Migration + valeurs de plan.
- Dupliquer : `duplicate_document(source)` crée un brouillon (client et lignes repris, dates et numéro remis à zéro).
- `InvoicePayment(invoice, amount, method, paid_on)` : `record_payment` par `filter(pk, amount_paid + montant <= total_ttc − credited_total).update(...)`, mise à jour de `status` ; `mark_paid` devient un cas particulier. Audit.

**Frontend** : route `/documents` (hub, `StatCard` cliquables = filtres, `ListToolbar`, `DataTable`, feuille « Nouveau document »), écran de départ (vide / modèles / factures récentes), « Garder comme modèle » et « Ajouter au catalogue » après émission ; `/invoices` redirige vers `/documents` quand le hub est livré (**[À DÉCIDER]** : libellé de la navigation).

**Tests** : union scopée par boutique ; plafond de modèles (course entre deux créations) ; paiement partiel concurrent ; duplication sans fuite du client d'une autre boutique.

### Lot 4 — Fonctions Boutique

Ordre de livraison conseillé : 4a, puis 4b, 4c, 4d. Chaque sous-lot a sa **sous-spécification** avant le code (en particulier 4b et 4d, qui touchent aux règles de TVA).

**4a — Lien et acceptation en ligne (URS-114)** — clé `quote_online_accept`

- `Quote.share_version` (entier). Jeton public **sans stockage** : `/d/{quote_id}-{mac}` avec `mac = HMAC(SECRET_KEY dédiée, f"{quote_id}:{share_version}")`, comparé par `hmac.compare_digest` ; « Régénérer le lien » incrémente `share_version`. Toute erreur → 404 uniforme (pas d'indice).
- Endpoints publics **sans authentification**, limités par débit (throttle DRF), jamais `__all__` : `GET /api/public/quotes/<token>/` (champs publics explicites), `POST …/accept/` (`name`, case « Bon pour accord » obligatoire), `POST …/decline/` (motif facultatif). Premier affichage : `viewed_at` (mise à jour conditionnelle). Acceptation : `filter(pk, status='sent', valid_until__gte=today).update(status='accepted', accepted_at=..., accepted_name=..., acceptance_text=...)`, 0 ligne = réponse idempotente ou « devis expiré ». Conserver le texte exact accepté. **[À valider avec `conformite-rgpd`]** : données techniques conservées (IP/agent) et mention d'information.
- Notification au commerçant : création d'un rappel (`Reminder`) « Devis accepté, à facturer » + e-mail via le SMTP existant.
- Page publique `app/d/[token]` (SSR, `data-public-page`, thème clair neutre, couleur d'accent tirée du logo en Boutique), conforme à la maquette « Page client ».
- Acceptation manuelle (Solo) : « Marquer accepté » depuis le détail, sans lien.

**4b — Acomptes et facture de solde (URS-115)** — clé `deposit_invoices`

- `Quote.deposit_percent` / `deposit_amount` ; `Invoice.kind = 'deposit'` ; la facture finale déduit les acomptes déjà facturés (ligne négative dédiée, TVA correcte). **Sous-spécification obligatoire** avant code (règles de TVA sur acompte, numérotation, avoir d'acompte).

**4c — Factures récurrentes (URS-116)** — clé `recurring_invoices`

- `RecurringInvoice(shop, template/payload, interval, next_run, active)` ; tâche Celery Beat qui crée un **brouillon** (jamais d'émission automatique) et prévient le commerçant ; verrou `select_for_update(skip_locked=True)` + mise à jour conditionnelle de `next_run` pour éviter les doublons si deux workers tournent.

**4d — Remise et TVA par ligne (URS-117)** — clé `line_tax_discount`

- `InvoiceLine.discount_percent`, `InvoiceLine.tax_rate` ; totaux par taux ; récapitulatif de TVA ventilé sur le PDF. **Sous-spécification obligatoire** : impact sur `tax_rate` global, `sync_invoice_from_order`, exports et factures déjà émises (aucun recalcul rétroactif).

### Lot 5 — Facturation électronique (réforme)

Hors de cette spécification : cadrer séparément (obligations de réception et d'émission, format, plateforme agréée, calendrier selon la taille de l'entreprise) avant tout développement.

---

## 6. Composants et patterns à réutiliser

`FormSection`, `FormCard`, `FormSectionHeading` (bande teintée), `FormField`, `fieldStyles.ts`, `FloatingInput`, `FloatingSelectBase`, `BottomSheet`, `ConfirmDialog` (attention à la dette i18n connue), `FloatingActionBar`, `ListToolbar`, `DataTable`, `StatCard`, `DesktopSaleTicket` (pattern de récapitulatif), `UpgradeSheet` et `UpgradeCard` pour les fonctions verrouillées, `useLimitGuard`.

## 7. Écarts entre les maquettes et cette spécification

- La conversion d'un devis en facture crée un **brouillon** (puis émission normale). La maquette affiche une facture déjà numérotée : adapter le libellé du bandeau (« Facture créée, à émettre » puis le numéro après émission).
- Les montants, noms et dates des maquettes sont fictifs.
- La maquette desktop est montrée avec le rail replié (80 px) pour tenir dans la largeur.

## 8. Lignes à ajouter dans `docs/plan_avancement.md`

```markdown
### Lot 8 — Facturation et devis professionnels (URS-110 à 117)

- [ ] 8.1 Facture libre : brouillon, lignes personnalisables, conformité, client et catalogue à la volée
  - [ ] Backend : modèles, migrations, services, endpoints, tests
  - [ ] Éditeur mobile et desktop, enregistrement automatique
  - [ ] PDF : descriptions multilignes, unité, nature de l'opération
- [ ] 8.2 Devis et avoirs
  - [ ] Compteurs par type de document (`DocumentSequence`)
  - [ ] App `quotes` : statuts, envoi, expiration, conversion en facture (brouillon)
  - [ ] Avoirs total et partiel, `credited_total` atomique
  - [ ] PDF devis et avoir
- [ ] 8.3 Hub Documents, dupliquer, modèles, paiements partiels
- [ ] 8.4a Lien en ligne et acceptation du devis (Boutique)
- [ ] 8.4b Acomptes et facture de solde (Boutique), sous-spécification d'abord
- [ ] 8.4c Factures récurrentes (Boutique)
- [ ] 8.4d Remise et TVA par ligne (Boutique), sous-spécification d'abord
- [ ] 8.5 Facturation électronique : cadrage
```

Ne cocher qu'après test et déploiement en staging, dans le commit de la fonctionnalité. Ne pas cocher les lignes de la checklist de lancement tant que la livraison complète n'est pas attestée.

## 9. Maquettes de référence

Validées dans la conversation de conception : éditeur de facture libre (mobile et desktop, champs à étiquette flottante, feuille d'unité, menu de ligne, création de client, vérification avant émission, après émission), hub Documents (mobile et desktop), détail de devis (brouillon, envoyé, accepté, facturé), page client d'acceptation. Fichiers : `docs/maquettes/facturation/01_editeur_facture_libre.html` et `docs/maquettes/facturation/02_hub_devis_page_client.html`.

## 10. Questions ouvertes (à trancher avant ou pendant le lot concerné)

1. ~~Lot 2 : le statut « annulée » reste-t-il disponible pour une facture émise non payée, ou uniquement l'avoir ?~~ Tranché le 2026-10-30 : l'interface ne propose plus que l'avoir (« Créer un avoir », total prérempli, partiel possible). `cancel_invoice` reste côté serveur, sans changement de comportement, pour la synchronisation des commandes annulées (§12 D4).
2. ~~Lot 2 : confirmer avec le comptable le signe des avoirs dans les agrégats et la numérotation séparée.~~ Tranché le 2026-10-30, **à confirmer par le comptable avant la mise en production** : montants stockés positifs, signe négatif à l'affichage et dans les agrégats (CA = factures − avoirs) ; série distincte `avoir-DDMMYY-NNNN`, continue, jamais remise à zéro (§12).
3. Lot 3 : libellé de navigation « Documents » et redirection de `/invoices`.
4. Lot 4a : données techniques conservées lors de l'acceptation (RGPD).
5. ~~Champs vendeur : confirmer lesquels existent déjà sur `Shop`.~~ Tranché à l'étape 0 (§11, décision 8).
6. Mentions légales de la facture et du devis : relecture par un professionnel avant mise en production.

## 11. Décisions de l'étape 0 (lot 1, 2026-10-29)

Vérification du code faite avant le lot 1 ; décisions du fondateur :

1. **URS** : URS-105 à 109 sont prises. Lot 1 = URS-110 ; devis 111, avoirs 112, hub + dupliquer + modèles 113, acceptation en ligne 114, acomptes 115, récurrentes 116, remise et TVA par ligne 117.
2. **Maquettes** : rangées dans `docs/maquettes/facturation/`. Hors lot 1 : écran « Départ », modèles, dupliquer, « Garder comme modèle ». Après l'émission : redirection vers la page détail de la facture avec une notification. « Enregistrer au catalogue » reste dans le menu de ligne.
3. **Échéance** : `Invoice.payment_terms_days` (nullable ; à la création du brouillon, `default_payment_terms_days` de la boutique), modifiable dans la carte « Remise, frais et notes ». `due_date` = date d'émission + ce délai, calculée à l'émission.
4. **Aperçu PDF** : un brouillon n'a pas de PDF ; `InvoicePdfView` répond 409 (jamais 500) et le bouton « Aperçu PDF » est masqué au lot 1. Aperçu de brouillon marqué « BROUILLON » : backlog du lot 8.3. `splitInRow=1` et descriptions longues corrigés dès le lot 1.
5. **Brouillons dans `/invoices`** : badge « Brouillon », option de filtre, exclus des indicateurs. Tri par défaut : brouillons en tête par `updated_at` décroissant, puis factures par date d'émission ; ordre des valeurs nulles explicite (`nulls_first` / `nulls_last`), testé.
6. **Client en double** : 400 actuel conservé (pas de 409) ; « Créer « X » » masqué quand le nom existe déjà (insensible à la casse).
7. **Type de client et SIREN** : dans la carte Identité du formulaire client et dans la feuille de création de la facture. SIREN : validation de forme seulement (9 chiffres après suppression des espaces), pas de clé de Luhn.
8. **Conformité** (règles FR seulement si la boutique est en France ; pays lu sur la boutique pour un brouillon) : bloquant = aucune ligne, total nul, pas de client ; recommandé = nom et adresse du vendeur, SIRET ou identifiant fiscal, n° de TVA si la TVA est applicable, SIREN d'un client professionnel, mentions légales vides pour un client professionnel (signal « pénalités »). Aucun champ ajouté à `Shop` au lot 1 ; forme juridique, capital, RCS, TVA sur les débits et pénalités de retard au backlog. Le texte affiché n'affirme jamais une conformité légale : il dit « figure normalement sur une facture officielle en France ».
9. **Organisation** : brouillons, émission et suggestions dans `invoices/drafts.py` ; fonction ≤ 50 lignes, classe ≤ 300 lignes.
10. **`POST /api/products/from-invoice-line/`** : modules `invoices` et `products`, gating de formule `invoices`, `enforce_product_limit`.

Choix par défaut validés : nature de l'opération par défaut selon `Shop.catalog_kind` (`services` → `services`, `products` → `goods`, `both` → `mixed`), toujours modifiable ; enregistrement automatique déclenché par un minuteur posé dans le gestionnaire de saisie, jamais dans un `useEffect` ; audit Playwright sur une boutique réservée, `e2e-invoice-editor@example.com` (ses brouillons de départ fausseraient les comptes d'`audit-invoices`, qui a `e2e-invoices@example.com`).

## 12. Décisions de l'étape 0 (lot 2, 2026-10-30)

Vérification du code faite avant le lot 2 ; décisions du fondateur :

1. **D1, statut d'un avoir** : créé directement émis depuis une feuille de la page détail de la facture (ni brouillon ni éditeur) ; `issued` est terminal, un avoir n'est jamais payé ni annulé (`mark_paid`, `cancel_invoice` et `PATCH …/status/` répondent 409).
2. **D2, remboursement** : aucun remboursement enregistré dans ce lot ; un avoir sur une facture payée ne change que `credited_total`.
3. **D3, liste** : les avoirs figurent dans `/invoices`, badge « Avoir » et montant négatif, filtre par type (factures, avoirs) ; la facette de statut compte les deux, les facettes de paiement excluent les avoirs.
4. **D4, annulation** : `cancel_invoice` refuse une facture dont `credited_total > 0` ; aucun avoir sur une facture annulée, un brouillon ou un avoir. `sync_invoice_from_order` ne fait **jamais** échouer l'annulation d'une commande : si la facture liée a `credited_total > 0`, elle la laisse inchangée et journalise le cas (testé).
5. **D5, avoir partiel** : l'avoir total reprend lignes, remise et livraison ; un avoir partiel crédite des quantités à la baisse, reprend la remise **au prorata** des lignes créditées (arrondi au centime) et la livraison au choix ; taux de TVA de la facture. L'avoir qui solde la facture crédite exactement le reste, sans écart d'arrondi. Tests : avoir partiel sur facture avec remise ; trois avoirs partiels successifs ne dépassent jamais le TTC ; avoir « solde » exact.
6. **D6, facture entièrement créditée** : reste `issued`, sort de « à encaisser » par le calcul ; la page détail affiche « Créditée ».
7. **D7** : `quotes/compliance.py` avec l'app `quotes` ; modèles WhatsApp « devis » et « relance de devis » (`comms`) dans ce lot, en dernier, commit séparé (reportable).
8. **D8, lien devis ↔ facture** : un seul lien, `Quote.invoice` (`OneToOne` nullable, `related_name='quote'`) ; aucun champ ajouté à `Invoice`, `invoices` ne dépend pas de `quotes`.
9. **D9, CA du mois** : `period=issued_month` et `invoice_summary` (qui partagent `filter_invoices`) ne comptent que les statuts `issued` et `paid` (les factures annulées en sortent) et soustraient les avoirs ; commit séparé avec son test.
10. **D10, net dû** : « à encaisser » = `max(0, total_ttc − credited_total − amount_paid)`, jamais négatif. `mark_paid` sur une facture créditée enregistre le net dû (`total_ttc − credited_total`). Un avoir ne touche jamais au stock ni à la commande liée ; la feuille de création d'avoir l'indique en clair. Synchronisation des paiements de commande (`sync_invoice_from_order`, 2026-10-30) : `amount_paid` est plafonné au net dû en **une** écriture SQL conditionnelle, sans lecture préalable : `amount_paid = Least(order.amount_paid, F('total_ttc') − F('credited_total'))`. Net dû nul (facture entièrement créditée) : la facture reste `issued` (« Créditée »), jamais `paid`. Montants affichés et PDF : `max(0, …)`. Tests : paiement de commande après un avoir ; avoir concurrent d'un paiement (vrais threads).

Numérotation : `DocumentSequence(shop, kind, last_number)`, `unique(shop, kind)`, obtenue en transformant `InvoiceSequence` sur place (renommage, `kind='invoice'` par défaut pour les lignes existantes, `OneToOne` → `ForeignKey`) : aucune copie, le prochain numéro de facture ne change pas. Retour arrière : les lignes `kind ≠ 'invoice'` sont supprimées avant le retour au `OneToOne` (compteurs de devis et d'avoirs perdus, acceptable avant la mise en production seulement).
