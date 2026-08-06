import { AuthError } from "../auth/errors.js";
import { requirePermission } from "../auth/roles.js";

const encodeCursor = (offset) => Buffer.from(JSON.stringify({ offset })).toString("base64url");
const decodeCursor = (cursor) => {
  if (!cursor) return 0;
  try {
    const offset = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")).offset;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10_000) throw new Error();
    return offset;
  } catch { throw new AuthError("SEARCH_CURSOR_INVALID", "The search cursor is invalid.", 422); }
};

export class SearchService {
  constructor({ store }) { this.store = store; }
  async search({ actor, query = "", filters = {}, cursor, limit = 25 }) {
    requirePermission(actor.role, "assets:read");
    const cleanQuery = String(query).trim().slice(0, 500);
    const numericLimit = Number(limit);
    if (!Number.isInteger(numericLimit) || numericLimit < 1 || numericLimit > 100) throw new AuthError("SEARCH_LIMIT_INVALID", "Search limit must be between 1 and 100.", 422);
    const mediaType = filters.mediaType == null ? null : String(filters.mediaType);
    if (mediaType && !["video", "audio", "image"].includes(mediaType)) throw new AuthError("SEARCH_FILTER_INVALID", "Unsupported media type filter.", 422);
    const tags = Array.isArray(filters.tags) ? [...new Set(filters.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))].slice(0, 20) : [];
    const offset = decodeCursor(cursor);
    const items = await this.store.search({ organizationId: actor.organizationId, query: cleanQuery, mediaType, tags, limit: numericLimit, offset });
    return { items, nextCursor: items.length === numericLimit ? encodeCursor(offset + numericLimit) : null };
  }
}
