#!/bin/bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE life_tracker_owner LOGIN PASSWORD '${POSTGRES_OWNER_PASSWORD}';
CREATE ROLE life_tracker_app LOGIN PASSWORD '${POSTGRES_APP_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE DATABASE life_tracker_test OWNER life_tracker_owner;
ALTER DATABASE life_tracker OWNER TO life_tracker_owner;
GRANT CONNECT ON DATABASE life_tracker TO life_tracker_owner;
GRANT CONNECT ON DATABASE life_tracker TO life_tracker_app;
GRANT USAGE ON SCHEMA public TO life_tracker_app;
REVOKE CREATE ON SCHEMA public FROM life_tracker_app;
GRANT CONNECT ON DATABASE life_tracker_test TO life_tracker_app;
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname life_tracker_test <<SQL
GRANT USAGE ON SCHEMA public TO life_tracker_app;
REVOKE CREATE ON SCHEMA public FROM life_tracker_app;
SQL
