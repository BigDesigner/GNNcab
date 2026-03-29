-- GNNcab PostgreSQL initial setup
-- Run as the postgres superuser:
--   sudo -u postgres psql -f deploy/postgres-setup.sql
--
-- Replace STRONG_PASSWORD_HERE with a real password before running.

-- Create dedicated application user
CREATE USER gnncab WITH
  PASSWORD 'STRONG_PASSWORD_HERE'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  LOGIN;

-- Create database owned by the app user
CREATE DATABASE gnncab
  OWNER gnncab
  ENCODING 'UTF8'
  LC_COLLATE 'en_US.UTF-8'
  LC_CTYPE   'en_US.UTF-8'
  TEMPLATE template0;

-- Connect to the new database and grant privileges
\c gnncab

-- App user owns all future objects it creates
ALTER DEFAULT PRIVILEGES FOR USER gnncab
  IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gnncab;

ALTER DEFAULT PRIVILEGES FOR USER gnncab
  IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO gnncab;

-- Revoke public schema access from all other users
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Enable pg_trgm for efficient ILIKE searches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable uuid-ossp (backup for crypto.randomUUID())
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
