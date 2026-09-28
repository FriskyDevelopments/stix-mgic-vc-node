import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECK_NAME, DEADLINE_MS, evaluateObservation, parseArgs, runSmoke, waitForReview } from './codepup-smoke.mjs';

const mainSha = '1'.repeat(40);
const treeSha = '2'.repeat(40);
const unsafeSha = '3'.repeat(40);
const fixedSha = '4'.repeat(40);
const repo = 'FriskyDevelopments/stix-mgic-vc-node';
const options = { repo, appId: 123, serviceUrl: 'https://codepup.example.com', keepBranch: false, dryRun: false };

function observation(phase = 'critical', headSha = unsafeSha) {
  return {
    checks: { check_runs: [{ id: 10, name: CHECK_NAME, app: { id: 123, slug: 'real-code-pup' }, head_sha: headSha, status: 'completed', conclusion: phase === 'critical' ? 'failure' : 'success', html_url: 'https://github.com/check/10' }] },
    reviews: [{ id: 20, commit_id: headSha, state: phase === 'critical' ? 'CHANGES_REQUESTED' : 'COMMENTED', user: { type: 'Bot', login: 'real-code-pup[bot]' }, body: phase === 'critical' ? '- critical: Unsafe expression execution' : 'No findings in this changed content.', html_url: 'https://github.com/review/20' }],
    comments: phase === 'critical' ? [{ id: 30, pull_request_review_id: 20, commit_id: headSha, user: { type: 'Bot', login: 'real-code-pup[bot]' }, body: '**critical**: Unsafe expression execution\nSuggested fix: Parse the allowed data format without executing input.', html_url: 'https://github.com/comment/30' }] : [],
    pull: { number: 99, head: { sha: headSha }, mergeable_state: 'blocked' },
  };
}

function classify(value, phase = 'critical', headSha = unsafeSha) {
  return evaluateObservation(value, { appId: 123, headSha, phase });
}

function fakeClock() {
  let ms = 0;
  return { now: () => 1_800_000_000_000 + ms, monotonic: () => ms, sleep: async (duration) => { ms += duration; }, advance: (duration) => { ms += duration; } };
}

function fixtures(overrides = {}) {
  const clock = fakeClock();
  const calls = [];
  const snapshots = [];
  let head = unsafeSha;
  let commitCount = 0;
  const api = async (method, endpoint, body) => {
    calls.push({ method, endpoint, body });
    if (overrides.api) {
      const response = await overrides.api(method, endpoint, body, { clock });
      if (response !== undefined) return response;
    }
    if (endpoint.endsWith('/protection/required_status_checks')) return { strict: true, checks: [{ context: CHECK_NAME, app_id: 123 }] };
    if (endpoint.endsWith('/branches/main/protection')) return { enforce_admins: { enabled: true }, required_status_checks: { strict: true, checks: [{ context: CHECK_NAME, app_id: 123 }] } };
    if (endpoint.includes('/rules/branches/main?')) return [];
    if (endpoint.endsWith('/git/ref/heads/main')) return { object: { sha: mainSha } };
    if (endpoint.endsWith(`/git/commits/${mainSha}`)) return { tree: { sha: treeSha } };
    if (method === 'POST' && endpoint.endsWith('/git/trees')) return { sha: treeSha };
    if (method === 'POST' && endpoint.endsWith('/git/commits')) return { sha: ++commitCount === 1 ? unsafeSha : fixedSha };
    if (method === 'POST' && endpoint.endsWith('/git/refs')) return { ref: body.ref };
    if (method === 'POST' && endpoint.endsWith('/pulls')) return { number: 99, html_url: 'https://github.com/pr/99', draft: true, head: { sha: unsafeSha } };
    if (method === 'PATCH' && endpoint.includes('/git/refs/heads/test/')) { head = body.sha; return { object: { sha: head } }; }
    if (method === 'DELETE' && endpoint.includes('/git/refs/heads/test/')) return null;
    if (method === 'PATCH' && endpoint.endsWith('/pulls/99')) return { state: 'closed' };
    const current = observation(head === unsafeSha ? 'critical' : 'fixed', head);
    if (endpoint.includes('/check-runs?')) return current.checks;
    if (endpoint.includes('/reviews?')) return current.reviews;
    if (endpoint.includes('/comments?')) return current.comments;
    if (endpoint.endsWith('/pulls/99')) return current.pull;
    throw new Error(`Unhandled mock endpoint: ${method} ${endpoint}`);
  };
  return { calls, snapshots, deps: { ...clock, api, id: 'unit-run', save: (report) => snapshots.push(structuredClone(report)), fetchReady: async () => ({ service: 'code-pup', status: 'ready' }) } };
}

function rulesetFixtures(change = () => {}) {
  const rule = { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: CHECK_NAME, integration_id: 123 }] } };
  const data = {
    effective: [{ ...structuredClone(rule), ruleset_id: 42, ruleset_source_type: 'Repository', ruleset_source: repo }],
    detail: { id: 42, target: 'branch', source_type: 'Repository', source: repo, enforcement: 'active', bypass_actors: [], conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } }, rules: [rule] },
  };
  change(data);
  return fixtures({ api: async (_method, endpoint) => {
    if (endpoint.endsWith('/protection/required_status_checks')) throw new Error('HTTP 404: no legacy protection.');
    if (endpoint.includes('/rules/branches/main?')) return data.effective;
    if (endpoint.endsWith('/rulesets/42?includes_parents=true')) return data.detail;
    return undefined;
  } });
}

test('CLI requires an explicit positive app identity and a safe HTTPS URL', () => {
  for (const appId of ['0', '-1', 'NaN', '1.5', '9007199254740992']) {
    assert.throws(() => parseArgs(['--app-id', appId, '--service-url', options.serviceUrl]));
  }
  assert.throws(() => parseArgs(['--app-id', '123', '--service-url', 'https://token@example.com']));
  assert.throws(() => parseArgs(['--app-id', '123', '--service-url', 'http://example.com']));
  assert.throws(() => parseArgs(['--app-id', '123', '--service-url', options.serviceUrl, '--repo', 'owner/repo/../main']));
  assert.equal(parseArgs(['--app-id', '123', '--service-url', options.serviceUrl, '--dry-run']).dryRun, true);
});

test('service URL accepts only an origin and never silently discards a deployment path', async () => {
  for (const suffix of ['/code-pup', '/code-pup/', '/readyz', '/%2F', '//', '?token=value', '#fragment']) {
    const serviceUrl = `${options.serviceUrl}${suffix}`;
    assert.throws(() => parseArgs(['--app-id', '123', '--service-url', serviceUrl]), /HTTPS origin/);
    const { calls, deps } = fixtures();
    let fetched = false;
    deps.fetchReady = async () => { fetched = true; return { service: 'code-pup', status: 'ready' }; };
    const report = await runSmoke({ ...options, serviceUrl }, deps);
    assert.equal(report.status, 'failed');
    assert.equal(report.serviceUrl, null);
    assert.equal(fetched, false);
    assert.equal(calls.length, 0);
  }
  for (const serviceUrl of [options.serviceUrl, `${options.serviceUrl}/`]) {
    assert.equal(parseArgs(['--app-id', '123', '--service-url', serviceUrl]).serviceUrl, options.serviceUrl);
  }
});

test('an unready deployment never creates Git objects, branches, or PRs', async () => {
  const { calls, deps } = fixtures();
  deps.fetchReady = async () => ({ service: 'code-pup', status: 'setup_required' });
  const report = await runSmoke(options, deps);
  assert.equal(report.status, 'failed');
  assert.equal(calls.length, 0);
  assert.match(report.error, /not ready/);
});

test('missing or unpinned required app gate fails before all writes', async () => {
  for (const checks of [[], [{ context: CHECK_NAME, app_id: -1 }], [{ context: CHECK_NAME, app_id: 999 }]]) {
    const { calls, deps } = fixtures({ api: async (_method, endpoint) => endpoint.endsWith('/required_status_checks') ? { checks } : undefined });
    const report = await runSmoke(options, deps);
    assert.equal(report.status, 'failed');
    assert.equal(calls.filter((call) => call.method !== 'GET').length, 0);
    assert.match(report.error, /pinned to app 123/);
  }
});

test('dry-run verifies preflight but does not write remotely', async () => {
  const { calls, deps } = fixtures();
  const report = await runSmoke({ ...options, dryRun: true }, deps);
  assert.equal(report.status, 'dry-run');
  assert.equal(report.preflight.baseSha, mainSha);
  assert.equal(calls.filter((call) => call.method !== 'GET').length, 0);
});

test('active effective main ruleset is accepted with strict pin and verified empty bypass list', async () => {
  const { calls, deps } = rulesetFixtures();
  const report = await runSmoke({ ...options, dryRun: true }, deps);
  assert.equal(report.status, 'dry-run');
  assert.equal(report.preflight.requiredCheck.source, 'ruleset');
  assert.equal(report.preflight.requiredCheck.rulesetId, 42);
  assert.deepEqual(report.preflight.requiredCheck.bypassActors, []);
  assert.ok(calls.some((call) => call.endpoint.includes('/rules/branches/main?')));
  assert.equal(calls.filter((call) => call.method !== 'GET').length, 0);
});

test('an inherited organization rule must be effective on main and match its source', async () => {
  const { deps } = rulesetFixtures((data) => {
    data.effective[0].ruleset_source_type = 'Organization';
    data.effective[0].ruleset_source = 'FriskyDevelopments';
    data.detail.source_type = 'Organization';
    data.detail.source = 'FriskyDevelopments';
  });
  const report = await runSmoke({ ...options, dryRun: true }, deps);
  assert.equal(report.status, 'dry-run');
  assert.equal(report.preflight.requiredCheck.rulesetSource, 'FriskyDevelopments');
});

test('a ruleset omitted from effective main rules cannot pass merely by its configuration', async () => {
  const { calls, deps } = rulesetFixtures((data) => { data.effective = []; });
  const report = await runSmoke({ ...options, dryRun: true }, deps);
  assert.equal(report.status, 'failed');
  assert.equal(calls.filter((call) => call.method !== 'GET').length, 0);
});

test('disabled, evaluate, wrong target, hidden bypass or any bypass fail closed', async () => {
  for (const alter of [
    (data) => { data.detail.enforcement = 'disabled'; },
    (data) => { data.detail.enforcement = 'evaluate'; },
    (data) => { data.detail.target = 'tag'; },
    (data) => { delete data.detail.bypass_actors; },
    (data) => { data.detail.bypass_actors = [{ actor_type: 'OrganizationAdmin', bypass_mode: 'always' }]; },
    (data) => { data.detail.bypass_actors = [{ actor_type: 'Integration', actor_id: 123, bypass_mode: 'pull_request' }]; },
    (data) => { data.detail.id = 43; },
    (data) => { data.detail.source = 'Other/repository'; },
  ]) {
    const { calls, deps } = rulesetFixtures(alter);
    const report = await runSmoke({ ...options, dryRun: true }, deps);
    assert.equal(report.status, 'failed');
    assert.equal(calls.filter((call) => call.method !== 'GET').length, 0);
  }
});

test('strict policy and exact app pin must appear in effective rule and full ruleset', async () => {
  for (const alter of [
    (data) => { data.effective[0].parameters.strict_required_status_checks_policy = false; },
    (data) => { data.detail.rules[0].parameters.strict_required_status_checks_policy = false; },
    (data) => { data.effective[0].parameters.required_status_checks[0].integration_id = 999; },
    (data) => { delete data.detail.rules[0].parameters.required_status_checks[0].integration_id; },
    (data) => { data.detail.rules[0].parameters.required_status_checks[0].context = 'unrelated-check'; },
  ]) {
    const { calls, deps } = rulesetFixtures(alter);
    const report = await runSmoke({ ...options, dryRun: true }, deps);
    assert.equal(report.status, 'failed');
    assert.equal(calls.filter((call) => call.method !== 'GET').length, 0);
  }
});

test('legacy checks remain supported only when strict and enforced for admins', async () => {
  for (const alter of ['not-strict', 'admin-bypass']) {
    const { calls, deps } = fixtures({ api: async (_method, endpoint) => {
      if (alter === 'not-strict' && endpoint.endsWith('/protection/required_status_checks')) return { strict: false, checks: [{ context: CHECK_NAME, app_id: 123 }] };
      if (alter === 'admin-bypass' && endpoint.endsWith('/branches/main/protection')) return { enforce_admins: { enabled: false }, required_status_checks: { strict: true, checks: [{ context: CHECK_NAME, app_id: 123 }] } };
      return undefined;
    } });
    const report = await runSmoke({ ...options, dryRun: true }, deps);
    assert.equal(report.status, 'failed');
    assert.equal(calls.filter((call) => call.method !== 'GET').length, 0);
  }
});

test('unavailable effective-rules metadata fails closed without remote writes', async () => {
  const { calls, deps } = fixtures({ api: async (_method, endpoint) => {
    if (endpoint.endsWith('/protection/required_status_checks')) throw new Error('HTTP 404');
    if (endpoint.includes('/rules/branches/main?')) throw new Error('HTTP 403');
    return undefined;
  } });
  const report = await runSmoke({ ...options, dryRun: true }, deps);
  assert.equal(report.status, 'failed');
  assert.equal(calls.filter((call) => call.method !== 'GET').length, 0);
});

test('critical evidence binds check app, current SHA, bot review and suggested fix', () => {
  assert.equal(classify(observation()).passed, true);
  const changed = observation();
  changed.comments[0].body = '**critical** Unhelpful finding without a fix.';
  assert.equal(classify(changed).passed, false);
});

test('a same-named check from another app cannot pass', () => {
  const changed = observation();
  changed.checks.check_runs[0].app.id = 999;
  assert.equal(classify(changed).passed, false);
});

test('stale checks and reviews on a previous head cannot pass', () => {
  const staleCheck = observation();
  staleCheck.checks.check_runs[0].head_sha = mainSha;
  assert.equal(classify(staleCheck).passed, false);
  const staleReview = observation();
  staleReview.reviews[0].commit_id = mainSha;
  assert.equal(classify(staleReview).passed, false);
  const stalePull = observation();
  stalePull.pull.head.sha = mainSha;
  assert.equal(classify(stalePull).passed, false);
});

test('a human, wrong bot, or inline comment from another review is not proof', () => {
  const human = observation();
  human.reviews[0].user.type = 'User';
  assert.equal(classify(human).passed, false);
  const wrongBot = observation();
  wrongBot.reviews[0].user.login = 'pretend-code-pup[bot]';
  assert.equal(classify(wrongBot).passed, false);
  const wrongReview = observation();
  wrongReview.comments[0].pull_request_review_id = 999;
  assert.equal(classify(wrongReview).passed, false);
});

test('critical review must fail the check, request changes and be blocked', () => {
  for (const alter of [
    (value) => { value.checks.check_runs[0].conclusion = 'success'; },
    (value) => { value.reviews[0].state = 'COMMENTED'; },
    (value) => { value.pull.mergeable_state = 'clean'; },
  ]) {
    const changed = observation();
    alter(changed);
    assert.equal(classify(changed).passed, false);
  }
});

test('fixed phase needs a fresh success and fresh review on the fixed commit', () => {
  const fixed = observation('fixed', fixedSha);
  assert.equal(classify(fixed, 'fixed', fixedSha).passed, true);
  fixed.reviews[0].commit_id = unsafeSha;
  assert.equal(classify(fixed, 'fixed', fixedSha).passed, false);
});

test('passing evidence arriving after 120 seconds cannot pass the SLA', async () => {
  const clock = fakeClock();
  let recorded;
  const api = async (_method, endpoint) => {
    const current = observation();
    if (endpoint.includes('/check-runs?')) return current.checks;
    if (endpoint.includes('/reviews?')) return current.reviews;
    if (endpoint.includes('/comments?')) return current.comments;
    clock.advance(DEADLINE_MS + 1);
    return current.pull;
  };
  await assert.rejects(waitForReview({ ...clock, api, repo, number: 99, headSha: unsafeSha, appId: 123, phase: 'critical', startedAt: new Date(clock.now()).toISOString(), startedMono: 0, record: (value) => { recorded = value; } }), /120-second deadline/);
  assert.equal(recorded.elapsedMs, DEADLINE_MS + 1);
  assert.equal(recorded.passed, false);
});

test('polling with no bot review is bounded and records the last observation', async () => {
  const clock = fakeClock();
  let polls = 0;
  const api = async (_method, endpoint) => {
    if (endpoint.includes('/check-runs?')) { polls += 1; return { check_runs: [] }; }
    if (endpoint.includes('/reviews?') || endpoint.includes('/comments?')) return [];
    return { head: { sha: unsafeSha }, mergeable_state: 'blocked' };
  };
  await assert.rejects(waitForReview({ ...clock, api, repo, number: 99, headSha: unsafeSha, appId: 123, phase: 'critical', startedAt: new Date(clock.now()).toISOString(), startedMono: 0, record: () => {} }), /120-second deadline/);
  assert.equal(clock.monotonic(), DEADLINE_MS);
  assert.equal(polls, 48);
});

test('end-to-end mock creates draft, observes both SHAs, then closes and deletes only its branch', async () => {
  const { calls, snapshots, deps } = fixtures();
  const report = await runSmoke(options, deps);
  assert.equal(report.status, 'passed');
  assert.deepEqual(report.phases.map((phase) => [phase.phase, phase.headSha, phase.passed]), [['critical', unsafeSha, true], ['fixed', fixedSha, true]]);
  const createdPr = calls.find((call) => call.method === 'POST' && call.endpoint.endsWith('/pulls'));
  assert.equal(createdPr.body.base, 'main');
  assert.equal(createdPr.body.draft, true);
  const refUpdates = calls.filter((call) => call.method === 'PATCH' && call.endpoint.includes('/git/refs/'));
  assert.equal(refUpdates.length, 1);
  assert.deepEqual(refUpdates[0].body, { sha: fixedSha, force: false });
  assert.ok(refUpdates[0].endpoint.endsWith('/test/codepup-smoke-unit-run'));
  const trees = calls.filter((call) => call.method === 'POST' && call.endpoint.endsWith('/git/trees'));
  assert.equal(trees[1].body.tree[0].sha, null);
  assert.ok(trees[1].body.tree[1].path.endsWith('.md'));
  assert.equal(report.cleanup.pullClosed, true);
  assert.equal(report.cleanup.branchDeleted, true);
  assert.equal(calls.at(-2).body.state, 'closed');
  assert.equal(calls.at(-1).method, 'DELETE');
  assert.ok(snapshots.some((saved) => saved.status === 'running' && saved.criticalSha === unsafeSha));
});

test('failure preserves evidence, closes PR, and never pushes a purported fix', async () => {
  const { calls, snapshots, deps } = fixtures({ api: async (_method, endpoint) => endpoint.includes('/check-runs?') ? { check_runs: [] } : undefined });
  const report = await runSmoke(options, deps);
  assert.equal(report.status, 'failed');
  assert.match(report.error, /120-second deadline/);
  assert.equal(report.cleanup.pullClosed, true);
  assert.equal(report.cleanup.branchDeleted, true);
  assert.equal(calls.filter((call) => call.method === 'PATCH' && call.endpoint.includes('/git/refs/')).length, 0);
  assert.equal(snapshots.at(-1).status, 'failed');
});

test('ambiguous PR create is reconciled and closed, never retried', async () => {
  const { calls, deps } = fixtures({ api: async (method, endpoint) => {
    if (method === 'POST' && endpoint.endsWith('/pulls')) throw new Error('Simulated timeout after accepted PR creation.');
    if (method === 'GET' && endpoint.includes('/pulls?state=open')) return [{ number: 99, html_url: 'https://github.com/pr/99', head: { ref: 'test/codepup-smoke-unit-run', repo: { full_name: repo } } }];
    return undefined;
  } });
  const report = await runSmoke(options, deps);
  assert.equal(report.status, 'failed');
  assert.equal(report.pull.recovered, true);
  assert.equal(report.cleanup.pullClosed, true);
  assert.equal(calls.filter((call) => call.method === 'POST' && call.endpoint.endsWith('/pulls')).length, 1);
});

test('accepted branch creation with a lost response is reconciled and cleaned without opening a PR', async () => {
  const branch = 'test/codepup-smoke-unit-run';
  const { calls, snapshots, deps } = fixtures({ api: async (method, endpoint) => {
    if (method === 'POST' && endpoint.endsWith('/git/refs')) throw new Error('Simulated timeout after accepted branch creation.');
    if (method === 'GET' && endpoint.endsWith(`/git/ref/heads/${branch}`)) return { ref: `refs/heads/${branch}`, object: { sha: unsafeSha } };
    return undefined;
  } });
  const report = await runSmoke(options, deps);
  assert.equal(report.status, 'failed');
  assert.equal(report.cleanup.branchRecovered, true);
  assert.equal(report.cleanup.branchDeleted, true);
  assert.equal(calls.filter((call) => call.method === 'POST' && call.endpoint.endsWith('/git/refs')).length, 1);
  assert.equal(calls.filter((call) => call.endpoint.endsWith('/pulls')).length, 0);
  assert.ok(snapshots.some((saved) => saved.branchCreateAttempted && saved.criticalSha === unsafeSha));
});

test('ambiguous branch creation respects keep-branch after recovery', async () => {
  const branch = 'test/codepup-smoke-unit-run';
  const { calls, deps } = fixtures({ api: async (method, endpoint) => {
    if (method === 'POST' && endpoint.endsWith('/git/refs')) throw new Error('Write response lost.');
    if (method === 'GET' && endpoint.endsWith(`/git/ref/heads/${branch}`)) return { ref: `refs/heads/${branch}`, object: { sha: unsafeSha } };
    return undefined;
  } });
  const report = await runSmoke({ ...options, keepBranch: true }, deps);
  assert.equal(report.cleanup.branchRecovered, true);
  assert.equal(report.cleanup.branchRetained, branch);
  assert.equal(calls.filter((call) => call.method === 'DELETE').length, 0);
});

test('ambiguous branch creation never deletes a different ref or commit', async () => {
  const branch = 'test/codepup-smoke-unit-run';
  for (const recovered of [
    { ref: `refs/heads/${branch}`, object: { sha: mainSha } },
    { ref: 'refs/heads/main', object: { sha: unsafeSha } },
    { ref: `refs/heads/${branch}` },
  ]) {
    const { calls, deps } = fixtures({ api: async (method, endpoint) => {
      if (method === 'POST' && endpoint.endsWith('/git/refs')) throw new Error('Write response lost.');
      if (method === 'GET' && endpoint.endsWith(`/git/ref/heads/${branch}`)) return recovered;
      return undefined;
    } });
    const report = await runSmoke(options, deps);
    assert.equal(report.status, 'failed');
    assert.match(report.cleanup.error, /expected ref and commit/);
    assert.equal(report.cleanup.branchRetained, branch);
    assert.equal(calls.filter((call) => call.method === 'DELETE').length, 0);
  }
});

test('branch reconciliation distinguishes confirmed absence from an unavailable lookup', async () => {
  const branch = 'test/codepup-smoke-unit-run';
  for (const status of [404, 403, 503, undefined]) {
    const { calls, deps } = fixtures({ api: async (method, endpoint) => {
      if (method === 'POST' && endpoint.endsWith('/git/refs')) throw new Error('Write response lost.');
      if (method === 'GET' && endpoint.endsWith(`/git/ref/heads/${branch}`)) throw Object.assign(new Error('Lookup unavailable.'), { status });
      return undefined;
    } });
    const report = await runSmoke(options, deps);
    assert.equal(report.status, 'failed');
    if (status === 404) {
      assert.equal(report.cleanup.branchAbsent, true);
      assert.equal(report.cleanup.branchRetained, undefined);
      assert.equal(report.cleanup.error, undefined);
    } else {
      assert.equal(report.cleanup.branchRetained, branch);
      assert.equal(report.cleanup.error, 'Lookup unavailable.');
    }
    assert.equal(calls.filter((call) => call.method === 'DELETE').length, 0);
  }
});

test('branch is retained when PR closure cannot be confirmed', async () => {
  const { calls, deps } = fixtures({ api: async (method, endpoint) => {
    if (method === 'PATCH' && endpoint.endsWith('/pulls/99')) throw new Error('Closure unavailable.');
    return undefined;
  } });
  const report = await runSmoke(options, deps);
  assert.equal(report.status, 'failed');
  assert.equal(report.cleanup.branchRetained, 'test/codepup-smoke-unit-run');
  assert.equal(calls.filter((call) => call.method === 'DELETE').length, 0);
});
