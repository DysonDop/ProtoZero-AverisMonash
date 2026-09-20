# Backlog — agreed additions

v1, 19 Sep 2026. Four items carried over from the team's independent architecture
review. Everything else in that review is either already implemented or was
rejected on measured grounds (see `docs/dataset_facts.md` §10 for why unit
conversion, suffix expansion and fuzzy label matching stay out).

## 1. Circuit breaker → deterministic-only mode

After repeated failures from a cloud service, the pipeline stops calling it and
continues on the deterministic path alone, saying so visibly rather than
degrading quietly. This belongs in the service wrapper, not in each call site:
a small failure counter per service, a threshold in `pipeline/config.py`, and a
flag that surfaces on the case and in the UI banner as "model unavailable —
deterministic extraction only".

The reason this is worth building beyond robustness points is that it is already
true. The system scored a perfect run with zero cloud calls, so the fallback path
is not a theoretical safety net — it is the primary path, and the cloud services
are the additions. The circuit breaker just makes that visible when it matters.

In the demo, pull the network mid-run. The system should keep processing, mark
the affected cases, and carry on. That is a stronger argument for reliability
than any slide about error handling.

## 2. Trap cards for the demo

Five prepared cases, each a real email from the corpus rather than a contrived
one, shown in this order: a misleading subject that classifies correctly on the
verb rather than the noun; a comparison request whose attachments were dropped
(`email_506`); a `_BL` attachment that is actually a Certificate of Origin
(`email_503`); a near-identical party name that is a genuine entity swap
(`email_300`, APRIL Far East against APRIL Fine Paper Trading); and an
image-only scan (`email_513`).

Judges remember cases, not architecture diagrams. Five traps resolved correctly
is a better five minutes than any walkthrough of the pipeline.

## 3. Corrections rejoin at comparison, never at extraction

When a reviewer corrects a value, the corrected value enters the pipeline at
stage 5 and the case re-runs from there. It does not overwrite what the
extractor found. The original extraction, the human's correction, the reviewer
and the timestamp all persist, so the record shows what the system read *and*
what the human decided, rather than quietly rewriting history.

This also keeps the confidence breakdown honest: a field the machine got wrong
and a human fixed should not later look like a field the machine got right.

## 4. Correlation id per email

One id generated at ingest and attached to every log record, every service call
and every stored document for that email, so a single case can be traced end to
end through Application Insights. It goes into the structured log record already
specified in `docs/spec/pipeline.md` under Observability, alongside the existing
`email_id`, stage, deployment and input hash.
