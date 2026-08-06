export class PostgresAiStore {
  constructor(pool) { this.pool = pool; }
  async claimNext(workerId) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(
        `SELECT id FROM media_jobs WHERE job_type = 'ai_enrich' AND status IN ('queued','failed') AND available_at <= now() AND attempts < 5
         ORDER BY available_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1`
      );
      if (!found.rows[0]) { await client.query("COMMIT"); return null; }
      const claimed = await client.query(
        `UPDATE media_jobs SET status = 'processing', attempts = attempts + 1, locked_at = now(), started_at = now(), worker_id = $2
         WHERE id = $1 RETURNING id, organization_id AS "organizationId", asset_id AS "assetId", job_type AS "jobType", attempts`,
        [found.rows[0].id, workerId]
      );
      await client.query("COMMIT");
      return claimed.rows[0];
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async getAsset(organizationId, assetId) {
    const result = await this.pool.query(
      `SELECT a.id, a.organization_id AS "organizationId", COALESCE(r.storage_key, a.storage_key) AS "storageKey",
        COALESCE(r.mime_type, a.mime_type) AS "mimeType"
       FROM assets a LEFT JOIN asset_renditions r ON r.asset_id = a.id AND r.kind = 'web_mp4'
       WHERE a.organization_id = $1 AND a.id = $2`, [organizationId, assetId]
    );
    return result.rows[0] ?? null;
  }
  async startRun({ job, provider, model, promptVersion }) {
    const result = await this.pool.query(
      `INSERT INTO model_runs (organization_id, asset_id, provider, model, prompt_version) VALUES ($1,$2,$3,$4,$5)
       RETURNING id, organization_id AS "organizationId", asset_id AS "assetId", provider, model, prompt_version AS "promptVersion", started_at AS "startedAt"`,
      [job.organizationId, job.assetId, provider, model, promptVersion]
    );
    return result.rows[0];
  }
  async completeRun({ job, run, results, usage, latencyMs }) {
    return this.transaction(async (client) => {
      for (const result of results) {
        await client.query(`UPDATE enrichment_results SET is_current = false WHERE asset_id = $1 AND kind = $2 AND is_current`, [job.assetId, result.kind]);
        const inserted = await client.query(
          `INSERT INTO enrichment_results (organization_id, asset_id, model_run_id, kind, content, confidence, needs_review)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING id`,
          [job.organizationId, job.assetId, run.id, result.kind, JSON.stringify(result.content), result.confidence, result.needsReview]
        );
        if (result.needsReview) {
          const reason = result.kind === "moderation" ? "Moderation policy review required." : "AI confidence is below the review threshold.";
          await client.query(`INSERT INTO review_tasks (organization_id, asset_id, enrichment_result_id, reason) VALUES ($1,$2,$3,$4)`, [job.organizationId, job.assetId, inserted.rows[0].id, reason]);
        }
      }
      await client.query(
        `UPDATE model_runs SET status = 'completed', input_units = $2, output_units = $3, cost_micros = $4, latency_ms = $5, completed_at = now() WHERE id = $1`,
        [run.id, usage.inputUnits, usage.outputUnits, usage.costMicros, latencyMs]
      );
      await client.query(`UPDATE media_jobs SET status = 'completed', completed_at = now(), locked_at = NULL, worker_id = NULL WHERE id = $1`, [job.id]);
      await this.audit(client, job, "asset.ai_enrichment_completed", { modelRunId: run.id, provider: run.provider, model: run.model, reviewCount: results.filter((item) => item.needsReview).length, costMicros: usage.costMicros });
    });
  }
  async failRun({ job, run, error }) {
    const message = String(error?.message ?? error).slice(0, 2000);
    const delaySeconds = Math.min(900, 15 * (2 ** Math.max(0, job.attempts - 1)));
    return this.transaction(async (client) => {
      await client.query(`UPDATE model_runs SET status = 'failed', error_message = $2, completed_at = now() WHERE id = $1`, [run.id, message]);
      await client.query(`UPDATE media_jobs SET status = 'failed', last_error = $2, available_at = now() + ($3 * interval '1 second'), locked_at = NULL, worker_id = NULL WHERE id = $1`, [job.id, message, delaySeconds]);
      await this.audit(client, job, "asset.ai_enrichment_failed", { modelRunId: run.id, attempt: job.attempts, retryScheduled: job.attempts < 5 });
    });
  }
  async transaction(work) {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async audit(client, job, action, metadata) {
    await client.query(`INSERT INTO audit_events (organization_id, action, metadata) VALUES ($1,$2,$3::jsonb)`, [job.organizationId, action, JSON.stringify({ assetId: job.assetId, jobId: job.id, ...metadata })]);
  }
}
