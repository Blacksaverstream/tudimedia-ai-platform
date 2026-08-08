# Provider reconciliation

Reconciliation compares TudiMedia's expected billing or processing state with the provider's observed state. Store every result through the administrative reconciliation API, including matched results, so operators can prove coverage.

For `drifted`, `missing`, or `error` results, identify the owning organization and external resource, preserve both state snapshots, and correct the authoritative system only after confirming webhook and retry histories. Retry dead-lettered jobs through the operations retry API; never update job rows manually. Escalate repeated drift, authentication failures, or checksum mismatches and rotate affected provider credentials.
