export class PostgresAuthStore {
  constructor(queryable) {
    this.queryable = queryable;
  }

  async transaction(work) {
    if (typeof this.queryable.connect !== "function") return work(this);
    const client = await this.queryable.connect();
    try {
      await client.query("BEGIN");
      const result = await work(new PostgresAuthStore(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createUser({ email, passwordHash }) {
    return this.oneOrNull(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email, password_hash AS "passwordHash", created_at AS "createdAt"`,
      [email, passwordHash]
    );
  }

  async getUserByEmail(email) {
    return this.oneOrNull(`SELECT id, email, password_hash AS "passwordHash", created_at AS "createdAt" FROM users WHERE email = $1`, [email]);
  }

  async getUser(id) {
    return this.oneOrNull(`SELECT id, email, password_hash AS "passwordHash", created_at AS "createdAt" FROM users WHERE id = $1`, [id]);
  }

  async createOrganization({ name, slug }) {
    return this.oneOrNull(
      `INSERT INTO organizations (name, slug)
       VALUES ($1, $2)
       ON CONFLICT (slug) DO NOTHING
       RETURNING id, name, slug, created_at AS "createdAt"`,
      [name, slug]
    );
  }

  async getOrganization(id) {
    return this.oneOrNull(`SELECT id, name, slug, created_at AS "createdAt" FROM organizations WHERE id = $1`, [id]);
  }

  async createMembership({ organizationId, userId, role }) {
    return this.oneOrNull(
      `INSERT INTO organization_memberships (organization_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, user_id) DO NOTHING
       RETURNING id, organization_id AS "organizationId", user_id AS "userId", role, created_at AS "createdAt"`,
      [organizationId, userId, role]
    );
  }

  async getMembership(organizationId, userId) {
    return this.oneOrNull(
      `SELECT id, organization_id AS "organizationId", user_id AS "userId", role, created_at AS "createdAt"
       FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, userId]
    );
  }

  async createSession({ rawRefreshToken: _rawRefreshToken, ...session }) {
    return this.oneOrNull(
      `INSERT INTO auth_sessions (id, organization_id, user_id, role, refresh_hash, expires_at, last_used_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, organization_id AS "organizationId", user_id AS "userId", role, refresh_hash AS "refreshHash",
         expires_at AS "expiresAt", revoked_at AS "revokedAt", last_used_at AS "lastUsedAt", created_at AS "createdAt"`,
      [session.id, session.organizationId, session.userId, session.role, session.refreshHash, session.expiresAt, session.lastUsedAt, session.createdAt]
    );
  }

  async getSession(id) {
    return this.oneOrNull(
      `SELECT id, organization_id AS "organizationId", user_id AS "userId", role, refresh_hash AS "refreshHash",
        expires_at AS "expiresAt", revoked_at AS "revokedAt", last_used_at AS "lastUsedAt", created_at AS "createdAt"
       FROM auth_sessions WHERE id = $1`,
      [id]
    );
  }

  async rotateSession({ id, expectedRefreshHash, nextRefreshHash, now, expiresAt }) {
    return this.oneOrNull(
      `UPDATE auth_sessions
       SET refresh_hash = $3, expires_at = $4, last_used_at = $5
       WHERE id = $1 AND refresh_hash = $2 AND revoked_at IS NULL AND expires_at > $5
       RETURNING id, organization_id AS "organizationId", user_id AS "userId", role, refresh_hash AS "refreshHash",
         expires_at AS "expiresAt", revoked_at AS "revokedAt", last_used_at AS "lastUsedAt", created_at AS "createdAt"`,
      [id, expectedRefreshHash, nextRefreshHash, expiresAt, now]
    );
  }

  async revokeSession(id, now) {
    const result = await this.queryable.query(`UPDATE auth_sessions SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL`, [id, now]);
    return result.rowCount === 1;
  }

  async appendAudit({ organizationId = null, actorUserId = null, targetUserId = null, sessionId = null, action, metadata = {} }) {
    await this.queryable.query(
      `INSERT INTO audit_events (organization_id, actor_user_id, target_user_id, session_id, action, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [organizationId, actorUserId, targetUserId, sessionId, action, JSON.stringify(metadata)]
    );
  }

  async oneOrNull(sql, values) {
    const result = await this.queryable.query(sql, values);
    return result.rows[0] ?? null;
  }
}
