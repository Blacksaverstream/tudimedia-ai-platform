ALTER TABLE users ADD COLUMN display_name TEXT CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 100);
ALTER TABLE organizations ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX organization_memberships_user_idx ON organization_memberships (user_id, organization_id);
