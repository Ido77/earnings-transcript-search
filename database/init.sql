-- PostgreSQL initialization script
-- This script runs when the database is first created

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Create custom text search configuration for better search
CREATE TEXT SEARCH CONFIGURATION custom_english ( COPY = pg_catalog.english );

-- Grant all privileges to dev user
GRANT ALL PRIVILEGES ON DATABASE transcript_db TO dev;
GRANT ALL PRIVILEGES ON SCHEMA public TO dev;
GRANT CREATE ON SCHEMA public TO dev;
ALTER USER dev SUPERUSER;
ALTER USER dev CREATEDB;

-- Create app_logs table
CREATE TABLE IF NOT EXISTS app_logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(10) NOT NULL,
    message TEXT NOT NULL,
    meta JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Grant permissions on app_logs table
GRANT ALL PRIVILEGES ON TABLE app_logs TO dev;
GRANT ALL PRIVILEGES ON SEQUENCE app_logs_id_seq TO dev;

-- Grant future table permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO dev; 