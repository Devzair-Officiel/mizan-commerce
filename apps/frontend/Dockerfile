# ── base ──────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ── development ───────────────────────────────────────────────────────────────
FROM base AS development
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ── builder (étape intermédiaire pour la prod) ────────────────────────────────
FROM base AS builder
# Les variables NEXT_PUBLIC_* sont inlinées dans le bundle client : elles doivent
# être présentes au build, pas seulement au runtime.
ARG NEXT_PUBLIC_RECAPTCHA_SITE_KEY=""
ENV NEXT_PUBLIC_RECAPTCHA_SITE_KEY=$NEXT_PUBLIC_RECAPTCHA_SITE_KEY
# Sentry (lib/sentry.ts) : vide = désactivé. Le CI passe l'identifiant du commit en release.
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT=""
ARG NEXT_PUBLIC_SENTRY_RELEASE=""
ARG NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=""
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT \
    NEXT_PUBLIC_SENTRY_RELEASE=$NEXT_PUBLIC_SENTRY_RELEASE \
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=$NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── production (deploy/app/compose.yml) ───────────────────────────────────────
# Sortie standalone de Next.js : server.js et les seuls node_modules nécessaires.
FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --ingroup nodejs nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
