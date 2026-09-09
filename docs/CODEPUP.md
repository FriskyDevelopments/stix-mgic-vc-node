# Code Pup reviews

Code Pup uses the existing `code-pup-by-frisky` GitHub App (ID `3653175`). Its
intended runtime is Cloudflare Containers. `.codepup.yaml` is review policy; it
does not launch a reviewer. The existing CI workflow remains separate.

## Activation status

The 2026-09-09 deployment created the Worker and Container at
`https://code-pup.hrgrrtks2p.workers.dev`. `/healthz` returns HTTP 200 with
`setup_required`; `/readyz` returns HTTP 503 with `setup_required`.
`GITHUB_WEBHOOK_SECRET` is present in the new runtime.

A new private-key fingerprint is registered for the existing App `3653175`, but
Chrome blocked the key download. The private-key file is not available and has
not been uploaded to the runtime; the user's download handoff remains pending.
The App webhook still points to the previous receiver. The required merge gate
and dummy-PR acceptance test have not been activated.

Deployment is not evidence that the new receiver reviews PRs. An App-owned
`code-pup-state` check is also insufficient: acceptance requires the separate
`code-pup-review` check and a passing live test on this repository.

## Why no reviews were appearing

The investigation on 2026-09-06 found no Code Pup review, comment, or quality check
on the recent PRs examined. `main` had no protection or repository rulesets.
The legacy `pup-service` process was alive, but `/readyz` returned
HTTP 503 with `setup_required`. A successful Northflank deployment was therefore
not evidence that GitHub App credentials and repository access were configured.

The service source also discarded bot-authored PR events and only emitted a
neutral `code-pup-state` check. That check stores conversation state and must not
be used as the required quality check. Critical findings never failed a check.

## Runtime wiring

The service source lives in `FriskyDevelopments/code-pup`. The companion
`feat/codepup-fix` change adds the mandatory `code-pup-review` gate and Cloudflare
delivery handling. Deploy and verify that change through its reviewed feature
branch; this policy file alone cannot enable it.

Intended service configuration:

- Cloudflare Worker: `code-pup`, account `e2a7eccb24c4836847fd14d08c499bd0`.
- Public URL: `https://code-pup.hrgrrtks2p.workers.dev`.
- Webhook: `/webhooks/github`, with HTTPS certificate verification enabled.
- Node 24+ in a singleton Container, with webhook delivery persistence in a
  separate SQLite Durable Object. Container files do not provide durable storage.
- `CODE_PUP_ALLOWED_REPOSITORIES` must include
  `FriskyDevelopments/stix-mgic-vc-node` while preserving other intended entries.
- `CODE_PUP_REQUIRED_REPOSITORIES` must include exactly
  `FriskyDevelopments/stix-mgic-vc-node`.
- Set `GITHUB_APP_ID=3653175`. Store `GITHUB_APP_PRIVATE_KEY` and
  `GITHUB_WEBHOOK_SECRET` through Cloudflare secret controls; never commit them.
- Reuse and verify this App's installation on the repository. A build integration
  or the GitHub Actions token does not establish access for this reviewer App.
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
  --app-id 3653175 \
  --service-url https://code-pup.hrgrrtks2p.workers.dev \
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

`--service-url` accepts only an HTTPS origin, optionally with a trailing slash.
A path, credentials, query, or fragment is rejected before any network request.
If branch creation times out, cleanup first reads that exact ref and compares its
SHA with the recorded smoke commit. It never retries the write or deletes a
different branch. An unavailable or mismatched lookup leaves the branch recorded
for inspection; `--keep-branch` also preserves a recovered branch.

The prior feature-branch Actions fallback was reverted without rewriting history.
It executed a scanner from PR-controlled checkout content with a token able to
write reviews, allowing that PR to alter its own review. Its check came from
GitHub Actions and could not satisfy the required App identity. No App-owned
acceptance evidence can be substituted with that fallback.

Deterministic checks target concrete patterns; they cannot establish that every
possible bug has been found. Normal CI and human review remain relevant.
