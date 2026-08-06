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

## Observability

Capture structured logs, metrics, traces, audit events, queue health, AI job quality, and cost indicators. Alerts should be actionable and linked to an owning team and runbook.
