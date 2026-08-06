CREATE TYPE asset_status AS ENUM ('awaiting_upload', 'queued', 'processing', 'ready', 'rejected', 'failed');
CREATE TYPE media_job_status AS ENUM ('queued', 'processing', 'completed', 'failed');

CREATE TABLE assets (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  original_filename TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  checksum_sha256 TEXT,
  status asset_status NOT NULL DEFAULT 'awaiting_upload',
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX assets_organization_created_idx ON assets (organization_id, created_at DESC);
CREATE INDEX assets_organization_status_idx ON assets (organization_id, status);

CREATE TABLE media_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status media_job_status NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, job_type)
);
CREATE INDEX media_jobs_available_idx ON media_jobs (status, available_at) WHERE status IN ('queued', 'failed');
