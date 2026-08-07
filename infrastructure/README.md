# Infrastructure

Infrastructure is organized into local Docker Compose, Kubernetes base manifests, Terraform modules, and observability configuration. Do not commit secrets; Kubernetes expects an externally managed `tudimedia-secrets` Secret and Terraform uses remote encrypted state.

- `docker/compose.yml`: local PostgreSQL, MinIO, API, migration, and worker topology.
- `kubernetes/base`: secure API and worker workloads, service, probes, HPA, and disruption budget.
- `terraform`: versioned cloud foundations. The first module provisions protected media storage; networking, databases, Kubernetes, CDN, queues, and secret management are added per environment after provider and region decisions are approved.
- `observability`: OpenTelemetry collection pipeline conventions.

See `docs/PRODUCTION_SCALE.md` for capacity assumptions, SLOs, scaling thresholds, and disaster recovery requirements.
