ALTER TABLE assets ADD COLUMN technical_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE assets ADD COLUMN scanned_at TIMESTAMPTZ;

CREATE TABLE asset_renditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  width INTEGER,
  height INTEGER,
  duration_seconds DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, kind)
);
CREATE INDEX asset_renditions_asset_idx ON asset_renditions (organization_id, asset_id);

ALTER TABLE media_jobs ADD COLUMN locked_at TIMESTAMPTZ;
ALTER TABLE media_jobs ADD COLUMN worker_id TEXT;
