# Code Pup reviews

Code Pup runs as a native Northflank GitHub App service. `.codepup.yaml` is review
policy; it does not launch a reviewer. The existing CI workflow remains separate.

## Why no reviews were appearing

The investigation on 2026-09-06 found no Code Pup review, comment, or quality check
on the recent PRs examined. `main` had no protection or repository rulesets.
The current Northflank `pup-service` process was alive, but `/readyz` returned
HTTP 503 with `setup_required`. A successful Northflank deployment was therefore
not evidence that GitHub App credentials and repository access were configured.

The service source also discarded bot-authored PR events and only emitted a
neutral `code-pup-state` check. That check stores conversation state and must not
be used as the required quality check. Critical findings never failed a check.

## Runtime wiring

The service source lives in `FriskyDevelopments/code-pup`. Deploy the companion
`feat/codepup-fix` change there, which adds the mandatory `code-pup-review` gate.
Both repositories' `main` branches remain unchanged until their PRs are reviewed.

Existing service:

- Northflank: project `code-pup`, service `pup-service`.
- Public URL: `https://p01--pup-service--6qgbzwqz9jc9.code.run`.
- Webhook: `/webhooks/github`, with HTTPS certificate verification enabled.
- Node 24+, one replica, persistent volume mounted at `/data`.
- `CODE_PUP_ALLOWED_REPOSITORIES` must include
  `FriskyDevelopments/stix-mgic-vc-node` while preserving other intended entries.
- `CODE_PUP_REQUIRED_REPOSITORIES` must include exactly
  `FriskyDevelopments/stix-mgic-vc-node`.
- Store `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (or its mounted-file alternative),
  and `GITHUB_WEBHOOK_SECRET` through runtime secret controls.
- Install the GitHub App on this repository. Its Northflank build integration is
  a different App and does not provide reviewer access.
- Grant Checks write, Pull requests write, and Contents read for review operation.
  Existing optional features may require additional permissions; do not grant
  Contents write merely to enable automatic reviews.
- Subscribe to Pull request, Issue comment, and Pull request review comment events.
  Opening, pushing, reopening, ready-for-review, and draft conversion events are
  covered, including PRs opened by Dependabot and Copilot.

The mandatory gate cannot be disabled through PR description overrides,
conversational pause/ignore state, or a draft flag. It is tied to the exact head
commit reviewed. A later push requires its own successful check. Critical
findings fail the check and request changes. Incomplete analysis fails closed;
a failed model call is not reported as a clean review. When no model is
configured, output explicitly identifies deterministic-only coverage.

## Merge protection

Once the service is ready and its real App ID is verified, add an active repository
ruleset for `refs/heads/main` requiring `code-pup-review` from that specific App.
Require the branch to be up to date and configure no bypass actors. Preserve any
existing rulesets or required CI checks. Do not use `code-pup-state` or accept a
same-named status from an arbitrary integration.

Do not activate an unconfigured required check and describe the integration as
working: that blocks every merge without providing a reviewer. Record the actual
ruleset and App IDs when activation completes.

## Acceptance test

Run local tests for the smoke harness:

```sh
npm run test:codepup
```

After `/readyz` returns `{"service":"code-pup","status":"ready"}` and the
App-pinned required rule is active, run:

```sh
npm run test:codepup:live -- \
  --repo FriskyDevelopments/stix-mgic-vc-node \
  --app-id ACTUAL_VERIFIED_APP_ID \
  --service-url https://p01--pup-service--6qgbzwqz9jc9.code.run \
  --output /tmp/codepup-live-evidence.json
```

The test creates an isolated draft PR containing an unexecuted unsafe fixture,
requires a critical finding and a failed check from the intended App on the
current SHA within 120 seconds, then pushes a fix and requires a successful check
on its new SHA within 120 seconds. It verifies merge protection without attempting
a merge, closes its test PR, and records the result. It never changes `main`.
Unready service, absent protection, stale results, wrong App identity, and timeout
must fail the test. An offline fixture or a manually posted comment is not a live
acceptance pass.

Deterministic checks target concrete patterns; they cannot establish that every
possible bug has been found. Normal CI and human review remain relevant.
