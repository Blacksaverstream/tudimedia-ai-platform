export class PostgresAssetStore {
  constructor(queryable) { this.queryable = queryable; }
  async transaction(work) {
    if (typeof this.queryable.connect !== "function") return work(this);
    const client = await this.queryable.connect();
    try {
      await client.query("BEGIN");
      const result = await work(new PostgresAssetStore(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
  async createAsset(asset) {
    return this.oneOrNull(
      `INSERT INTO assets (id, organization_id, created_by_user_id, name, original_filename, storage_key, mime_type, size_bytes, checksum_sha256)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, organization_id AS "organizationId", created_by_user_id AS "createdByUserId", name,
         original_filename AS "originalFilename", storage_key AS "storageKey", mime_type AS "mimeType",
         size_bytes::text AS "sizeBytes", checksum_sha256 AS "checksumSha256", status,
         rejection_reason AS "rejectionReason", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [asset.id, asset.organizationId, asset.createdByUserId, asset.name, asset.originalFilename, asset.storageKey, asset.mimeType, asset.sizeBytes, asset.checksumSha256]
    );
  }
  async getAsset(organizationId, id) {
    return this.oneOrNull(
      `SELECT id, organization_id AS "organizationId", created_by_user_id AS "createdByUserId", name,
        original_filename AS "originalFilename", storage_key AS "storageKey", mime_type AS "mimeType",
        size_bytes::text AS "sizeBytes", checksum_sha256 AS "checksumSha256", status,
        rejection_reason AS "rejectionReason", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM assets WHERE organization_id = $1 AND id = $2`, [organizationId, id]
    );
  }
  async updateAssetStatus({ organizationId, id, status, rejectionReason = null }) {
    return this.oneOrNull(
      `UPDATE assets SET status = $3, rejection_reason = $4, updated_at = now()
       WHERE organization_id = $1 AND id = $2
       RETURNING id, organization_id AS "organizationId", created_by_user_id AS "createdByUserId", name,
         original_filename AS "originalFilename", storage_key AS "storageKey", mime_type AS "mimeType",
         size_bytes::text AS "sizeBytes", checksum_sha256 AS "checksumSha256", status,
         rejection_reason AS "rejectionReason", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [organizationId, id, status, rejectionReason]
    );
  }
  async createJob({ organizationId, assetId, jobType }) {
    return this.oneOrNull(
      `INSERT INTO media_jobs (organization_id, asset_id, job_type) VALUES ($1, $2, $3)
       ON CONFLICT (asset_id, job_type) DO NOTHING
       RETURNING id, organization_id AS "organizationId", asset_id AS "assetId", job_type AS "jobType", status, attempts, created_at AS "createdAt"`,
      [organizationId, assetId, jobType]
    );
  }
  async appendAudit({ organizationId, actorUserId = null, targetUserId = null, sessionId = null, action, metadata = {} }) {
    await this.queryable.query(
      `INSERT INTO audit_events (organization_id, actor_user_id, target_user_id, session_id, action, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [organizationId, actorUserId, targetUserId, sessionId, action, JSON.stringify(metadata)]
    );
  }
  async oneOrNull(sql, values) { const result = await this.queryable.query(sql, values); return result.rows[0] ?? null; }
}
