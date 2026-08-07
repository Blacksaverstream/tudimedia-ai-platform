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
  async listAssets({ organizationId, beforeCreatedAt = null, beforeId = null, limit, status = null, mediaType = null }) {
    const result = await this.queryable.query(
      `SELECT id, organization_id AS "organizationId", created_by_user_id AS "createdByUserId", name,
        original_filename AS "originalFilename", mime_type AS "mimeType", size_bytes::text AS "sizeBytes", status,
        rejection_reason AS "rejectionReason", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM assets WHERE organization_id = $1 AND ($2::asset_status IS NULL OR status = $2)
         AND ($3::text IS NULL OR mime_type LIKE ($3 || '/%'))
         AND ($4::timestamptz IS NULL OR (created_at, id) < ($4, $5::uuid))
       ORDER BY created_at DESC, id DESC LIMIT $6`, [organizationId, status, mediaType, beforeCreatedAt, beforeId, limit]);
    return result.rows;
  }
  async getDashboard(organizationId) {
    return this.oneOrNull(`SELECT count(*)::int AS "assetCount", count(*) FILTER (WHERE status = 'ready')::int AS "readyCount",
      count(*) FILTER (WHERE status IN ('queued','processing'))::int AS "processingCount", coalesce(sum(size_bytes),0)::text AS "storageBytes"
      FROM assets WHERE organization_id = $1`, [organizationId]);
  }
  async createCollection(collection) { return this.oneOrNull(`INSERT INTO collections (id, organization_id, created_by_user_id, name, description) VALUES ($1,$2,$3,$4,$5)
    RETURNING id, organization_id AS "organizationId", created_by_user_id AS "createdByUserId", name, description, created_at AS "createdAt", updated_at AS "updatedAt"`, [collection.id, collection.organizationId, collection.createdByUserId, collection.name, collection.description]); }
  async getCollection(organizationId, id) { return this.oneOrNull(`SELECT id, organization_id AS "organizationId", name, description, created_at AS "createdAt" FROM collections WHERE organization_id=$1 AND id=$2`, [organizationId,id]); }
  async listCollections(organizationId) { const result = await this.queryable.query(`SELECT c.id, c.name, c.description, c.created_at AS "createdAt", count(ca.asset_id)::int AS "assetCount" FROM collections c LEFT JOIN collection_assets ca ON ca.collection_id=c.id WHERE c.organization_id=$1 GROUP BY c.id ORDER BY c.created_at DESC,c.id DESC`, [organizationId]); return result.rows; }
  async addCollectionAsset({ collectionId, assetId, addedByUserId }) { const result = await this.queryable.query(`INSERT INTO collection_assets (collection_id, asset_id, added_by_user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [collectionId,assetId,addedByUserId]); return result.rowCount === 1; }
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
  async getCurrentEnrichments(organizationId, assetId) {
    const result = await this.queryable.query(
      `SELECT er.id, er.kind, er.content, er.confidence, er.needs_review AS "needsReview", er.created_at AS "createdAt",
        mr.provider, mr.model, mr.prompt_version AS "promptVersion"
       FROM enrichment_results er JOIN model_runs mr ON mr.id = er.model_run_id
       WHERE er.organization_id = $1 AND er.asset_id = $2 AND er.is_current ORDER BY er.kind`,
      [organizationId, assetId]
    );
    return result.rows;
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
