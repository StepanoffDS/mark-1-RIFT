CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE incident_status AS ENUM (
  'OPEN',
  'INVESTIGATING',
  'MONITORING',
  'RESOLVED'
);

CREATE TYPE incident_severity AS ENUM (
  'P1',
  'P2',
  'P3'
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status incident_status NOT NULL DEFAULT 'OPEN',
  severity incident_severity NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX incidents_status_idx
  ON incidents(status);

CREATE INDEX incidents_created_at_idx
  ON incidents(created_at DESC);
