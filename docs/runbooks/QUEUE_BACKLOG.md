# Queue backlog runbook

1. Confirm backlog age, arrival rate, completion rate, failure rate, and affected job type.
2. Check database saturation, row-lock waits, object-storage latency, malware scanner health, and AI provider quotas.
3. Pause nonessential AI enrichment before media safety processing.
4. Scale the affected worker within database, provider, and cost limits. Do not scale when the dependency is already saturated.
5. Quarantine poison jobs after the configured retry limit; preserve input and audit evidence.
6. When service recovers, drain gradually and confirm oldest-job age returns below the SLO.
7. Record timeline, user impact, contributing limits, and a prevention action.
