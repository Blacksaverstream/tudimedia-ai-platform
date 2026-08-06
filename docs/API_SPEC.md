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

## Asset upload endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /assets/upload-intents` | Create a tenant-scoped asset and a 15-minute signed object-storage upload URL. |
| `POST /assets/{id}/upload-complete` | Verify the uploaded object and enqueue malware scanning. |
| `GET /assets/{id}` | Return the tenant-authorized asset and processing status. |
| `GET /assets/{id}/enrichments` | Return current tenant-authorized AI results with model and prompt provenance. |

Upload intents accept `name`, `filename`, `mimeType`, `sizeBytes`, and an optional SHA-256 checksum. The client uploads directly to object storage using the returned `PUT` URL, then calls the completion endpoint. The API verifies object size, type, and checksum when supplied before queuing processing.

## Search

`POST /search` accepts `query`, optional `filters.mediaType`, optional `filters.tags`, `cursor`, and `limit` (1–100). Results are restricted to the authenticated organization and assets in `ready` state. Names receive the highest text weight, summaries and tags the next weight, and transcripts the supporting weight. Responses contain ranked items and an opaque `nextCursor`.

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
