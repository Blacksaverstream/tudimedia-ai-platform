export class PostgresSearchStore {
  constructor(pool) { this.pool = pool; }
  async search({ organizationId, query, mediaType, tags, limit, offset }) {
    const result = await this.pool.query(
      `WITH search_query AS (
         SELECT CASE WHEN $2::text = '' THEN NULL ELSE websearch_to_tsquery('simple', $2) END AS value
       )
       SELECT a.id, a.name, a.mime_type AS "mimeType", a.status, a.created_at AS "createdAt",
         d.tags, d.language,
         CASE WHEN q.value IS NULL THEN 0 ELSE ts_rank_cd(d.search_vector, q.value) END::float8 AS rank,
         CASE WHEN q.value IS NULL THEN '' ELSE ts_headline('simple', d.summary || ' ' || left(d.transcript, 2000), q.value, 'MaxWords=30, MinWords=10') END AS headline
       FROM asset_search_documents d
       JOIN assets a ON a.id = d.asset_id
       CROSS JOIN search_query q
       WHERE d.organization_id = $1 AND a.status = 'ready'
         AND (q.value IS NULL OR d.search_vector @@ q.value)
         AND ($3::text IS NULL OR a.mime_type LIKE ($3 || '/%'))
         AND (cardinality($4::text[]) = 0 OR d.tags @> $4::text[])
       ORDER BY rank DESC, a.created_at DESC, a.id
       LIMIT $5 OFFSET $6`,
      [organizationId, query, mediaType, tags, limit, offset]
    );
    return result.rows;
  }
}
