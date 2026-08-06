# Deployment and Operations

## Environments

- **Development:** isolated local and shared development environments.
- **Staging:** production-like integration and release validation.
- **Production:** monitored, access-controlled service for customers.

## Delivery pipeline

1. Validate formatting, tests, dependency security, and infrastructure changes.
2. Build immutable, versioned artifacts.
3. Deploy to staging and run smoke/integration checks.
4. Approve and progressively release to production.
5. Monitor health and roll back safely if success criteria are not met.

## Operational requirements

- Infrastructure is defined and reviewed as code.
- Database migrations are backward-compatible and recoverable.
- Deployments support health checks, canary/progressive rollout, and rollback.
- Backups, disaster recovery objectives, alerts, dashboards, and runbooks are tested.

## Authentication database deployment

Set `DATABASE_URL`, `AUTH_TOKEN_SECRET`, and `AUTH_SESSION_PEPPER` as distinct managed secrets; both authentication secrets must be at least 32 characters. Deploy `services/api`, then run `npm run migrate` in `services/api` against the production database before serving traffic. The API uses PostgreSQL only when `NODE_ENV=production`; its in-memory store is reserved for local development and automated tests.

For uploads, configure `S3_BUCKET` and `S3_REGION`. `S3_ENDPOINT` and `S3_FORCE_PATH_STYLE=true` support compatible providers when required. Keep the bucket private, block public access, enable encryption and lifecycle policies, and grant the API identity only the object operations required for signed upload and verification. `MAX_UPLOAD_BYTES` optionally overrides the default 5 GiB limit.

## Media worker

Run `pnpm worker:media` from `services/api` as a separate service after migrations complete. Its image/host must provide current supported FFmpeg/FFprobe and ClamAV (`clamdscan`) binaries plus updated virus definitions. Override their executable locations with `FFMPEG_PATH`, `FFPROBE_PATH`, and `CLAMD_SCAN_PATH`. The worker requires the same database and private object-storage configuration as the API. Scale workers horizontally; database row locks prevent duplicate claims.

## AI worker

Run `pnpm worker:ai` as an independently scalable service. Configure `AI_PROVIDER_ENDPOINT`, `AI_PROVIDER_API_KEY`, `AI_PROVIDER_NAME`, `AI_MODEL`, and `AI_PROMPT_VERSION` through managed secrets/configuration. `AI_REVIEW_THRESHOLD` defaults to `0.75`. The provider endpoint must accept the documented `/v1/media/enrich` contract, must not retain source media unless the tenant policy allows it, and must be restricted to approved regions/providers.

## Observability

Capture structured logs, metrics, traces, audit events, queue health, AI job quality, and cost indicators. Alerts should be actionable and linked to an owning team and runbook.
