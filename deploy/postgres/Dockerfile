# PostgreSQL de production avec WAL-G : archivage continu du journal, sauvegarde
# complète chaque nuit, test de restauration mensuel (docs/exploitation/sauvegardes.md).
# Construite sur le serveur par deploy/deploy.sh ; sert aux services postgres,
# backup et restore de deploy/app/compose.yml.
#
# Même version majeure que la base en service : 16. Debian trixie (glibc 2.41)
# fixée, car le binaire WAL-G est compilé pour Ubuntu 24.04 (glibc 2.39).
FROM postgres:16-trixie

# Mise à jour de WAL-G : nouvelle version et sommes SHA-256 des binaires
# wal-g-pg-24.04-<arch> (fichiers .sha256 de la page de la version sur GitHub).
ARG WALG_VERSION=v3.0.9
ARG WALG_SHA256_AMD64=8015836f246a978f27b31a2462eac7765312558ae5b11ac033322b555abf9e22
ARG WALG_SHA256_ARM64=1edd72c3387bfc3a1c19acad9daa36709dbb7cff0642f7044e175d5f8b555d64
ARG TARGETARCH

# curl : envoi à S3 (certificats) et signaux de surveillance ; jq : liste des sauvegardes.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl jq; \
    rm -rf /var/lib/apt/lists/*; \
    case "$TARGETARCH" in \
      amd64) arch=amd64; sum=$WALG_SHA256_AMD64 ;; \
      arm64) arch=aarch64; sum=$WALG_SHA256_ARM64 ;; \
      *) echo "Architecture non prise en charge : $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /usr/local/bin/wal-g \
      "https://github.com/wal-g/wal-g/releases/download/${WALG_VERSION}/wal-g-pg-24.04-${arch}"; \
    echo "${sum}  /usr/local/bin/wal-g" | sha256sum -c -; \
    chmod 755 /usr/local/bin/wal-g; \
    wal-g --version

COPY --chmod=755 mizan-backup.sh /usr/local/bin/mizan-backup

# Volume de travail du service backup (état du planificateur, restauration de
# test). Créé ici pour qu'un volume nommé vide hérite du propriétaire postgres.
RUN install -d -o postgres -g postgres -m 700 /var/lib/mizan-backup
