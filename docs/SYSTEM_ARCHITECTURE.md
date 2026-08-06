# System Architecture

## Overview

The platform uses a modular, API-first architecture: a web client communicates with backend services; asynchronous workers process media and AI jobs; object storage retains source and derived assets.

## Core components

- **Web application:** workspace UI, search, review, and administration.
- **API service:** authentication, authorization, domain operations, and public API.
- **Database:** transactional system of record for tenants, assets, workflows, and audit events.
- **Object storage/CDN:** original uploads, renditions, thumbnails, and downloadable media.
- **Queue and workers:** transcoding, extraction, AI enrichment, notifications, and retries.
- **Search index:** full-text and vector retrieval over metadata and AI-generated content.
- **Observability:** centralized logs, metrics, traces, alerting, and audit analysis.

## Key flow

1. A user uploads an asset through the web app or API.
2. The API records the asset and queues processing work.
3. Workers validate, scan, transcode, extract metadata, and invoke approved AI providers.
4. Results are stored in the database and indexed for search.
5. The client receives status updates and makes approved assets available for use or publishing.

## Media processing pipeline

The media worker claims database-backed jobs using `FOR UPDATE SKIP LOCKED`. Every upload is downloaded into an isolated temporary directory and scanned with ClamAV before further processing. Clean videos are probed and transcoded with FFmpeg into a web MP4 plus a JPEG thumbnail; derived media returns to private object storage and is recorded as tenant-scoped renditions. Failed jobs use bounded exponential backoff and idempotent object keys.

After media processing, a separate AI worker claims `ai_enrich` jobs. It passes a short-lived signed rendition URL to an approved provider gateway, validates returned transcript/summary/tag/moderation payloads, and persists model runs plus versioned results. Provider failures retry independently and never make the core asset unavailable.

Search uses a denormalized PostgreSQL document containing asset name, AI summary, tags, and transcript. Weighted `tsvector` ranking and GIN indexes provide the initial discovery layer. Organization and ready-state predicates are applied in the database query before any result reaches the API.

## Architectural principles

- Tenant isolation is enforced at every access boundary.
- Long-running work is asynchronous and idempotent.
- Services expose versioned contracts and emit auditable domain events.
- Sensitive data is minimized, encrypted, and never placed in logs or prompts without authorization.

See [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md), [DATABASE.md](DATABASE.md), and [DEPLOYMENT.md](DEPLOYMENT.md).
