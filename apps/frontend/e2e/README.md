# Audits navigateur (Playwright)

Scripts lancés **sans Node sur la machine** : service Docker Compose `e2e` (image officielle `mcr.microsoft.com/playwright`, profil `audit`, ne démarre pas avec la stack). Il cible le frontend du réseau compose (`http://frontend:3000`) et se connecte avec le compte de démo `youssef@example.com` (seed).

```bash
# Depuis la racine du dépôt, stack démarrée (docker compose up -d)
docker compose run --rm e2e                                   # tous les audits
docker compose run --rm e2e npm run audit:pages               # écrans principaux
docker compose run --rm e2e npm run audit:customer-form       # formulaire client
docker compose run --rm -e ONLY=clients,articles e2e npm run audit:pages   # écrans choisis
```

Code de sortie 0 = tout est conforme, 1 = au moins une vérification en échec (détaillée dans la sortie).

## Contenu

- `lib/watch.mjs` — **console surveillée** : toute erreur ou tout avertissement en console et toute exception non rattrapée font échouer l'audit ; **éléments interactifs imbriqués** (bouton dans un lien, etc.).
- `lib/session.mjs` — navigateur, connexion (une par taille d'écran : la limite `auth` du backend reste basse), langue (`NEXT_LOCALE`) et thème (réponse `/auth/me/` réécrite, préférences du compte intactes).
- `lib/messages.mjs` — textes attendus lus dans `../messages/*.json` (montés en lecture seule).
- `audit-pages.mjs` — écrans principaux à 1440px et 360px.
- `audit-customer-form.mjs` — gabarit de formulaire sur le formulaire client, à 1440px et 360px, clair et sombre, français et arabe : création (« Créer le client »), champ obligatoire vide → erreur sous le champ, modification (barre « Modifications non enregistrées », « Annuler » demande confirmation, « Enregistrer » revient sur la fiche), aucune section en accordéon sur desktop. Les clients créés (« Audit e2e … ») sont archivés à la fin.

## Exceptions de la console surveillée

Seulement les messages de l'outillage de développement qui ne viennent pas de notre code (`[Fast Refresh]`, `[HMR]`, invitation React DevTools) et l'échec du WebSocket de rechargement à chaud dans l'**aperçu de la page publique** : l'iframe est en `sandbox` sans `allow-same-origin` (origine opaque), le serveur de dev refuse donc ses ressources de développement. C'est attendu en développement ; le sandbox ne doit pas être assoupli (voir `components/public-page-admin/PreviewCard.tsx`).

## Notes

- Version de Playwright figée dans `package.json` ; elle doit correspondre au tag de l'image dans `docker-compose.yml`.
- `next.config.ts` autorise l'hôte `frontend` en développement (`allowedDevOrigins`) et Chromium traite `http://frontend:3000` comme origine sûre (`crypto.randomUUID`).
- Les limites de requêtes `user` et `anon` sont relevées dans `config/settings/local.py` pour que les audits ne les atteignent pas.
