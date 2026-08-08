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

`GET /dashboard` returns tenant asset, readiness, processing, and storage totals. `GET /assets` uses opaque cursor pagination and accepts `limit`, `status`, and `mediaType`. `GET/POST /collections` lists or creates tenant collections; `POST /collections/{id}/assets` adds an authorized tenant asset idempotently.
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
| `GET /organizations/members` | List tenant members; all organization roles. |
| `PATCH /organizations/members/{userId}` | Change a non-owner member role; owner/admin only. |
| `DELETE /organizations/members/{userId}` | Remove a non-owner member and revoke their tenant sessions. |
| `PATCH /organizations/current` | Rename the current organization; owner only. |
| `PATCH /users/me` | Update the authenticated user's display name. |

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

## Commercial and operations APIs

- `GET/PUT /billing/subscription` returns or updates the tenant plan and entitlements; updates require the owner billing permission.
- `POST /billing/usage` records a positive metered quantity with a tenant-scoped idempotency key.
- `GET/POST /notifications` lists the current user's notifications or creates an operational notification; `PATCH /notifications/{id}/read` marks one read.
- `POST /assets/{id}/translations` queues a source-linked translation with distinct BCP 47 source and target languages.
- `POST /renders` queues a bounded MP4/WebM render request. Both translation and render requests require an idempotency key.
- `GET /admin/operations` returns tenant subscription and job state for owners/admins; `POST /operations/{id}/cancel` cancels queued or failed jobs.

Billing providers call `POST /billing/webhooks` with `x-billing-signature: t=<unix-seconds>,v1=<hex-hmac>`. The HMAC-SHA256 input is `<timestamp>.<raw-json-body>` and events are persisted idempotently before subscription state changes. Translation/render and notification workers claim rows with `FOR UPDATE SKIP LOCKED`, retry with bounded backoff, and use job/delivery IDs as provider idempotency keys.

Operational governance endpoints expose `GET /operations/{id}` for tenant-scoped job timelines and signed output metadata, `POST /operations/{id}/retry` for owner/admin recovery of failed or dead-lettered work, and `POST /admin/provider-reconciliations` for drift records. Users manage delivery routing through `GET|PUT /notification-preferences`; configured preferences replace the default in-app delivery.
