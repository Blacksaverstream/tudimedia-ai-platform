# Database Design

## Data model

The transactional database is the source of truth. Every tenant-scoped table includes `organization_id`; access queries must apply that boundary.

| Area | Core entities |
| --- | --- |
| Identity | organizations, users, memberships, roles, sessions |
| Assets | assets, asset_versions, files, renditions, metadata |
| AI | enrichment_jobs, enrichment_results, embeddings, model_runs |
| Workflow | collections, reviews, approvals, publishing_jobs |
| Governance | audit_events, retention_policies, consent_records |
| Integration | api_keys, webhooks, webhook_deliveries |

## Conventions

- Use UUID primary keys, UTC timestamps, and soft deletion where recovery is required.
- Store media binaries in object storage; retain only references, checksums, and technical metadata in the database.
- Use immutable audit events for security-relevant actions.
- Index common tenant, status, timestamp, and search-filter access paths.

## Example relationships

- An organization has many memberships and assets.
- An asset has many versions, files, enrichment jobs, and review records.
- Each enrichment result belongs to an asset version and identifies model, prompt version, input provenance, and cost.

## Data governance

Retention, deletion, export, and legal-hold rules must be configurable per organization and enforced in background jobs. See [SECURITY.md](SECURITY.md).

## Authentication schema

The first migration for the API service is [services/api/db/migrations/001_auth.sql](../services/api/db/migrations/001_auth.sql). It creates `users`, `organizations`, `organization_memberships`, `auth_sessions`, and `audit_events`, including organization scoping and indexes for active sessions and audit lookup.

The upload migration, [services/api/db/migrations/002_assets.sql](../services/api/db/migrations/002_assets.sql), adds tenant-scoped `assets` and idempotent `media_jobs` records. Media bytes remain in object storage; the database retains object keys, declared metadata, processing state, and governance history.

The video-processing migration, [services/api/db/migrations/003_video_processing.sql](../services/api/db/migrations/003_video_processing.sql), adds technical metadata, scan timestamps, worker leases, and `asset_renditions`. Jobs are claimed with row locking and remain retryable without creating duplicate asset/job pairs.

The AI migration, [services/api/db/migrations/004_ai_enrichment.sql](../services/api/db/migrations/004_ai_enrichment.sql), adds auditable `model_runs`, versioned `enrichment_results`, and human `review_tasks`. It records usage, latency, cost, confidence, provider/model identity, prompt version, and failure details without placing access tokens or signed URLs in persistent storage.

The search migration, [services/api/db/migrations/005_search.sql](../services/api/db/migrations/005_search.sql), creates one weighted `asset_search_documents` row per asset. PostgreSQL GIN indexes support full-text and tag lookup. Asset-name triggers and AI-completion updates keep the index synchronized without making object storage part of the query path.
