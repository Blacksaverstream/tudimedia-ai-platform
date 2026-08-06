# TudiMedia AI Platform — Agent Guide

## Project context

TudiMedia is an enterprise AI-powered media platform, designed and built from system architecture through production deployment. The repository is organized as a modular platform with applications, services, shared packages, infrastructure, tests, scripts, and product documentation.

## Repository rules

- Treat every file under `sources/` as read-only reference material. Do not edit, rename, move, or delete synced files in that directory.
- Keep implementation code in its owning area: `apps/`, `services/`, `packages/`, or `infrastructure/`.
- Keep platform decisions and contracts current in `docs/`. Update the relevant document whenever a change affects the product, system architecture, database, API, security, deployment, AI design, or delivery plan.
- Do not commit credentials, private keys, production data, access tokens, or `.env` files.
- Make focused changes. Avoid unrelated refactors and preserve existing user changes.

## Git workflow

- `main` represents production-ready releases.
- `develop` is the shared integration branch.
- Develop capabilities on their assigned branch: `feature/auth`, `feature/upload`, `feature/video`, `feature/ai`, or `feature/search`.
- Use `release/*` branches to stabilize scheduled releases.
- Open pull requests into `develop` from feature branches; merge approved release branches into `main` and back into `develop`.
- Keep commits small and descriptive. Do not force-push shared branches.

See [docs/GIT_BRANCH_STRATEGY.md](docs/GIT_BRANCH_STRATEGY.md) and [docs/SPRINTS.md](docs/SPRINTS.md) for the full delivery process.

## Engineering standards

- Enforce tenant isolation and server-side authorization for every protected operation.
- Use asynchronous, idempotent jobs for long-running media and AI processing.
- Keep media binaries in object storage, not in the transactional database.
- Record audit events for security-sensitive and administrative actions.
- Treat all external content and AI outputs as untrusted; preserve provenance and provide human-review paths.
- Add or update automated tests, observability, and rollback considerations in proportion to the change’s risk.

## Before handoff

- Run relevant validation and tests.
- Confirm documentation and API contracts are accurate.
- State what changed, how it was verified, and any follow-up work or known limitations.
