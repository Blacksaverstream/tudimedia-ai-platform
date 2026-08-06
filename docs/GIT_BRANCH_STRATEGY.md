# Git Branch Strategy

## Goals

Keep releases predictable, protect production, and enable small, reviewable changes across applications, services, packages, and infrastructure.

## Long-lived branches

| Branch | Purpose | Protection |
| --- | --- | --- |
| `main` | Production-ready source of truth and release history. | Require pull-request review, passing checks, linear history, and restricted direct pushes. |
| `develop` | Shared integration branch for approved development work. | Require pull-request review and passing checks. |

Changes flow from feature branches into `develop`. A tested release branch is then merged into `main` and back into `develop`.

## Short-lived branches

Create feature branches from `develop`:

| Branch | Responsibility |
| --- | --- | --- |
| `feature/auth` | Authentication, authorization, users, roles, and tenant access. |
| `feature/upload` | Secure ingest, storage, validation, and processing status. |
| `feature/video` | Transcoding, renditions, playback, and media metadata extraction. |
| `feature/ai` | Enrichment jobs, model integration, moderation, and evaluation. |
| `feature/search` | Metadata, semantic retrieval, indexing, and search experience. |

Keep each branch focused. Create focused short-lived branches from the relevant feature branch for isolated fixes or maintenance work, and merge them back through pull requests. Rebase or merge the target branch before requesting review, according to the repository’s chosen history policy.

## Pull-request policy

- Link the pull request to its issue, requirement, or incident.
- Describe user impact, technical approach, tests, migration needs, and rollout/rollback plan.
- Require at least one approved review; require code-owner review for security, infrastructure, database, and AI policy changes.
- All required checks must pass: linting, unit tests, integration tests where relevant, dependency/security scanning, and build validation.
- Squash merge by default to preserve a clear `main` history; use conventional commit-style titles when practical.

## Release process

1. Create `release/vX.Y.Z` from `develop` when the planned scope is complete.
2. Permit only release-blocking fixes and release documentation on the release branch.
3. Build an immutable artifact, deploy to staging, and complete release checks.
4. Progressively deploy the same artifact to production, using a canary where appropriate.
5. Merge the approved release branch into `main`, tag it (for example, `v1.4.0`), and merge it back into `develop`.
6. Publish release notes, operational changes, and any migration guidance.

Use the `release/*` naming pattern for every scheduled stabilization and production-release branch.

## Hotfix process

1. Create a short-lived hotfix branch from `main`.
2. Apply the smallest safe correction, test it, and obtain expedited review.
3. Release, tag, and document the incident or customer impact.
4. Ensure the fix is present in the normal integration line before closing the branch.

## Branch protections and ownership

Protect `main`, `develop`, all `feature/*` branches, and `release/*`. Require signed commits if the organization’s controls call for them. Define code owners for `apps/`, `services/`, `packages/`, `infrastructure/`, and `docs/`; changes to `infrastructure/`, `docs/SECURITY.md`, and AI guardrails require designated owner review.
