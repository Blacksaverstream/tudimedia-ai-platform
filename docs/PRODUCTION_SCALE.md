# Production Scale Foundation

## Capacity model

The initial production target is one million registered users, 100,000 monthly active users, 20,000 daily active users, and 5,000 concurrent interactive sessions at peak. Capacity tests must model at least 2x forecast peak. These are planning assumptions, not claims of measured capacity; update them from observed product usage.

| Workload | Initial peak target | Scaling control |
| --- | ---: | --- |
| API requests | 5,000 requests/second | Stateless API HPA; CDN/cache where safe |
| Upload starts | 500/second | Direct multipart object-storage uploads |
| Search | 1,000 queries/second | PostgreSQL replicas initially; dedicated search when thresholds trigger |
| Media jobs | 100 starts/second | Independently scaled workers and queue-depth control |
| AI jobs | 50 starts/second | Tenant quotas, provider limits, cost budgets, and back-pressure |

## Reliability objectives

- API availability: 99.95% monthly, excluding announced maintenance.
- Auth and metadata read latency: p95 below 250 ms and p99 below 750 ms at the edge.
- Upload-intent latency: p95 below 500 ms; media bytes never proxy through the API.
- Recovery point objective: 15 minutes for transactional data; object storage uses versioning.
- Recovery time objective: 60 minutes for a regional service restoration.

Error-budget consumption gates releases. Alerts page only for user-visible SLO threats, data loss risk, security events, or sustained queue starvation.

## Scaling stages

1. Use multi-AZ PostgreSQL with connection pooling, private object storage plus CDN, and stateless API replicas.
2. Add read replicas when sustained read CPU or replica-safe query load exceeds 60% of primary capacity.
3. Partition high-growth audit, job, and model-run tables by time; archive according to tenant policy.
4. Move search to a dedicated OpenSearch/vector tier when index size, ranking needs, or write amplification exceed PostgreSQL budgets.
5. Replace database job polling with a managed event stream when queue lock contention or delivery volume breaches tested thresholds. Preserve idempotency keys and the database outbox boundary.

## Release and validation gates

Every production change requires unit tests, database migration validation, container build, vulnerability scanning, staging smoke tests, and a rollback plan. Run workload tests from an isolated environment; never load-test production without an approved change window. Record saturation points for API CPU, database connections/IOPS, worker throughput, provider quotas, and object-store request rates.

## Disaster recovery

Use multi-AZ services in the primary region, encrypted automated PostgreSQL backups with point-in-time recovery, cross-region object replication for protected tenants, and infrastructure state replication. Quarterly exercises restore the database into an isolated environment, validate object manifests, rotate compromised secrets, and rehearse DNS/traffic failover. A recovery is complete only after tenant-isolation and audit-integrity checks pass.
