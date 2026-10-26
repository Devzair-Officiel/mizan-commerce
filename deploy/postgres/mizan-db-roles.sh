#!/usr/bin/env bash
# Rôle PostgreSQL de l'application (docs/exploitation/deploiement.md, « Comptes
# PostgreSQL »). Lancé par deploy/deploy.sh dans le conteneur postgres, avant
# les migrations :
#
#   mizan-db-roles
#
# Crée le rôle APP_DB_USER, ou met à jour son mot de passe (APP_DB_PASSWORD),
# sans aucun attribut privilégié ni appartenance à un autre rôle, et lui donne
# la base POSTGRES_DB : propriété de la base, du schéma public et de tous ses
# objets (tables, séquences, vues, vues matérialisées, fonctions, types).
# Django migre donc avec ce rôle. Idempotent : une seconde exécution ne change
# rien, et l'affiche.
#
# Exécuté en super-utilisateur (POSTGRES_USER, socket local). Nom du rôle, nom
# de la base et mot de passe sont lus dans l'environnement par psql (\getenv) et
# n'entrent dans les commandes SQL que par ses variables (:'var', :"var") ou par
# format('%I') : jamais sur une ligne de commande, jamais concaténés.
set -euo pipefail

fail() {
  echo "mizan-db-roles : $*" >&2
  exit 1
}

[[ -n ${POSTGRES_USER:-} && -n ${POSTGRES_DB:-} ]] || fail "POSTGRES_USER ou POSTGRES_DB absent"
[[ ${APP_DB_USER:-} =~ ^[a-z_][a-z0-9_]{0,62}$ && $APP_DB_USER != pg_* ]] \
  || fail "APP_DB_USER : lettres minuscules, chiffres et _, 63 caractères au plus, sans préfixe pg_"
[[ $APP_DB_USER != "$POSTGRES_USER" ]] || fail "APP_DB_USER doit différer de POSTGRES_USER"
[[ -n ${APP_DB_PASSWORD:-} ]] || fail "APP_DB_PASSWORD vide"
[[ $APP_DB_PASSWORD != "${POSTGRES_PASSWORD:-}" ]] || fail "APP_DB_PASSWORD doit différer de POSTGRES_PASSWORD"

# Le mot de passe en place est-il déjà le bon ? Connexion par l'adresse du
# conteneur, comme Django : règle scram-sha-256 de pg_hba.conf (le socket et la
# boucle locale sont en « trust » et accepteraient n'importe quel mot de passe).
password_works() {
  local host
  host=$(hostname -i | awk '{print $1}')
  PGPASSWORD=$APP_DB_PASSWORD PGCONNECT_TIMEOUT=5 \
    psql -XAtqw -h "$host" -U "$APP_DB_USER" -d "$POSTGRES_DB" -c 'SELECT 1' >/dev/null 2>&1
}

update_password=off
password_works || update_password=on

# Une seule transaction : en cas d'échec, rien n'est changé.
psql -Xq -v ON_ERROR_STOP=1 -v VERBOSITY=terse --single-transaction \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v update_password="$update_password" <<'SQL'
\getenv app_user APP_DB_USER
\getenv app_password APP_DB_PASSWORD
\getenv db POSTGRES_DB

-- ALTER ROLE … PASSWORD envoie le mot de passe en clair : le serveur ne
-- journalise le texte d'aucune commande de cette transaction, même en erreur.
SET LOCAL log_statement = 'none';
SET LOCAL log_min_error_statement = 'panic';
SET LOCAL log_min_duration_statement = -1;
-- Table verrouillée par une longue requête de l'application : échec plutôt
-- qu'une attente qui bloquerait les requêtes suivantes.
SET LOCAL lock_timeout = '10s';

SELECT NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_user') AS create_role,
       EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_user'
               AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication
                    OR rolbypassrls OR NOT rolcanlogin)) AS fix_attributes
\gset

\if :create_role
CREATE ROLE :"app_user" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
\echo 'Rôle' :app_user 'créé'
\elif :fix_attributes
ALTER ROLE :"app_user" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
\echo 'Rôle' :app_user ': attributs privilégiés retirés'
\endif

\if :update_password
ALTER ROLE :"app_user" PASSWORD :'app_password';
\echo 'Rôle' :app_user ': mot de passe mis à jour'
\endif
\unset app_password

-- Le bloc DO ne voit pas les variables psql : nom du rôle passé par un réglage
-- local à la transaction.
SELECT set_config('mizan.app_user', :'app_user', true) \g /dev/null

DO $$
DECLARE
  app text := current_setting('mizan.app_user');
  app_oid oid := (SELECT oid FROM pg_roles WHERE rolname = app);
  obj record;
  relations integer := 0;
  routines integer := 0;
  types integer := 0;
BEGIN
  -- Aucune appartenance : pg_execute_server_program, pg_read_server_files, etc.
  FOR obj IN
    SELECT r.rolname FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid
    WHERE m.member = app_oid
  LOOP
    EXECUTE format('REVOKE %I FROM %I', obj.rolname, app);
    RAISE NOTICE 'Rôle % retiré à %', obj.rolname, app;
  END LOOP;

  IF (SELECT datdba FROM pg_database WHERE datname = current_database()) <> app_oid THEN
    EXECUTE format('ALTER DATABASE %I OWNER TO %I', current_database(), app);
    RAISE NOTICE 'Base % : propriétaire %', current_database(), app;
  END IF;
  IF (SELECT nspowner FROM pg_namespace WHERE nspname = 'public') <> app_oid THEN
    EXECUTE format('ALTER SCHEMA public OWNER TO %I', app);
    RAISE NOTICE 'Schéma public : propriétaire %', app;
  END IF;

  -- Objets du schéma public possédés par un autre rôle (le super-utilisateur
  -- d'amorçage ne peut pas céder les siens par REASSIGN OWNED). Les index et
  -- les séquences des colonnes (identity, serial) suivent leur table ; les
  -- objets d'une extension restent à celle-ci.
  FOR obj IN
    SELECT c.oid::regclass AS name,
           CASE c.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
             WHEN 'S' THEN 'SEQUENCE' WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END AS kind
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      AND c.relowner <> app_oid
      AND NOT EXISTS (
        SELECT FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
          AND (d.deptype = 'e' OR (c.relkind = 'S' AND d.deptype IN ('a', 'i'))))
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO %I', obj.kind, obj.name, app);
    relations := relations + 1;
  END LOOP;

  FOR obj IN
    SELECT p.oid::regprocedure AS name
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proowner <> app_oid
      AND NOT EXISTS (
        SELECT FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER ROUTINE %s OWNER TO %I', obj.name, app);
    routines := routines + 1;
  END LOOP;

  -- Types créés à part : composites, domaines, énumérations, intervalles et
  -- leur multirange, qui ne suit pas (le type ligne d'une table et les
  -- tableaux suivent leur objet).
  FOR obj IN
    SELECT t.oid::regtype AS name, CASE t.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END AS kind
    FROM pg_type t
    LEFT JOIN pg_class c ON c.oid = t.typrelid
    WHERE t.typnamespace = 'public'::regnamespace
      AND t.typowner <> app_oid
      AND t.typtype IN ('c', 'd', 'e', 'r', 'm')
      AND (t.typrelid = 0 OR c.relkind = 'c')
      AND NOT EXISTS (
        SELECT FROM pg_depend d
        WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO %I', obj.kind, obj.name, app);
    types := types + 1;
  END LOOP;

  IF relations + routines + types > 0 THEN
    RAISE NOTICE 'Propriété transférée à % : % table(s), séquence(s) ou vue(s), % fonction(s), % type(s)',
      app, relations, routines, types;
  END IF;
END
$$;

-- Personne d'autre que le propriétaire (et les super-utilisateurs) : ni
-- connexion à la base, ni accès au schéma public.
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO :"app_user";
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SQL

if [[ $update_password == on ]]; then
  password_works || fail "connexion de $APP_DB_USER refusée avec le nouveau mot de passe (pg_hba.conf ?)"
fi
echo "Rôle $APP_DB_USER prêt : propriétaire de la base $POSTGRES_DB, sans privilège d'administration"
