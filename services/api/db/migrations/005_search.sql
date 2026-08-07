CREATE TABLE asset_search_documents (
  asset_id UUID PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  transcript TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  language TEXT,
  search_vector TSVECTOR NOT NULL DEFAULT ''::tsvector,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX asset_search_documents_vector_idx ON asset_search_documents USING GIN (search_vector);
CREATE INDEX asset_search_documents_tenant_idx ON asset_search_documents (organization_id, updated_at DESC);
CREATE INDEX asset_search_documents_tags_idx ON asset_search_documents USING GIN (tags);

CREATE FUNCTION update_asset_search_vector() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(NEW.tags, ' ')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.transcript, '')), 'C');
  RETURN NEW;
END;
$$;

CREATE TRIGGER asset_search_vector_update
BEFORE INSERT OR UPDATE OF name, transcript, summary, tags ON asset_search_documents
FOR EACH ROW EXECUTE FUNCTION update_asset_search_vector();

INSERT INTO asset_search_documents (asset_id, organization_id, name)
SELECT id, organization_id, name FROM assets ON CONFLICT (asset_id) DO NOTHING;

CREATE FUNCTION sync_asset_search_document() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO asset_search_documents (asset_id, organization_id, name)
  VALUES (NEW.id, NEW.organization_id, NEW.name)
  ON CONFLICT (asset_id) DO UPDATE SET name = EXCLUDED.name, organization_id = EXCLUDED.organization_id, updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER assets_search_document_sync
AFTER INSERT OR UPDATE OF name ON assets
FOR EACH ROW EXECUTE FUNCTION sync_asset_search_document();
