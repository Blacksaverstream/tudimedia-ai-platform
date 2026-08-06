# Security Architecture

## Security objectives

Protect tenant data, enforce least privilege, preserve auditability, and maintain a resilient service.

## Controls

- Strong authentication with MFA for privileged users and short-lived sessions.
- Role- and organization-based authorization enforced server-side.
- Encryption in transit and at rest; secrets in managed secret storage.
- Signed upload/download URLs with restricted scope and expiry.
- Malware scanning and content validation before assets become available.
- Immutable audit trails for access, administration, exports, and workflow approvals.
- Rate limits, input validation, dependency scanning, and security monitoring.

## AI safeguards

Treat media and retrieved text as untrusted input. Do not allow prompt content to override system policies, expose other tenants' data, or trigger privileged actions. Apply provider allowlists, data-minimization rules, and output review appropriate to risk.

## Authentication decision

The initial platform implementation uses a self-hosted credential provider backed by PostgreSQL: scrypt password hashes, short-lived signed access tokens, rotated opaque refresh sessions, and organization-scoped role-based access control. This keeps the platform portable while allowing a future enterprise OIDC/SAML provider to be added behind the same authentication boundary. Token and session secrets must be distinct managed secrets of at least 32 characters.

## Incident readiness

Maintain incident runbooks, on-call ownership, log retention, evidence preservation, breach-assessment procedures, and regular access reviews. Test backup restoration and response processes on a planned cadence.
