# Image Chainguard avec les outils de développement (npm inclus)
FROM cgr.dev/chainguard/node:latest-dev

# Passage en root pour la création du dossier de travail
USER root

# Dossier de travail dans le conteneur
WORKDIR /app

# Attribution des droits sur /app à l'utilisateur node
RUN chown -R node:node /app

# Retour à l'utilisateur non-root pour la sécurité
USER node

# Copie de package.json avec les droits corrects (optimise le cache Docker)
COPY --chown=node:node package*.json ./

# Installation des dépendances Node
RUN npm install

# Copie du code source avec les droits corrects
COPY --chown=node:node . .

# Désactive la télémétrie Next.js
ENV NEXT_TELEMETRY_DISABLED=1

# Port exposé par Next.js
EXPOSE 3000

# Remplacement de l'entrypoint par défaut de Chainguard
ENTRYPOINT ["npm"]

# Démarrage du serveur de développement Next.js
CMD ["run", "dev"]