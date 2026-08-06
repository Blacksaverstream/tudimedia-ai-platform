export class PostgresMediaJobStore {
  constructor(pool) { this.pool = pool; }
  async claimNext(workerId) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT id FROM media_jobs
         WHERE job_type IN ('malware_scan', 'video_transcode') AND status IN ('queued', 'failed') AND available_at <= now() AND attempts < 5
         ORDER BY available_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1`
      );
      if (!result.rows[0]) { await client.query("COMMIT"); return null; }
      const claimed = await client.query(
        `UPDATE media_jobs SET status = 'processing', attempts = attempts + 1, locked_at = now(), started_at = now(), worker_id = $2
         WHERE id = $1
         RETURNING id, organization_id AS "organizationId", asset_id AS "assetId", job_type AS "jobType", status, attempts`,
        [result.rows[0].id, workerId]
      );
      await client.query(`UPDATE assets SET status = 'processing', updated_at = now() WHERE id = $1`, [claimed.rows[0].assetId]);
      await client.query("COMMIT");
      return claimed.rows[0];
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async getAsset(organizationId, assetId) {
    const result = await this.pool.query(
      `SELECT id, organization_id AS "organizationId", storage_key AS "storageKey", mime_type AS "mimeType", status
       FROM assets WHERE organization_id = $1 AND id = $2`, [organizationId, assetId]
    );
    return result.rows[0] ?? null;
  }
  async completeMalwareScan({ job, clean, output }) {
    return this.transaction(async (client) => {
      if (clean) {
        await client.query(`UPDATE assets SET scanned_at = now(), status = 'queued', updated_at = now() WHERE organization_id = $1 AND id = $2`, [job.organizationId, job.assetId]);
        const asset = await this.getAssetWith(client, job.organizationId, job.assetId);
        if (asset.mimeType.startsWith("video/")) {
          await client.query(`INSERT INTO media_jobs (organization_id, asset_id, job_type) VALUES ($1, $2, 'video_transcode') ON CONFLICT (asset_id, job_type) DO NOTHING`, [job.organizationId, job.assetId]);
        } else {
          await client.query(`UPDATE assets SET status = 'ready', updated_at = now() WHERE organization_id = $1 AND id = $2`, [job.organizationId, job.assetId]);
          await client.query(`INSERT INTO media_jobs (organization_id, asset_id, job_type) VALUES ($1, $2, 'ai_enrich') ON CONFLICT (asset_id, job_type) DO NOTHING`, [job.organizationId, job.assetId]);
        }
      } else {
        await client.query(`UPDATE assets SET status = 'rejected', rejection_reason = $3, updated_at = now() WHERE organization_id = $1 AND id = $2`, [job.organizationId, job.assetId, "Malware scan detected unsafe content."]);
      }
      await this.finishJob(client, job.id);
      await this.audit(client, job, clean ? "asset.malware_scan_passed" : "asset.malware_detected", { output: String(output ?? "").slice(0, 1000) });
    });
  }
  async completeVideo({ job, metadata, renditions }) {
    return this.transaction(async (client) => {
      for (const rendition of renditions) {
        await client.query(
          `INSERT INTO asset_renditions (organization_id, asset_id, kind, storage_key, mime_type, size_bytes, width, height, duration_seconds)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (asset_id, kind) DO UPDATE SET storage_key = EXCLUDED.storage_key, mime_type = EXCLUDED.mime_type,
             size_bytes = EXCLUDED.size_bytes, width = EXCLUDED.width, height = EXCLUDED.height, duration_seconds = EXCLUDED.duration_seconds`,
          [job.organizationId, job.assetId, rendition.kind, rendition.storageKey, rendition.mimeType, rendition.sizeBytes, rendition.width, rendition.height, rendition.durationSeconds]
        );
      }
      await client.query(`UPDATE assets SET status = 'ready', technical_metadata = $3::jsonb, updated_at = now() WHERE organization_id = $1 AND id = $2`, [job.organizationId, job.assetId, JSON.stringify(metadata)]);
      await client.query(`INSERT INTO media_jobs (organization_id, asset_id, job_type) VALUES ($1, $2, 'ai_enrich') ON CONFLICT (asset_id, job_type) DO NOTHING`, [job.organizationId, job.assetId]);
      await this.finishJob(client, job.id);
      await this.audit(client, job, "asset.video_processed", { renditionKinds: renditions.map((item) => item.kind) });
    });
  }
  async failJob(job, error) {
    const delaySeconds = Math.min(900, 15 * (2 ** Math.max(0, job.attempts - 1)));
    await this.transaction(async (client) => {
      await client.query(
        `UPDATE media_jobs SET status = 'failed', last_error = $2, available_at = now() + ($3 * interval '1 second'), locked_at = NULL, worker_id = NULL WHERE id = $1`,
        [job.id, String(error?.message ?? error).slice(0, 2000), delaySeconds]
      );
      await client.query(`UPDATE assets SET status = $3, updated_at = now() WHERE organization_id = $1 AND id = $2`, [job.organizationId, job.assetId, job.attempts >= 5 ? "failed" : "queued"]);
      await this.audit(client, job, "asset.processing_failed", { attempt: job.attempts, retryScheduled: job.attempts < 5 });
    });
  }
  async transaction(work) {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async getAssetWith(client, organizationId, assetId) {
    const result = await client.query(`SELECT id, organization_id AS "organizationId", storage_key AS "storageKey", mime_type AS "mimeType" FROM assets WHERE organization_id = $1 AND id = $2`, [organizationId, assetId]);
    return result.rows[0];
  }
  async finishJob(client, id) { await client.query(`UPDATE media_jobs SET status = 'completed', completed_at = now(), locked_at = NULL, worker_id = NULL WHERE id = $1`, [id]); }
  async audit(client, job, action, metadata) {
    await client.query(`INSERT INTO audit_events (organization_id, action, metadata) VALUES ($1, $2, $3::jsonb)`, [job.organizationId, action, JSON.stringify({ assetId: job.assetId, jobId: job.id, ...metadata })]);
  }
}
