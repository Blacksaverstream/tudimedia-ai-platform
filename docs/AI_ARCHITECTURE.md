# AI Architecture

## Purpose

AI services enrich media and improve discovery while retaining human control, tenant isolation, and measurable quality.

## Capabilities

- Speech-to-text, language detection, translation, and summarization.
- Image/video tagging, OCR, scene detection, and accessibility descriptions.
- Policy-based content moderation.
- Text and multimodal embeddings for semantic retrieval.

## Processing design

1. A worker receives an asset-version processing event.
2. It selects policy-approved models based on media type, tenant settings, cost limits, and region.
3. It creates an auditable model run and submits a minimized input.
4. It validates, stores, and indexes outputs with provenance and confidence metadata.
5. It routes uncertain or policy-sensitive outputs to review workflows.

## Governance and evaluation

- Maintain model, prompt, and evaluation-set versions.
- Measure accuracy, latency, cost, safety outcomes, and user corrections.
- Enable tenant-level feature controls and retention policies.
- Support fallback providers and graceful degradation when AI is unavailable.

## Provider gateway contract

The AI worker calls a configured media-enrichment gateway rather than embedding a vendor-specific SDK in domain logic. The gateway receives a short-lived signed source URL and returns transcript, summary, tags, moderation, confidence, and usage fields. `AI_PROVIDER_NAME`, `AI_MODEL`, and `AI_PROMPT_VERSION` identify every model run. Responses are schema-validated and bounded before persistence.

Each completed run creates versioned results with provider/model/prompt provenance. Only one result per asset and enrichment kind is current; earlier results remain available for audit and evaluation. Flagged moderation outputs and results below `AI_REVIEW_THRESHOLD` create pending human-review tasks.

## Retrieval safety

Search retrieval is always filtered by the caller's tenant and permissions before results reach an AI model or user interface. Generated responses must link back to source assets and avoid claiming certainty beyond their evidence.
