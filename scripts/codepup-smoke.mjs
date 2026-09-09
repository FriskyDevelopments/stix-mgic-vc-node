#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

export const CHECK_NAME = 'code-pup-review';
export const DEADLINE_MS = 120_000;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA = /^[a-f0-9]{40}$/;
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function serviceOrigin(value) {
  let service;
  try { service = new URL(value); } catch { throw new Error('--service-url must be the deployed HTTPS service URL.'); }
  if (service.protocol !== 'https:' || service.username || service.password || service.search || service.hash || service.pathname !== '/') {
    throw new Error('--service-url must be an HTTPS origin without credentials, path, query, or fragment.');
  }
  return service.origin;
}

export function parseArgs(argv) {
  const options = { repo: 'FriskyDevelopments/stix-mgic-vc-node', keepBranch: false, dryRun: false };
  const values = { '--repo': 'repo', '--app-id': 'appId', '--service-url': 'serviceUrl', '--output': 'output' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--keep-branch') options.keepBranch = true;
    else if (values[arg] && argv[i + 1] && !argv[i + 1].startsWith('--')) options[values[arg]] = argv[++i];
    else throw new Error(`Unknown or incomplete argument: ${arg}`);
  }
  if (!REPO.test(options.repo)) throw new Error('--repo must be owner/repository.');
  if (!/^\d+$/.test(String(options.appId)) || !Number.isSafeInteger(Number(options.appId)) || Number(options.appId) <= 0) {
    throw new Error('--app-id must be the verified positive GitHub App ID.');
  }
  options.appId = Number(options.appId);
  options.serviceUrl = serviceOrigin(options.serviceUrl);
  return options;
}

/** GitHub CLI supplies its existing authentication; tokens never enter arguments or logs. */
export function ghApi(method, endpoint, body, timeoutMs = 20_000) {
  const args = ['api', '--method', method, endpoint, '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28'];
  if (body !== undefined) args.push('--input', '-');
  let raw;
  try {
    raw = execFileSync('gh', args, {
      encoding: 'utf8', input: body === undefined ? undefined : JSON.stringify(body),
      timeout: Math.max(1, Math.min(20_000, timeoutMs)), maxBuffer: 4 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    const status = String(error.stderr || '').match(/HTTP (\d{3})/)?.[1];
    const failure = new Error(`GitHub ${method} request failed${status ? ` (HTTP ${status})` : ''}; inspect GitHub before retrying a write.`);
    if (status) failure.status = Number(status);
    throw failure;
  }
  if (!raw.trim()) return null;
  try { return JSON.parse(raw); } catch { throw new Error('GitHub returned invalid JSON.'); }
}

function checkSummary(check) {
  return check && { id: check.id, name: check.name, appId: check.app?.id, appSlug: check.app?.slug, headSha: check.head_sha, status: check.status, conclusion: check.conclusion, url: check.html_url };
}

function reviewSummary(review) {
  return review && { id: review.id, author: review.user?.login, authorType: review.user?.type, commitSha: review.commit_id, state: review.state, url: review.html_url, bodySha256: createHash('sha256').update(review.body || '').digest('hex') };
}

/** Verify enforcement, not merely the existence of a similarly named ruleset. */
export async function verifyMergeGate(api, repo, appId) {
  const prefix = `repos/${repo}`;
  try {
    const status = await api('GET', `${prefix}/branches/main/protection/required_status_checks`);
    const pinned = status.checks?.some((check) => check.context === CHECK_NAME && check.app_id === appId);
    if (pinned && status.strict === true) {
      const protection = await api('GET', `${prefix}/branches/main/protection`);
      const fullPinned = protection.required_status_checks?.checks?.some((check) => check.context === CHECK_NAME && check.app_id === appId);
      if (fullPinned && protection.required_status_checks.strict === true && protection.enforce_admins?.enabled === true) {
        return { context: CHECK_NAME, appId, source: 'branch_protection', strict: true, enforceAdmins: true, effectiveBranch: 'main' };
      }
    }
  } catch {
    // A repository may use only rulesets. Independent positive evidence below is required.
  }

  // This endpoint includes only active rules actually applying to main, including inherited
  // rules. GitHub resolves fnmatch patterns and exclusions; local approximations are unsafe.
  // https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch
  let effective;
  try {
    effective = [];
    for (let page = 1; page <= 20; page += 1) {
      const rules = await api('GET', `${prefix}/rules/branches/main?per_page=100&page=${page}`);
      if (!Array.isArray(rules)) throw new Error('Invalid effective rules response.');
      effective.push(...rules);
      if (rules.length < 100) break;
      if (page === 20) throw new Error('Effective rule pagination exceeded the verification limit.');
    }
    const hasPinnedStatus = (rule) => rule.type === 'required_status_checks'
      && rule.parameters?.strict_required_status_checks_policy === true
      && rule.parameters?.required_status_checks?.some((check) => check.context === CHECK_NAME && check.integration_id === appId);
    for (const rule of effective.filter(hasPinnedStatus)) {
      if (!Number.isSafeInteger(rule.ruleset_id) || rule.ruleset_id <= 0) continue;
      const sourceValid = (rule.ruleset_source_type === 'Repository' && rule.ruleset_source?.toLowerCase() === repo.toLowerCase())
        || (rule.ruleset_source_type === 'Organization' && rule.ruleset_source?.toLowerCase() === repo.split('/')[0].toLowerCase());
      if (!sourceValid) continue;
      const detail = await api('GET', `${prefix}/rulesets/${rule.ruleset_id}?includes_parents=true`);
      // GitHub intentionally omits bypass_actors without ruleset write access. Omission is
      // unknown, not an empty bypass list, so it cannot establish the acceptance condition.
      if (detail.id !== rule.ruleset_id || detail.target !== 'branch' || detail.enforcement !== 'active'
        || detail.source_type !== rule.ruleset_source_type || detail.source !== rule.ruleset_source
        || !Array.isArray(detail.bypass_actors) || detail.bypass_actors.length !== 0
        || !Array.isArray(detail.rules) || !detail.rules.some(hasPinnedStatus)) continue;
      return { context: CHECK_NAME, appId, source: 'ruleset', rulesetId: detail.id, rulesetSource: detail.source, strict: true, enforcement: 'active', bypassActors: [], effectiveBranch: 'main' };
    }
  } catch {
    // An unavailable or incomplete rules API must never allow creation of a test PR.
  }
  throw new Error(`main must require ${CHECK_NAME} pinned to app ${appId} with strict enforcement and no bypass; no smoke PR was created. Verify legacy admin enforcement or an active ruleset with a visible empty bypass_actors list.`);
}

/** A successful status from another app, old SHA, or human comment is never evidence. */
export function evaluateObservation({ checks, reviews, comments, pull }, { appId, headSha, phase }) {
  const ownChecks = (checks.check_runs || []).filter((check) => check.name === CHECK_NAME && check.app?.id === appId && check.head_sha === headSha);
  const check = ownChecks.sort((a, b) => Number(b.id) - Number(a.id))[0];
  const expectedLogin = check?.app?.slug ? `${check.app.slug}[bot]` : null;
  const ownReviews = reviews.filter((review) => review.commit_id === headSha && review.user?.type === 'Bot' && review.user?.login === expectedLogin);
  const review = ownReviews.sort((a, b) => Number(b.id) - Number(a.id))[0];
  const relevantComments = comments.filter((comment) => comment.pull_request_review_id === review?.id && comment.commit_id === headSha && comment.user?.type === 'Bot' && comment.user?.login === expectedLogin);
  const observed = { check: checkSummary(check), review: reviewSummary(review), mergeableState: pull.mergeable_state, pullHeadSha: pull.head?.sha };
  if (pull.head?.sha !== headSha) return { passed: false, reason: 'PR head does not match the phase commit.', observed };
  if (!check || check.status !== 'completed') return { passed: false, reason: 'Waiting for an app-owned completed check on this SHA.', observed };
  if (!review) return { passed: false, reason: 'Waiting for the matching app bot review on this SHA.', observed };
  if (phase === 'critical') {
    const critical = relevantComments.find((comment) => /\bcritical\b/i.test(comment.body || '') && /(?:suggested fix|```suggestion)/i.test(comment.body || ''));
    if (check.conclusion !== 'failure' || review.state !== 'CHANGES_REQUESTED') return { passed: false, reason: 'Critical finding must fail the check and request changes.', observed };
    if (!/\bcritical\b/i.test(review.body || '') || !critical) return { passed: false, reason: 'Waiting for a critical finding with a suggested fix in the bot review.', observed };
    if (pull.mergeable_state !== 'blocked') return { passed: false, reason: 'Waiting for GitHub to report the protected PR as blocked.', observed };
    observed.criticalFinding = { id: critical.id, url: critical.html_url, commitSha: critical.commit_id, reviewId: critical.pull_request_review_id };
  } else if (check.conclusion !== 'success' || !['COMMENTED', 'APPROVED'].includes(review.state)) {
    return { passed: false, reason: 'The fixed commit needs a fresh successful check and review.', observed };
  }
  return { passed: true, observed };
}

export async function waitForReview({ api, monotonic, now, sleep: pause = sleep, repo, number, headSha, appId, phase, startedAt, startedMono, record }) {
  let last;
  const remaining = () => DEADLINE_MS - (monotonic() - startedMono);
  const get = async (endpoint) => {
    if (remaining() <= 0) throw new Error(`${phase} review missed the 120-second deadline.`);
    return api('GET', endpoint, undefined, remaining());
  };
  do {
    const checks = await get(`repos/${repo}/commits/${headSha}/check-runs?per_page=100&filter=latest`);
    const reviews = await get(`repos/${repo}/pulls/${number}/reviews?per_page=100`);
    const comments = await get(`repos/${repo}/pulls/${number}/comments?per_page=100`);
    const pull = await get(`repos/${repo}/pulls/${number}`);
    last = evaluateObservation({ checks, reviews, comments, pull }, { appId, headSha, phase });
    const elapsedMs = monotonic() - startedMono;
    record({ phase, headSha, startedAt, observedAt: new Date(now()).toISOString(), elapsedMs, ...last, passed: last.passed && elapsedMs <= DEADLINE_MS, ...(elapsedMs > DEADLINE_MS ? { reason: 'Evidence arrived after the 120-second deadline.' } : {}) });
    if (last.passed && elapsedMs <= DEADLINE_MS) return;
    if (remaining() <= 0) break;
    await pause(Math.min(2500, remaining()));
  } while (remaining() > 0);
  throw new Error(`${phase} review missed the 120-second deadline. ${last?.reason || ''}`.trim());
}

export async function runSmoke(options, dependencies = {}) {
  const api = dependencies.api || ghApi;
  const now = dependencies.now || Date.now;
  const monotonic = dependencies.monotonic || (() => performance.now());
  const fetchReady = dependencies.fetchReady || (async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
    if (!response.ok) throw new Error(`CodePup readiness returned HTTP ${response.status}; no smoke PR was created.`);
    return response.json();
  });
  const save = dependencies.save || (() => {});
  const id = dependencies.id || `${new Date(now()).toISOString().replace(/[-:.TZ]/g, '')}-${randomUUID().slice(0, 8)}`;
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Invalid smoke run ID.');
  const branch = `test/codepup-smoke-${id}`;
  const prefix = `repos/${options.repo}`;
  const fixture = `scripts/codepup-smoke-fixture-${id}.mjs`;
  const marker = `docs/codepup-smoke-${id}.md`;
  const report = { version: 1, status: 'running', repo: options.repo, base: 'main', appId: options.appId, serviceUrl: null, branch, startedAt: new Date(now()).toISOString(), triggers: [], phases: [], cleanup: {} };
  let branchCreated = false;
  let attemptedBranchCreate = false;
  let attemptedPrCreate = false;
  let number;
  const persist = () => save(report);
  try {
    // Fail closed before creating even a Git object when deployment or merge protection is missing.
    if (!REPO.test(options.repo) || !Number.isSafeInteger(options.appId) || options.appId <= 0) throw new Error('Verified repository and positive app ID are required.');
    report.serviceUrl = serviceOrigin(options.serviceUrl);
    const ready = await fetchReady(new URL('/readyz', report.serviceUrl).href);
    if (ready.service !== 'code-pup' || ready.status !== 'ready') throw new Error('CodePup is not ready; no smoke PR was created.');
    const required = await verifyMergeGate(api, options.repo, options.appId);
    const main = await api('GET', `${prefix}/git/ref/heads/main`);
    const base = await api('GET', `${prefix}/git/commits/${main.object?.sha}`);
    if (!SHA.test(main.object?.sha || '') || !SHA.test(base.tree?.sha || '')) throw new Error('Could not verify main commit and tree.');
    report.preflight = { ready, requiredCheck: required, baseSha: main.object.sha, baseTreeSha: base.tree.sha };
    persist();
    if (options.dryRun) {
      report.status = 'dry-run';
      report.plan = ['Create an isolated test branch from main.', 'Open a draft PR with one unused unsafe fixture.', 'Require an app-owned critical review and blocking failure within 120 seconds.', 'Delete the unsafe fixture and require a fresh successful review within 120 seconds.', 'Close the dummy PR and remove only its test branch unless --keep-branch is set.'];
      return report;
    }
    const tree = await api('POST', `${prefix}/git/trees`, { base_tree: base.tree.sha, tree: [{ path: fixture, mode: '100644', type: 'blob', content: '// Isolated CodePup smoke fixture. Never imported or executed.\nexport function evaluateUntrustedInput(input) { return eval(input); }\n' }] });
    const commit = await api('POST', `${prefix}/git/commits`, { message: `test: CodePup critical review smoke ${id}`, tree: tree.sha, parents: [main.object.sha] });
    if (!SHA.test(commit.sha || '')) throw new Error('GitHub did not return the smoke commit SHA.');
    report.criticalSha = commit.sha;
    persist();
    attemptedBranchCreate = true;
    report.branchCreateAttempted = true;
    persist();
    await api('POST', `${prefix}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });
    branchCreated = true;
    attemptedPrCreate = true;
    // Start the clock before the triggering request so API latency counts toward the SLA.
    const openedAt = new Date(now()).toISOString();
    const openedMono = monotonic();
    report.triggers.push({ phase: 'critical', headSha: commit.sha, startedAt: openedAt });
    persist();
    const pull = await api('POST', `${prefix}/pulls`, {
      title: `[CodePup smoke] Critical finding and fix ${id}`, head: branch, base: 'main', draft: true,
      body: 'Authorized, isolated CodePup integration smoke test. The unused fixture is never executed. This draft PR must never be merged and is closed by the test. Expect a critical bot review and failure, followed by a fresh successful review after removal of the fixture.',
    });
    number = pull.number;
    report.pull = { number, url: pull.html_url, draft: pull.draft };
    persist();
    if (!Number.isInteger(number) || pull.head?.sha !== commit.sha) throw new Error('Created PR did not match the expected smoke head.');
    const record = (phase) => { const index = report.phases.findIndex((item) => item.phase === phase.phase); if (index < 0) report.phases.push(phase); else report.phases[index] = phase; persist(); };
    await waitForReview({ api, now, monotonic, sleep: dependencies.sleep, repo: options.repo, number, headSha: commit.sha, appId: options.appId, phase: 'critical', startedAt: openedAt, startedMono: openedMono, record });
    const fixedTree = await api('POST', `${prefix}/git/trees`, { base_tree: tree.sha, tree: [{ path: fixture, mode: '100644', type: 'blob', sha: null }, { path: marker, mode: '100644', type: 'blob', content: `CodePup isolated smoke ${id}.\nThe unsafe fixture has been removed. Do not merge this test PR.\n` }] });
    const fixedCommit = await api('POST', `${prefix}/git/commits`, { message: `test: remove CodePup smoke fixture ${id}`, tree: fixedTree.sha, parents: [commit.sha] });
    if (!SHA.test(fixedCommit.sha || '')) throw new Error('GitHub did not return the fixed commit SHA.');
    report.fixedSha = fixedCommit.sha;
    persist();
    const updatedAt = new Date(now()).toISOString();
    const updatedMono = monotonic();
    report.triggers.push({ phase: 'fixed', headSha: fixedCommit.sha, startedAt: updatedAt });
    persist();
    await api('PATCH', `${prefix}/git/refs/heads/${branch}`, { sha: fixedCommit.sha, force: false });
    await waitForReview({ api, now, monotonic, sleep: dependencies.sleep, repo: options.repo, number, headSha: fixedCommit.sha, appId: options.appId, phase: 'fixed', startedAt: updatedAt, startedMono: updatedMono, record });
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = error.message;
  } finally {
    if (attemptedBranchCreate && !branchCreated) {
      // A timed-out write may have succeeded. Recover only this exact ref and SHA;
      // never retry creation or delete a same-named branch with different content.
      try {
        const recovered = await api('GET', `${prefix}/git/ref/heads/${branch}`);
        if (recovered.ref !== `refs/heads/${branch}` || recovered.object?.sha !== report.criticalSha) {
          throw new Error('Attempted branch creation could not be reconciled to the expected ref and commit; branch retained for inspection.');
        }
        branchCreated = true;
        report.cleanup.branchRecovered = true;
      } catch (error) {
        if (error.status === 404) report.cleanup.branchAbsent = true;
        else {
          report.cleanup.error = error.message;
          report.cleanup.branchRetained = branch;
        }
      }
    }
    if (branchCreated && !number && attemptedPrCreate) {
      // Reconcile an ambiguous POST response before cleanup; never retry PR creation.
      try {
        const candidates = await api('GET', `${prefix}/pulls?state=open&head=${encodeURIComponent(`${options.repo.split('/')[0]}:${branch}`)}&base=main&per_page=100`);
        const recovered = candidates.filter((pull) => pull.head?.ref === branch && pull.head?.repo?.full_name === options.repo);
        if (recovered.length !== 1) throw new Error('Could not uniquely reconcile the attempted PR creation.');
        number = recovered[0].number;
        report.pull = { number, url: recovered[0].html_url, recovered: true };
      } catch (error) { report.cleanup.error = error.message; }
    }
    if (number) {
      try {
        const closed = await api('PATCH', `${prefix}/pulls/${number}`, { state: 'closed' });
        if (closed.state !== 'closed') throw new Error('GitHub did not confirm PR closure.');
        report.cleanup.pullClosed = true;
      } catch (error) { report.cleanup.error = error.message; }
    }
    if (branchCreated && !options.keepBranch && (!attemptedPrCreate || report.cleanup.pullClosed)) {
      try { await api('DELETE', `${prefix}/git/refs/heads/${branch}`); report.cleanup.branchDeleted = true; }
      catch (error) { report.cleanup.error = error.message; }
    }
    if (branchCreated && !report.cleanup.branchDeleted) report.cleanup.branchRetained = branch;
    if (report.cleanup.error && report.status === 'passed') report.status = 'failed';
    report.finishedAt = new Date(now()).toISOString();
    persist();
  }
  return report;
}

async function main() {
  let options;
  try { options = parseArgs(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error.message}\nUsage: node scripts/codepup-smoke.mjs --app-id ID --service-url https://SERVICE [--repo OWNER/REPO] [--output FILE] [--dry-run] [--keep-branch]\n`); process.exitCode = 1; return; }
  const output = resolve(options.output || `work/codepup-smoke-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const save = (report) => { mkdirSync(dirname(output), { recursive: true }); writeFileSync(`${output}.tmp`, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }); renameSync(`${output}.tmp`, output); };
  const report = await runSmoke(options, { save });
  process.stdout.write(JSON.stringify({ status: report.status, evidence: output, pull: report.pull, error: report.error, cleanup: report.cleanup }, null, 2) + '\n');
  if (!['passed', 'dry-run'].includes(report.status)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { process.stderr.write('Smoke test stopped unexpectedly; inspect the saved evidence before retrying.\n'); process.exitCode = 1; });
}
