# URS — SaaS mobile-first pour commerçants

## 1. Résumé du projet

L'application est un SaaS mobile-first destiné aux petits commerçants qui gèrent aujourd'hui leur activité avec WhatsApp, des notes téléphone, du papier, des conversations dispersées et peu d'organisation centralisée.

L'objectif est de leur proposer une application simple, épurée et intuitive pour gérer :

- les produits ;
- le stock ;
- les clients ;
- les commandes ;
- les expéditions ;
- les notes et rappels ;
- la zakat commerciale ;
- les messages WhatsApp prêts à envoyer ;
- les publications Telegram ;
- une page web publique de présentation ;
- un espace de mise en relation halal entre porteurs de projets et partenaires potentiels ;
- des fonctionnalités futures d'OCR et de détection visuelle.

L'application ne doit pas être pensée comme un ERP complexe, mais comme un assistant quotidien de commerce utilisable principalement depuis un téléphone.

---

## 2. Vision produit

### Objectif principal

Permettre à un commerçant de centraliser son activité dans une seule application simple :

> stock, ventes, clients, colis, notes, rappels, zakat, communication et présence en ligne.

### Positionnement

> Une application mobile simple pour gérer, présenter et développer son commerce depuis son téléphone.

### Problèmes résolus

- Informations dispersées dans WhatsApp, Notes, papier ou conversations.
- Manque de visibilité sur le stock réel.
- Commandes oubliées ou mal suivies.
- Clients et adresses difficiles à retrouver.
- Relances et paiements oubliés.
- Difficulté à préparer les colis.
- Calcul de zakat fait manuellement ou approximativement.
- Absence de page web simple pour présenter ses produits.
- Difficulté à publier régulièrement sur Telegram ou préparer ses messages WhatsApp.
- Difficulté à trouver des partenaires halal pour concrétiser des projets sans prêt à intérêt.

---

## 3. Périmètre fonctionnel global

L'application est organisée autour des modules suivants :

1. Authentification et compte utilisateur
2. Boutique / espace commerçant
3. Tableau de bord
4. Produits
5. Stock
6. Clients
7. Commandes
8. Expédition
9. Notes et rappels
10. Zakat commerciale
11. OCR
12. Détection d'objets / inventaire visuel
13. QR code / scan produit
14. Automatisations internes
15. Messages WhatsApp préparés
16. Publications Telegram
17. Page web publique / mini-site
18. Projets et partenariats halal
19. Exports
20. Sécurité et droits
21. Abonnement SaaS

---

# 4. URS — Authentification et compte

## URS-001 — Création de compte

**En tant que** commerçant,  
**je veux** créer un compte simplement,  
**afin de** commencer à utiliser l'application pour gérer mon activité.

### Critères d'acceptation

- L'utilisateur peut créer un compte avec email et mot de passe.
- L'utilisateur peut renseigner le nom de sa boutique.
- L'utilisateur peut se connecter après inscription.
- Un message d'erreur clair s'affiche si l'email est déjà utilisé.

---

## URS-002 — Connexion

**En tant que** commerçant,  
**je veux** me connecter rapidement à mon espace,  
**afin de** accéder à mes produits, clients, commandes et stock.

### Critères d'acceptation

- L'utilisateur peut se connecter avec email et mot de passe.
- L'utilisateur reste connecté sur son téléphone.
- Un message clair s'affiche si les identifiants sont incorrects.

---

## URS-003 — Mot de passe oublié

**En tant que** commerçant,  
**je veux** pouvoir réinitialiser mon mot de passe,  
**afin de** récupérer l'accès à mon compte si je l'oublie.

### Critères d'acceptation

- L'utilisateur peut demander un lien de réinitialisation.
- Le lien permet de définir un nouveau mot de passe.
- L'ancien mot de passe ne fonctionne plus après modification.

---

# 5. URS — Boutique / espace commerçant

## URS-004 — Création de boutique

**En tant que** commerçant,  
**je veux** créer ma boutique dans l'application,  
**afin de** gérer mes produits et mes ventes dans un espace dédié.

### Critères d'acceptation

- Une boutique est créée au moment de l'inscription.
- La boutique possède un nom.
- Les produits, clients et commandes sont rattachés à cette boutique.

---

## URS-005 — Modification des informations de boutique

**En tant que** commerçant,  
**je veux** modifier les informations de ma boutique,  
**afin de** garder mes données à jour.

### Critères d'acceptation

- L'utilisateur peut modifier le nom de la boutique.
- L'utilisateur peut modifier la devise.
- L'utilisateur peut modifier le pays.
- Les changements sont sauvegardés.

---

# 6. URS — Tableau de bord

## URS-006 — Voir le résumé du jour

**En tant que** commerçant,  
**je veux** voir un résumé de mon activité du jour,  
**afin de** savoir rapidement ce que je dois faire.

### Critères d'acceptation

- Le tableau de bord affiche les commandes à préparer.
- Il affiche les paiements en attente.
- Il affiche les produits en stock faible.
- Il affiche les rappels du jour.
- L'affichage est optimisé pour mobile.

---

## URS-007 — Accès rapide aux actions principales

**En tant que** commerçant,  
**je veux** accéder rapidement aux actions importantes,  
**afin de** gagner du temps sur téléphone.

### Critères d'acceptation

- Un bouton "Nouvelle vente" est visible depuis l'accueil.
- Un bouton "Ajouter produit" est accessible rapidement.
- Un bouton "Ajouter client" est accessible rapidement.
- Les boutons sont faciles à utiliser sur mobile.

---

# 7. URS — Produits

## URS-008 — Ajouter un produit

**En tant que** commerçant,  
**je veux** ajouter un produit,  
**afin de** suivre mon stock et mes ventes.

### Critères d'acceptation

- L'utilisateur peut saisir le nom du produit.
- L'utilisateur peut ajouter une photo.
- L'utilisateur peut saisir le prix d'achat.
- L'utilisateur peut saisir le prix de vente.
- L'utilisateur peut saisir la quantité initiale.
- Le produit apparaît dans la liste des produits.

---

## URS-009 — Prendre une photo produit depuis mobile

**En tant que** commerçant,  
**je veux** prendre une photo directement avec mon téléphone,  
**afin de** l'associer rapidement à un produit.

### Critères d'acceptation

- L'utilisateur peut ouvrir l'appareil photo depuis le formulaire produit.
- La photo est attachée au produit.
- La photo est visible sur la fiche produit.
- L'utilisateur peut remplacer la photo.

---

## URS-010 — Modifier un produit

**En tant que** commerçant,  
**je veux** modifier les informations d'un produit,  
**afin de** corriger ou mettre à jour mes données.

### Critères d'acceptation

- L'utilisateur peut modifier le nom.
- L'utilisateur peut modifier les prix.
- L'utilisateur peut modifier la photo.
- L'utilisateur peut modifier l'emplacement.
- Les modifications sont enregistrées.

---

## URS-011 — Désactiver un produit

**En tant que** commerçant,  
**je veux** désactiver un produit que je ne vends plus,  
**afin de** garder une liste propre sans perdre l'historique.

### Critères d'acceptation

- Le produit peut être marqué comme inactif.
- Le produit inactif n'apparaît plus dans les ventes par défaut.
- L'historique du produit reste consultable.

---

## URS-012 — Rechercher un produit

**En tant que** commerçant,  
**je veux** rechercher rapidement un produit,  
**afin de** le retrouver sans perdre de temps.

### Critères d'acceptation

- La recherche fonctionne par nom.
- La recherche fonctionne par référence.
- Les résultats s'affichent rapidement.
- La recherche est utilisable sur mobile.

---

# 8. URS — Stock

## URS-013 — Voir le stock disponible

**En tant que** commerçant,  
**je veux** voir la quantité disponible de chaque produit,  
**afin de** savoir ce que je peux vendre.

### Critères d'acceptation

- Chaque produit affiche sa quantité disponible.
- Les produits en rupture sont visibles.
- Les produits en stock faible sont signalés.

---

## URS-014 — Ajouter une entrée de stock

**En tant que** commerçant,  
**je veux** ajouter une entrée de stock,  
**afin de** enregistrer un réassort fournisseur.

### Critères d'acceptation

- L'utilisateur choisit le produit.
- L'utilisateur saisit la quantité ajoutée.
- La quantité du produit augmente.
- Un mouvement de stock est créé.

---

## URS-015 — Ajouter une sortie de stock

**En tant que** commerçant,  
**je veux** enregistrer une sortie de stock,  
**afin de** corriger une perte, une casse ou une sortie hors commande.

### Critères d'acceptation

- L'utilisateur choisit le produit.
- L'utilisateur saisit la quantité retirée.
- L'utilisateur indique une raison.
- La quantité du produit diminue.
- Un mouvement de stock est créé.

---

## URS-016 — Historique des mouvements de stock

**En tant que** commerçant,  
**je veux** consulter l'historique du stock,  
**afin de** comprendre les entrées, sorties et corrections.

### Critères d'acceptation

- Chaque mouvement affiche une date.
- Chaque mouvement affiche le produit concerné.
- Chaque mouvement affiche la quantité.
- Chaque mouvement affiche la raison.
- Les mouvements liés à une commande sont identifiables.

---

## URS-017 — Alerte stock faible

**En tant que** commerçant,  
**je veux** être alerté quand un produit est presque épuisé,  
**afin de** le recommander à temps.

### Critères d'acceptation

- L'utilisateur peut définir un seuil d'alerte.
- Le produit apparaît dans "stock faible" quand le seuil est atteint.
- L'alerte est visible sur le tableau de bord.

---

# 9. URS — Clients

## URS-018 — Ajouter un client

**En tant que** commerçant,  
**je veux** enregistrer un client,  
**afin de** retrouver facilement ses informations.

### Critères d'acceptation

- L'utilisateur peut saisir le nom du client.
- L'utilisateur peut saisir le téléphone.
- L'utilisateur peut saisir l'adresse.
- L'utilisateur peut ajouter une note.
- Le client apparaît dans la liste des clients.

---

## URS-019 — Modifier un client

**En tant que** commerçant,  
**je veux** modifier les informations d'un client,  
**afin de** garder ses coordonnées à jour.

### Critères d'acceptation

- L'utilisateur peut modifier le nom.
- L'utilisateur peut modifier le téléphone.
- L'utilisateur peut modifier l'adresse.
- L'utilisateur peut modifier les notes.

---

## URS-020 — Voir l'historique d'un client

**En tant que** commerçant,  
**je veux** voir l'historique des commandes d'un client,  
**afin de** savoir ce qu'il a déjà acheté.

### Critères d'acceptation

- La fiche client affiche ses commandes.
- La fiche client affiche les montants commandés.
- La fiche client affiche les paiements en attente.
- La fiche client affiche la dernière commande.

---

## URS-021 — Marquer un client à relancer

**En tant que** commerçant,  
**je veux** marquer un client à relancer,  
**afin de** ne pas oublier de le contacter.

### Critères d'acceptation

- L'utilisateur peut créer un rappel lié au client.
- Le rappel apparaît dans le tableau de bord.
- Le rappel peut être marqué comme terminé.

---

# 10. URS — Commandes

## URS-022 — Créer une commande

**En tant que** commerçant,  
**je veux** créer une commande rapidement,  
**afin de** enregistrer une vente sans passer par mes notes ou WhatsApp.

### Critères d'acceptation

- L'utilisateur peut sélectionner ou créer un client.
- L'utilisateur peut ajouter un ou plusieurs produits.
- L'utilisateur peut modifier les quantités.
- Le total est calculé automatiquement.
- La commande est enregistrée.

---

## URS-023 — Créer une vente rapide sans client

**En tant que** commerçant,  
**je veux** créer une vente sans forcément enregistrer un client,  
**afin de** gérer les ventes rapides.

### Critères d'acceptation

- L'utilisateur peut créer une commande sans client.
- Les produits sont ajoutés normalement.
- Le stock est mis à jour.
- La vente apparaît dans l'historique.

---

## URS-024 — Calcul automatique du total

**En tant que** commerçant,  
**je veux** que le total de la commande soit calculé automatiquement,  
**afin de** éviter les erreurs.

### Critères d'acceptation

- Le total des produits est calculé.
- Les frais de livraison peuvent être ajoutés.
- Une remise peut être appliquée.
- Le total final est affiché clairement.

---

## URS-025 — Suivre le statut de paiement

**En tant que** commerçant,  
**je veux** suivre le paiement d'une commande,  
**afin de** savoir ce qui est payé ou non.

### Critères d'acceptation

- Une commande peut être "non payée".
- Une commande peut être "payée".
- Une commande peut être "acompte reçu".
- Les commandes non payées apparaissent dans le dashboard.

---

## URS-026 — Suivre le statut de préparation

**En tant que** commerçant,  
**je veux** suivre l'état de préparation d'une commande,  
**afin de** savoir ce que je dois préparer ou expédier.

### Critères d'acceptation

- Une commande peut être en brouillon.
- Une commande peut être à préparer.
- Une commande peut être préparée.
- Une commande peut être expédiée.
- Une commande peut être annulée.

---

## URS-027 — Réserver le stock à la commande

**En tant que** commerçant,  
**je veux** que le stock soit réservé quand une commande est à préparer,  
**afin de** éviter de vendre deux fois le même produit.

### Critères d'acceptation

- Le stock est diminué lorsque la commande passe à "à préparer".
- Le stock est restauré si la commande est annulée.
- Un mouvement de stock est créé automatiquement.

---

# 11. URS — Expédition

## URS-028 — Ajouter les informations de livraison

**En tant que** commerçant,  
**je veux** enregistrer les informations de livraison d'une commande,  
**afin de** préparer l'expédition correctement.

### Critères d'acceptation

- L'utilisateur peut saisir ou récupérer l'adresse client.
- L'utilisateur peut choisir un mode de livraison.
- L'utilisateur peut ajouter une note de livraison.

---

## URS-029 — Générer une fiche colis

**En tant que** commerçant,  
**je veux** générer une fiche colis simple,  
**afin de** imprimer ou recopier les informations d'expédition.

### Critères d'acceptation

- La fiche contient le nom du client.
- La fiche contient l'adresse.
- La fiche contient le téléphone.
- La fiche contient le numéro de commande.
- La fiche peut être téléchargée en PDF.

---

## URS-030 — Enregistrer un numéro de suivi

**En tant que** commerçant,  
**je veux** enregistrer le numéro de suivi d'un colis,  
**afin de** retrouver facilement les informations d'expédition.

### Critères d'acceptation

- L'utilisateur peut saisir le transporteur.
- L'utilisateur peut saisir le numéro de suivi.
- Le suivi est visible dans la commande.

---

## URS-031 — Préparer un message WhatsApp de suivi

**En tant que** commerçant,  
**je veux** générer un message de suivi prêt à envoyer,  
**afin de** informer rapidement le client.

### Critères d'acceptation

- L'application génère un message avec le nom du client.
- Le message contient le numéro de suivi.
- L'utilisateur peut copier le message.
- L'utilisateur peut ouvrir WhatsApp avec le message prérempli.
- L'envoi reste manuel par l'utilisateur.

---

# 12. URS — Notes et rappels

## URS-032 — Créer une note libre

**En tant que** commerçant,  
**je veux** créer une note rapidement,  
**afin de** ne plus disperser mes informations dans plusieurs applications.

### Critères d'acceptation

- L'utilisateur peut créer une note texte.
- La note peut être retrouvée plus tard.
- La note affiche sa date de création.

---

## URS-033 — Lier une note à un client

**En tant que** commerçant,  
**je veux** lier une note à un client,  
**afin de** conserver les informations importantes au bon endroit.

### Critères d'acceptation

- Une note peut être attachée à un client.
- La note apparaît sur la fiche client.

---

## URS-034 — Lier une note à une commande

**En tant que** commerçant,  
**je veux** ajouter une note sur une commande,  
**afin de** conserver les détails particuliers de cette vente.

### Critères d'acceptation

- Une note peut être attachée à une commande.
- La note apparaît dans le détail de la commande.

---

## URS-035 — Créer un rappel

**En tant que** commerçant,  
**je veux** créer un rappel,  
**afin de** ne pas oublier une action importante.

### Critères d'acceptation

- L'utilisateur peut saisir un titre.
- L'utilisateur peut choisir une date.
- Le rappel apparaît sur le dashboard.
- Le rappel peut être marqué comme terminé.

---

# 13. URS — Zakat commerciale

## URS-036 — Définir une date de zakat

**En tant que** commerçant musulman,  
**je veux** définir ma date annuelle de zakat,  
**afin de** recevoir un rappel au bon moment.

### Critères d'acceptation

- L'utilisateur peut saisir une date annuelle.
- L'application affiche la prochaine échéance.
- Un rappel est généré avant cette date.

---

## URS-037 — Calculer la valeur du stock zakatable

**En tant que** commerçant,  
**je veux** calculer la valeur de mon stock destiné à la vente,  
**afin de** préparer mon calcul de zakat.

### Critères d'acceptation

- L'application récupère les produits actifs en stock.
- L'application calcule une valeur estimée du stock.
- L'utilisateur peut corriger manuellement le montant.

---

## URS-038 — Ajouter les liquidités

**En tant que** commerçant,  
**je veux** saisir l'argent disponible lié à mon activité,  
**afin de** l'inclure dans le calcul de zakat.

### Critères d'acceptation

- L'utilisateur peut saisir un montant.
- Le montant est pris en compte dans le calcul.
- Le montant peut être modifié.

---

## URS-039 — Ajouter les créances clients

**En tant que** commerçant,  
**je veux** ajouter les sommes que mes clients me doivent,  
**afin de** les intégrer au calcul si elles sont récupérables.

### Critères d'acceptation

- L'application peut proposer les commandes non payées.
- L'utilisateur peut confirmer ou corriger le montant.
- Le montant est ajouté au calcul.

---

## URS-040 — Ajouter les dettes court terme

**En tant que** commerçant,  
**je veux** saisir mes dettes commerciales court terme,  
**afin de** les déduire du calcul si applicable.

### Critères d'acceptation

- L'utilisateur peut saisir un montant.
- Le montant est déduit de l'assiette.
- Le montant peut être modifié.

---

## URS-041 — Afficher l'estimation de zakat

**En tant que** commerçant,  
**je veux** voir une estimation claire de ma zakat,  
**afin de** savoir quel montant préparer.

### Critères d'acceptation

- L'application affiche l'assiette zakatable.
- L'application affiche le calcul à 2,5 %.
- L'application indique clairement que le résultat est une estimation.
- L'utilisateur peut exporter le résultat.

---

# 14. URS — OCR

## URS-042 — Importer une facture fournisseur

**En tant que** commerçant,  
**je veux** prendre en photo une facture fournisseur,  
**afin de** éviter de saisir toutes les informations à la main.

### Critères d'acceptation

- L'utilisateur peut prendre une photo depuis son téléphone.
- L'image est envoyée à l'application.
- L'image est associée à un document de type facture.
- Le traitement OCR peut être lancé.

---

## URS-043 — Extraire le texte d'une facture

**En tant que** commerçant,  
**je veux** que l'application lise le texte d'une facture,  
**afin de** récupérer les informations importantes.

### Critères d'acceptation

- L'OCR extrait le texte brut.
- Le texte extrait est affiché à l'utilisateur.
- L'utilisateur peut corriger le texte si nécessaire.

---

## URS-044 — Structurer les données d'une facture

**En tant que** commerçant,  
**je veux** que l'application identifie les produits, quantités et prix,  
**afin de** préparer une entrée de stock.

### Critères d'acceptation

- L'application propose une liste de produits détectés.
- L'application propose les quantités détectées.
- L'application propose les prix détectés.
- L'utilisateur doit valider avant enregistrement.

---

## URS-045 — Créer une entrée de stock depuis OCR

**En tant que** commerçant,  
**je veux** transformer une facture lue par OCR en entrée de stock,  
**afin de** gagner du temps lors des réassorts.

### Critères d'acceptation

- L'utilisateur peut valider les lignes détectées.
- Les quantités sont ajoutées au stock après validation.
- Des mouvements de stock sont créés.
- Les données OCR restent consultables.

---

## URS-046 — Extraire une adresse client depuis une image

**En tant que** commerçant,  
**je veux** extraire une adresse client depuis une capture ou une photo,  
**afin de** créer une commande plus rapidement.

### Critères d'acceptation

- L'utilisateur peut importer une image contenant une adresse.
- L'application propose un nom, téléphone et adresse.
- L'utilisateur valide ou corrige.
- Les données peuvent être associées à un client ou une commande.

---

# 15. URS — Détection d'objets / inventaire visuel

## URS-047 — Prendre une photo d'étagère

**En tant que** commerçant,  
**je veux** prendre une photo d'une étagère,  
**afin de** garder une trace visuelle de mon stock.

### Critères d'acceptation

- L'utilisateur peut prendre une photo.
- L'utilisateur peut nommer l'emplacement.
- La photo est sauvegardée.
- La photo est consultable plus tard.

---

## URS-048 — Associer une étagère à un emplacement

**En tant que** commerçant,  
**je veux** associer une photo à une étagère ou zone de stockage,  
**afin de** organiser mon inventaire.

### Critères d'acceptation

- L'utilisateur peut créer un emplacement.
- L'utilisateur peut lier une photo à cet emplacement.
- Les produits peuvent être rattachés à un emplacement.

---

## URS-049 — Détecter les produits visibles sur une photo

**En tant que** commerçant,  
**je veux** que l'application détecte les produits visibles sur une étagère,  
**afin de** m'aider à faire l'inventaire.

### Critères d'acceptation

- L'application analyse la photo.
- L'application propose une liste de produits détectés.
- L'application affiche un niveau de confiance.
- L'utilisateur doit valider ou corriger.

---

## URS-050 — Compter les articles visibles

**En tant que** commerçant,  
**je veux** que l'application estime le nombre d'articles visibles,  
**afin de** accélérer mon inventaire.

### Critères d'acceptation

- L'application propose une quantité par produit détecté.
- L'utilisateur peut modifier chaque quantité.
- Les quantités ne sont pas appliquées automatiquement.
- Un historique de détection est conservé.

---

## URS-051 — Mettre à jour le stock après validation humaine

**En tant que** commerçant,  
**je veux** valider les quantités détectées avant modification du stock,  
**afin de** éviter les erreurs de l'IA.

### Critères d'acceptation

- L'utilisateur voit les quantités proposées.
- L'utilisateur peut corriger les quantités.
- L'utilisateur valide l'inventaire.
- Le stock est modifié uniquement après validation.

---

# 16. URS — QR code / scan produit

## URS-052 — Générer un QR code produit

**En tant que** commerçant,  
**je veux** générer un QR code pour un produit,  
**afin de** le retrouver rapidement avec mon téléphone.

### Critères d'acceptation

- Chaque produit peut avoir un QR code.
- Le QR code peut être téléchargé ou imprimé.
- Le QR code renvoie vers la fiche produit.

---

## URS-053 — Scanner un QR code produit

**En tant que** commerçant,  
**je veux** scanner un QR code produit,  
**afin de** accéder rapidement à sa fiche.

### Critères d'acceptation

- L'utilisateur peut ouvrir le scanner depuis mobile.
- Le produit est reconnu.
- La fiche produit s'ouvre automatiquement.

---

## URS-054 — Modifier le stock après scan

**En tant que** commerçant,  
**je veux** scanner un produit puis ajouter ou retirer une quantité,  
**afin de** gérer mon stock plus rapidement.

### Critères d'acceptation

- Après scan, l'utilisateur peut choisir "entrée stock".
- Après scan, l'utilisateur peut choisir "sortie stock".
- Un mouvement de stock est créé.
- Le stock est mis à jour.

---

# 17. URS — Automatisations internes

## URS-055 — Rappel d'impayé

**En tant que** commerçant,  
**je veux** être alerté lorsqu'une commande reste impayée,  
**afin de** relancer le client.

### Critères d'acceptation

- Une commande non payée apparaît dans les alertes.
- L'utilisateur peut marquer le paiement comme reçu.
- L'utilisateur peut créer un rappel de relance.

---

## URS-056 — Rappel de commande à préparer

**En tant que** commerçant,  
**je veux** voir les commandes à préparer,  
**afin de** ne pas oublier d'envoyer un colis.

### Critères d'acceptation

- Les commandes à préparer apparaissent sur le dashboard.
- L'utilisateur peut changer leur statut.
- Les commandes préparées disparaissent de cette section.

---

## URS-057 — Résumé quotidien

**En tant que** commerçant,  
**je veux** recevoir ou consulter un résumé de ma journée,  
**afin de** savoir ce qui a été vendu et ce qui reste à faire.

### Critères d'acceptation

- Le résumé affiche les ventes du jour.
- Le résumé affiche les commandes à préparer.
- Le résumé affiche les impayés.
- Le résumé affiche les alertes stock.

---

# 18. URS — Exports

## URS-058 — Exporter les commandes

**En tant que** commerçant,  
**je veux** exporter mes commandes,  
**afin de** les conserver ou les transmettre à mon comptable.

### Critères d'acceptation

- L'utilisateur peut exporter au format CSV.
- L'utilisateur peut filtrer par période.
- L'export contient les informations principales des commandes.

---

## URS-059 — Exporter le stock

**En tant que** commerçant,  
**je veux** exporter mon stock,  
**afin de** avoir une vision complète de mes produits.

### Critères d'acceptation

- L'utilisateur peut exporter la liste des produits.
- L'export contient les quantités.
- L'export contient les prix d'achat et de vente.
- L'export contient la valeur estimée du stock.

---

## URS-060 — Exporter le calcul de zakat

**En tant que** commerçant,  
**je veux** exporter mon calcul de zakat,  
**afin de** conserver une trace annuelle.

### Critères d'acceptation

- L'utilisateur peut générer un PDF.
- Le PDF affiche les valeurs utilisées.
- Le PDF affiche le montant estimé.
- Le PDF mentionne que le calcul est indicatif.

---

# 19. URS — Sécurité et droits

## URS-061 — Séparer les données par boutique

**En tant que** propriétaire de boutique,  
**je veux** que mes données soient séparées des autres utilisateurs,  
**afin de** garantir la confidentialité de mon activité.

### Critères d'acceptation

- Un utilisateur ne peut voir que ses données.
- Les produits sont liés à une boutique.
- Les commandes sont liées à une boutique.
- Les clients sont liés à une boutique.

---

## URS-062 — Historiser les actions importantes

**En tant que** commerçant,  
**je veux** garder une trace des actions sensibles,  
**afin de** comprendre les changements faits dans mon stock ou mes commandes.

### Critères d'acceptation

- Les mouvements de stock sont historisés.
- Les changements de statut de commande sont historisés.
- Les suppressions critiques sont évitées ou remplacées par une désactivation.

---

## URS-063 — Sauvegarde des fichiers

**En tant que** commerçant,  
**je veux** que mes photos et documents soient sauvegardés,  
**afin de** ne pas perdre mes données.

### Critères d'acceptation

- Les photos produits sont stockées.
- Les factures importées sont stockées.
- Les fichiers restent accessibles depuis l'application.

---

# 20. URS — Abonnement SaaS

## URS-064 — Limiter l'offre gratuite

**En tant que** propriétaire du SaaS,  
**je veux** proposer une offre gratuite limitée,  
**afin de** permettre aux commerçants de tester l'application.

### Critères d'acceptation

- Le nombre de produits peut être limité.
- Le nombre de commandes mensuelles peut être limité.
- L'utilisateur est informé lorsqu'il atteint une limite.

---

## URS-065 — Passer à une offre payante

**En tant que** commerçant,  
**je veux** passer à une offre payante,  
**afin de** débloquer plus de fonctionnalités.

### Critères d'acceptation

- L'utilisateur peut voir les offres disponibles.
- L'utilisateur peut choisir une offre.
- Les limites sont mises à jour après souscription.

---

# 21. URS — Messages WhatsApp préparés

## Règle générale

L'application ne doit pas envoyer automatiquement de messages WhatsApp.

Elle doit uniquement :

- préparer un message ;
- permettre à l'utilisateur de le modifier ;
- permettre de le copier ;
- permettre d'ouvrir WhatsApp avec un message prérempli ;
- laisser l'utilisateur envoyer manuellement le message.

---

## URS-066 — Préparer un message WhatsApp

**En tant que** commerçant,  
**je veux** générer un message WhatsApp prêt à envoyer,  
**afin de** gagner du temps sans automatiser l'envoi.

### Critères d'acceptation

- L'application génère un message à partir d'un contexte : commande, produit, relance ou promotion.
- L'utilisateur peut modifier le message.
- L'utilisateur peut copier le message.
- L'utilisateur peut ouvrir WhatsApp avec le message prérempli.
- L'envoi final reste manuel.

---

## URS-067 — Marquer un message WhatsApp comme envoyé

**En tant que** commerçant,  
**je veux** marquer un message comme envoyé,  
**afin de** garder une trace de mes relances et communications.

### Critères d'acceptation

- Le message peut être marqué comme envoyé.
- La date d'envoi manuel est enregistrée.
- Le message reste consultable dans l'historique.

---

# 22. URS — Publications Telegram

## URS-068 — Connecter un bot Telegram

**En tant que** commerçant,  
**je veux** connecter mon canal ou groupe Telegram,  
**afin de** programmer des publications depuis l'application.

### Critères d'acceptation

- L'utilisateur peut renseigner les informations nécessaires au bot.
- L'application peut vérifier que le bot a accès au canal ou groupe.
- L'utilisateur peut sélectionner une destination Telegram.
- Le bot doit avoir les droits nécessaires pour publier.

---

## URS-069 — Programmer une publication Telegram

**En tant que** commerçant,  
**je veux** programmer une publication Telegram,  
**afin de** communiquer régulièrement avec mes clients.

### Critères d'acceptation

- L'utilisateur peut saisir un message.
- L'utilisateur peut ajouter une image.
- L'utilisateur peut choisir une date ou une fréquence.
- L'application publie automatiquement à l'heure prévue.
- L'historique d'envoi est conservé.
- L'utilisateur peut désactiver la programmation.

---

# 23. URS — Page web publique / mini-site

## Objectif du module

Permettre au commerçant de créer une page publique simple depuis son interface admin, afin de présenter :

- sa boutique ;
- ses produits ;
- ses services ;
- ses tarifs ;
- ses photos ;
- ses liens de contact ;
- son catalogue simple.

La page publique doit être pensée comme une vitrine simple, pas comme un e-commerce complet au départ.

---

## URS-070 — Activer une page publique

**En tant que** commerçant,  
**je veux** activer une page web publique,  
**afin de** présenter ma boutique, mes produits ou mes services.

### Critères d'acceptation

- L'utilisateur peut activer ou désactiver sa page.
- Une URL publique est générée.
- La page est accessible sans connexion.
- La page peut être masquée à tout moment.

---

## URS-071 — Modifier les informations de la page

**En tant que** commerçant,  
**je veux** modifier les informations générales de ma page,  
**afin de** présenter correctement mon activité.

### Critères d'acceptation

- L'utilisateur peut modifier le nom affiché.
- L'utilisateur peut modifier le slogan.
- L'utilisateur peut modifier la description.
- L'utilisateur peut ajouter un logo.
- L'utilisateur peut ajouter une image de couverture.

---

## URS-072 — Personnaliser l'apparence de la page

**En tant que** commerçant,  
**je veux** personnaliser les couleurs et le thème de ma page,  
**afin de** avoir une page adaptée à mon image.

### Critères d'acceptation

- L'utilisateur peut choisir un thème.
- L'utilisateur peut choisir une couleur principale.
- L'utilisateur peut prévisualiser le résultat.
- Les changements sont visibles sur la page publique.

---

## URS-073 — Gérer les sections de la page

**En tant que** commerçant,  
**je veux** activer, désactiver et organiser les sections de ma page,  
**afin de** construire une page simple adaptée à mon activité.

### Critères d'acceptation

- L'utilisateur peut activer ou masquer une section.
- L'utilisateur peut modifier l'ordre des sections.
- L'utilisateur peut modifier les textes des sections.
- La page publique respecte l'ordre choisi.

---

## URS-074 — Afficher des produits sur la page publique

**En tant que** commerçant,  
**je veux** choisir les produits affichés sur ma page,  
**afin de** présenter mon catalogue à mes clients.

### Critères d'acceptation

- L'utilisateur peut sélectionner les produits visibles.
- Chaque produit affiche une photo.
- Chaque produit affiche un nom.
- Chaque produit affiche une description.
- Chaque produit peut afficher un prix.
- Chaque produit peut avoir un bouton de contact.

---

## URS-075 — Afficher des services sur la page publique

**En tant que** commerçant,  
**je veux** ajouter des services à ma page,  
**afin de** présenter une activité qui ne repose pas uniquement sur des produits.

### Critères d'acceptation

- L'utilisateur peut créer un service.
- Le service peut avoir un titre.
- Le service peut avoir une description.
- Le service peut avoir un prix ou une mention "sur devis".
- Le service peut être affiché ou masqué.

---

## URS-076 — Ajouter des boutons de contact

**En tant que** commerçant,  
**je veux** ajouter des boutons de contact sur ma page,  
**afin de** permettre aux clients de me contacter facilement.

### Critères d'acceptation

- L'utilisateur peut ajouter un bouton WhatsApp.
- L'utilisateur peut ajouter un bouton Telegram.
- L'utilisateur peut ajouter un bouton Instagram.
- L'utilisateur peut ajouter un bouton téléphone.
- L'utilisateur peut choisir le bouton principal.

---

## URS-077 — Prévisualiser la page publique

**En tant que** commerçant,  
**je veux** prévisualiser ma page avant de la publier,  
**afin de** vérifier son rendu.

### Critères d'acceptation

- L'utilisateur peut voir un aperçu mobile.
- L'utilisateur peut voir un aperçu desktop simple.
- Les modifications peuvent être sauvegardées en brouillon.
- La page publiée n'est modifiée qu'après validation.

---

## URS-078 — Commander un produit depuis la page

**En tant que** client final,  
**je veux** cliquer sur un produit et contacter le commerçant,  
**afin de** commander facilement.

### Critères d'acceptation

- Le bouton "Commander" ouvre WhatsApp ou un canal de contact choisi.
- Le message contient le nom du produit.
- Le message peut contenir le prix.
- Le commerçant reçoit une demande claire.
- Aucun paiement n'est géré par la page dans la version initiale.

---

# 24. URS — Projets et partenariats halal

## Objectif du module

Créer un espace de mise en relation entre :

- des porteurs de projets ;
- des commerçants cherchant un partenaire ;
- des personnes ayant des fonds, compétences ou ressources ;
- des personnes souhaitant construire un projet commun dans une logique halal.

Ce module ne doit pas être une plateforme de collecte d'argent, de prêt, de rendement garanti ou de conseil en investissement.

La plateforme facilite uniquement la mise en relation.

## Principes

La plateforme ne doit pas :

- collecter de fonds ;
- promettre un rendement ;
- signer de contrat pour les utilisateurs ;
- vendre des parts ;
- organiser de prêt à intérêt ;
- garantir la rentabilité ;
- conseiller juridiquement ou financièrement un utilisateur ;
- se présenter comme une plateforme de financement participatif.

La plateforme peut :

- permettre de présenter un projet ;
- permettre de présenter un besoin ;
- permettre d'indiquer une enveloppe indicative ;
- permettre de chercher un associé ou partenaire ;
- permettre d'échanger ;
- permettre de partager des documents ;
- permettre de signaler un projet douteux ;
- rappeler que les accords doivent se faire directement entre les parties.

---

## URS-079 — Créer une fiche projet

**En tant que** porteur de projet,  
**je veux** présenter mon idée ou mon commerce,  
**afin de** trouver des personnes intéressées pour échanger ou construire un partenariat.

### Critères d'acceptation

- L'utilisateur peut ajouter un titre.
- L'utilisateur peut décrire son projet.
- L'utilisateur peut choisir un secteur.
- L'utilisateur peut indiquer l'état du projet : idée, test, déjà lancé, développement.
- L'utilisateur peut indiquer un besoin : associé, partenaire, apport financier, compétence, mentor.
- L'utilisateur peut publier ou masquer la fiche.

---

## URS-080 — Indiquer le besoin recherché

**En tant que** porteur de projet,  
**je veux** expliquer ce dont j'ai besoin,  
**afin de** attirer les bonnes personnes.

### Critères d'acceptation

- L'utilisateur peut indiquer un montant indicatif si besoin.
- L'utilisateur peut expliquer l'usage prévu de ce montant.
- L'utilisateur peut préciser s'il cherche un associé actif, passif, commercial ou technique.
- L'utilisateur peut préciser qu'il ne souhaite pas de prêt à intérêt.
- Le montant affiché est présenté comme indicatif et non comme une collecte.

---

## URS-081 — Présenter un partenariat halal

**En tant que** porteur de projet,  
**je veux** préciser le type de partenariat envisagé,  
**afin de** respecter une logique sans usure et avec risque partagé.

### Critères d'acceptation

- L'utilisateur peut choisir "partenariat commercial".
- L'utilisateur peut choisir "association".
- L'utilisateur peut choisir "partage bénéfices/risques".
- L'utilisateur peut choisir "apport financier + implication".
- L'utilisateur peut ajouter une explication libre.
- Aucun rendement garanti n'est affiché par la plateforme.

---

## URS-082 — Créer un profil partenaire

**En tant que** personne intéressée,  
**je veux** créer un profil partenaire,  
**afin de** trouver des projets compatibles avec mes moyens et mes valeurs.

### Critères d'acceptation

- L'utilisateur peut indiquer une enveloppe indicative.
- L'utilisateur peut choisir des secteurs d'intérêt.
- L'utilisateur peut indiquer ses compétences.
- L'utilisateur peut préciser s'il veut être actif ou passif.
- L'utilisateur peut préciser sa zone géographique préférée.

---

## URS-083 — Explorer les projets

**En tant que** partenaire potentiel,  
**je veux** consulter les projets publiés,  
**afin de** trouver des opportunités de collaboration.

### Critères d'acceptation

- Les projets publiés sont visibles dans une liste.
- L'utilisateur peut filtrer par secteur.
- L'utilisateur peut filtrer par ville ou pays.
- L'utilisateur peut filtrer par type de besoin.
- L'utilisateur peut ouvrir une fiche projet détaillée.

---

## URS-084 — Manifester son intérêt

**En tant que** partenaire potentiel,  
**je veux** manifester mon intérêt pour un projet,  
**afin de** démarrer une discussion avec le porteur.

### Critères d'acceptation

- L'utilisateur peut cliquer sur "Je souhaite échanger".
- L'utilisateur peut envoyer un message.
- L'utilisateur peut indiquer une enveloppe indicative s'il le souhaite.
- Le porteur de projet reçoit une notification.
- Aucune transaction financière n'est réalisée sur la plateforme.

---

## URS-085 — Gérer les demandes de contact

**En tant que** porteur de projet,  
**je veux** consulter les personnes intéressées,  
**afin de** choisir avec qui discuter.

### Critères d'acceptation

- Le porteur voit les demandes reçues.
- Il peut accepter, refuser ou archiver une demande.
- Il peut répondre à la personne intéressée.
- L'historique des échanges est conservé.

---

## URS-086 — Encadrer clairement la mise en relation

**En tant que** plateforme,  
**je veux** afficher clairement mon rôle limité,  
**afin de** éviter toute confusion avec une plateforme de financement ou de conseil.

### Critères d'acceptation

- Un avertissement est affiché avant publication d'un projet.
- Un avertissement est affiché avant manifestation d'intérêt.
- Le texte précise que la plateforme ne collecte pas d'argent.
- Le texte précise que la plateforme ne promet aucun rendement.
- Le texte précise que les accords se font directement entre utilisateurs.
- Le texte précise que les utilisateurs doivent faire leurs propres vérifications.

---

## URS-087 — Contrôler la visibilité du projet

**En tant que** porteur de projet,  
**je veux** contrôler qui peut voir mon projet,  
**afin de** protéger mes informations sensibles.

### Critères d'acceptation

- Le projet peut être public.
- Le projet peut être privé.
- Le projet peut être visible seulement après validation du porteur.
- Certains documents peuvent être masqués.
- Le porteur peut retirer son projet à tout moment.

---

## URS-088 — Signaler un projet ou un profil

**En tant qu'utilisateur,**  
**je veux** signaler un projet ou un profil suspect,  
**afin de** protéger les autres utilisateurs.

### Critères d'acceptation

- Un bouton "signaler" est disponible.
- L'utilisateur peut choisir une raison.
- L'équipe admin reçoit le signalement.
- Le projet ou profil peut être suspendu temporairement.

---

# 25. Règles métier globales

## Stock

- Une commande à préparer réserve le stock.
- Une commande annulée libère le stock.
- Une commande expédiée confirme la sortie.
- Une correction manuelle doit toujours créer un mouvement de stock.

## Paiement

- Une commande peut être créée même si elle n'est pas payée.
- Une commande non payée doit apparaître dans les rappels.
- Une commande payée doit être historisée.

## Client

- Un client peut avoir plusieurs commandes.
- Un client peut avoir des notes.
- Un client peut être marqué à relancer.

## WhatsApp

- L'application ne doit pas envoyer automatiquement de messages WhatsApp.
- Elle prépare seulement les messages.
- L'utilisateur reste responsable de l'envoi manuel.

## Telegram

- L'application peut publier automatiquement via bot Telegram si le bot a les droits nécessaires.
- L'utilisateur doit pouvoir désactiver une publication programmée.
- Chaque publication doit être historisée.

## Page publique

- La page peut être activée ou désactivée.
- Les produits affichés sont choisis par le commerçant.
- Le stock exact ne doit pas forcément être affiché.
- Il est préférable d'afficher : disponible, stock limité, rupture.

## Zakat

- Le calcul doit être présenté comme une estimation.
- L'utilisateur doit pouvoir corriger les montants.
- Le calcul doit être historisé.

## OCR

- L'OCR propose des données.
- L'utilisateur valide avant enregistrement.
- L'OCR ne doit pas modifier le stock automatiquement sans confirmation.

## Détection visuelle

- L'IA propose un comptage.
- L'utilisateur confirme ou corrige.
- Le stock est modifié uniquement après validation humaine.

## Projets et partenariats halal

- La plateforme facilite uniquement la mise en relation.
- Elle ne collecte pas d'argent.
- Elle ne promet aucun rendement.
- Elle ne signe aucun contrat.
- Elle ne fournit pas de conseil financier ou juridique.
- Les utilisateurs sont responsables de leurs accords éventuels.

---

# 26. Modèle de données recommandé

## Entités principales

```text
User
Shop
Product
ProductImage
StockMovement
Customer
Order
OrderItem
Shipment
Note
Reminder
ZakatCalculation
UploadedDocument
OcrResult
Shelf
ShelfImage
DetectionResult
PreparedMessage
TelegramPublication
PublicPage
PublicPageSection
PublicProductVisibility
PublicService
ContactButton
Project
ProjectFundingLine
ProjectDocument
PartnerProfile
ProjectInterest
ProjectReport
```

---

## PreparedMessage

```text
id
shop_id
type
context_type
context_id
channel
recipient_name
recipient_phone
message
status
created_at
sent_manually_at
```

---

## TelegramPublication

```text
id
shop_id
destination_type
destination_id
message
media_url
scheduled_at
frequency
status
last_run_at
created_at
```

---

## PublicPage

```text
id
shop_id
slug
is_active
title
subtitle
description
logo_url
cover_image_url
theme_id
primary_color
secondary_color
created_at
updated_at
```

---

## PublicPageSection

```text
id
page_id
type
title
content
position
is_visible
settings_json
created_at
updated_at
```

---

## PublicProductVisibility

```text
id
page_id
product_id
is_visible
custom_title
custom_description
custom_price
badge
position
created_at
updated_at
```

---

## PublicService

```text
id
page_id
title
description
price_label
image_url
is_visible
position
created_at
updated_at
```

---

## ContactButton

```text
id
page_id
type
label
url
phone_number
message_template
is_primary
position
created_at
updated_at
```

---

## Project

```text
id
shop_id
owner_id
title
slug
sector
city
country
description
project_stage
need_type
indicative_amount
currency
funding_use_description
partnership_type
status
visibility
created_at
updated_at
```

---

## ProjectFundingLine

```text
id
project_id
label
amount
description
```

---

## ProjectDocument

```text
id
project_id
file_url
title
visibility
created_at
```

---

## PartnerProfile

```text
id
user_id
budget_min
budget_max
currency
preferred_sectors
preferred_countries
skills
involvement_type
description
created_at
updated_at
```

---

## ProjectInterest

```text
id
project_id
partner_profile_id
message
indicative_amount
status
created_at
updated_at
```

---

## ProjectReport

```text
id
project_id
reporter_id
reason
description
status
created_at
```

---

# 27. Roadmap recommandée

## V1 — Gestion interne

Objectif : résoudre le désordre quotidien du commerçant.

Fonctionnalités :

- Authentification
- Boutique
- Produits
- Photos produit
- Stock
- Clients
- Commandes
- Notes
- Rappels
- Zakat simple
- Sécurité de base

URS concernées :

```text
URS-001 à URS-041
URS-061 à URS-063
```

---

## V2 — Communication simple

Objectif : aider le commerçant à communiquer sans automatiser WhatsApp.

Fonctionnalités :

- Messages WhatsApp préparés
- Copier / ouvrir WhatsApp
- Historique des messages manuels
- Publication Telegram programmée
- Historique Telegram

URS concernées :

```text
URS-066 à URS-069
```

---

## V3 — Page web publique

Objectif : permettre au commerçant d'avoir une vitrine simple.

Fonctionnalités :

- Activation page publique
- Thèmes simples
- Header
- Description boutique
- Produits visibles
- Services visibles
- Boutons WhatsApp / Telegram / Instagram
- Prévisualisation mobile

URS concernées :

```text
URS-070 à URS-078
```

---

## V4 — Catalogue avancé et exports

Objectif : améliorer la visibilité et l'exploitation des données.

Fonctionnalités :

- Filtres produits publics
- Badges promo / nouveauté / rupture
- Demande de commande depuis la page
- Formulaire de contact
- Statistiques de vues
- Exports commandes / stock / zakat

URS concernées :

```text
URS-058 à URS-060
```

---

## V5 — Projets et partenariats halal

Objectif : créer un espace de mise en relation pour construire des projets communs sans usure.

Fonctionnalités :

- Fiches projets
- Profils partenaires
- Besoins indicatifs
- Type de partenariat
- Manifestation d'intérêt
- Messagerie ou demande de contact
- Documents projet
- Signalement
- Avertissement clair sur le rôle limité de la plateforme

URS concernées :

```text
URS-079 à URS-088
```

---

## V6 — IA, OCR et inventaire assisté

Objectif : accélérer la saisie et aider à l'inventaire.

Fonctionnalités :

- OCR facture fournisseur
- OCR adresse client
- QR code / scan produit
- Reconnaissance produit
- Détection visuelle du stock
- Comptage assisté avec validation humaine

URS concernées :

```text
URS-042 à URS-054
```

---

# 28. MVP recommandé

Pour lancer rapidement une première version, le MVP doit se concentrer sur :

```text
- créer un compte
- créer une boutique
- ajouter des produits avec photo
- suivre le stock
- ajouter des clients
- créer des commandes
- suivre les paiements
- créer des notes et rappels
- calculer une zakat indicative
```

Il ne faut pas commencer par l'IA, la détection visuelle ou la mise en relation.

Le cœur du produit doit d'abord résoudre le problème principal :

> aider le commerçant à arrêter de gérer son activité dans WhatsApp, Notes et papier.

---

# 29. Formulation courte du produit

L'application est un SaaS mobile-first pour petits commerçants. Elle permet de gérer les produits, le stock, les clients, les commandes, les colis, les notes, les rappels et la zakat depuis un téléphone.

Elle permet aussi de préparer des messages WhatsApp sans les envoyer automatiquement, de programmer des publications Telegram, de créer une page web publique pour présenter ses produits ou services, et plus tard de proposer un espace de mise en relation halal entre porteurs de projets et partenaires potentiels.

La plateforme ne collecte pas d'argent pour les projets, ne promet aucun rendement, ne signe aucun contrat et ne fait que faciliter la mise en relation.

---

# 30. Principes UX

- Mobile-first.
- Interface très simple.
- Peu de texte.
- Gros boutons.
- Actions rapides.
- Formulaires courts.
- Possibilité de corriger facilement.
- Photos et visuels importants.
- Toujours demander validation humaine pour les actions IA.
- Ne jamais automatiser WhatsApp.
- Ne jamais modifier un stock automatiquement depuis l'IA sans validation.

---

# 31. Contraintes importantes

## RGPD

L'application doit collecter uniquement les données nécessaires :

- données commerçant ;
- données client utiles à la commande ;
- données de livraison ;
- historique de commandes ;
- documents importés volontairement.

Elle doit prévoir :

- suppression ou anonymisation ;
- export des données ;
- séparation stricte des données par boutique ;
- consentement si utilisation marketing ;
- protection des documents sensibles.

## Sécurité

- Mots de passe hashés.
- Connexions sécurisées.
- Contrôle d'accès par boutique.
- Journalisation des actions sensibles.
- Stockage sécurisé des images et documents.
- Sauvegardes régulières.

## IA

- L'IA propose, l'utilisateur valide.
- Les résultats OCR ou détection doivent avoir un niveau de confiance si possible.
- Les erreurs doivent pouvoir être corrigées.
- Les décisions critiques ne doivent pas être automatiques.

---

# 32. Synthèse finale

Le projet peut évoluer en plusieurs couches :

```text
1. Gestion quotidienne du commerce
2. Communication assistée
3. Présence web publique
4. Mise en relation halal
5. IA et automatisation avancée
```

La priorité est de livrer rapidement une application utile, simple et mobile, avant d'ajouter les services plus avancés.

Le meilleur point de départ reste :

> produits + stock + clients + commandes + notes + rappels + zakat.
