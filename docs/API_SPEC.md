# API Specification

## API conventions

- Base path: `/api/v1`
- Authentication: bearer token or scoped API key.
- Format: JSON; uploads use signed object-storage URLs.
- Pagination: cursor-based (`cursor`, `limit`).
- Errors: `{ "error": { "code", "message", "request_id" } }`.

## Primary resources

| Resource | Example endpoints |
| --- | --- |
| Assets | `POST /assets`, `GET /assets`, `GET /assets/{id}`, `DELETE /assets/{id}` |
| Uploads | `POST /uploads`, `POST /uploads/{id}/complete` |
| Search | `POST /search` |
| Collections | `GET/POST /collections`, `GET/PATCH /collections/{id}` |
| Reviews | `POST /assets/{id}/reviews`, `POST /reviews/{id}/approve` |
| Webhooks | `GET/POST /webhooks`, `DELETE /webhooks/{id}` |

## Authentication endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /auth/sign-up` | Create a user, their organization, an owner membership, and a session. |
| `POST /auth/sign-in` | Authenticate an existing user for a supplied organization. |
| `POST /auth/refresh` | Rotate the refresh session and return a fresh access token. |
| `POST /auth/sign-out` | Revoke the current refresh session. |
| `GET /auth/me` | Return the authenticated user context. |
| `POST /organizations/members` | Add an existing user as an organization member; owner/admin only. |

Access tokens are short-lived signed bearer tokens. Refresh tokens are opaque, stored only in an `HttpOnly`, `SameSite=Strict` cookie, and rotated on every use.

## Example: create an asset

```http
POST /api/v1/assets
Authorization: Bearer <token>
Content-Type: application/json

{ "name": "Campaign interview", "media_type": "video" }
```

Responses must enforce tenant authorization, include a request ID, and return an operation status for asynchronous processing.

## Events

Webhook event names use past tense, e.g. `asset.processed`, `asset.enrichment.completed`, and `review.approved`. Deliveries are signed, retried with backoff, and idempotent for consumers.
