#!/usr/bin/env node
/**
 * Code Pup Actions reviewer for this repository.
 * The Northflank GitHub App is still setup_required; this job is the path that
 * actually posts reviews until that service has credentials.
 */

const CRITICAL = "critical";
const HIGH = "high";
const NOTE = "note";

const RULES = [
  {
    id: "ghost-join-pending-drop",
    severity: CRITICAL,
    title: "Ghost join: dropped adapter reply",
    hint: "Drain every complete stdout line. Do not return early when pending is null; correlate replies by request id.",
    test: (path, line) =>
      /telegram-vc-adapter|telegram_vc_adapter/.test(path) &&
      /if\s*\(\s*!\s*pending\s*\)\s*return/.test(line),
  },
  {
    id: "ghost-join-invented-state",
    severity: CRITICAL,
    title: "Ghost join: invented joined/active state",
    hint: "A successful join must reflect confirmed transport state, not a button click or local optimistic flag.",
    test: (path, line) =>
      /(telegram-vc|telegram_vc|session-api)/.test(path) &&
      /(joined|active)\s*[:=]\s*true/.test(line) &&
      /confirm|observed|status\.joined/.test(line) === false,
  },
  {
    id: "ghost-join-stdin-iter",
    severity: CRITICAL,
    title: "Ghost join: block-buffered stdin",
    hint: "Replace `for line in sys.stdin` with an explicit binary line buffer. One reply per complete request line.",
    test: (path, line) => path.endsWith(".py") && /for\s+line\s+in\s+sys\.stdin\s*:/.test(line),
  },
  {
    id: "auth-bypass-required-off",
    severity: CRITICAL,
    title: "Auth bypass: AUTH_REQUIRED disabled",
    hint: "Do not hard-disable AUTH_REQUIRED. Hosted mode must use the real operator session.",
    test: (_path, line) => /AUTH_REQUIRED\s*=\s*(false|0|"false"|'false')/.test(line),
  },
  {
    id: "auth-bypass-skip-verify",
    severity: CRITICAL,
    title: "Auth bypass: verification skipped",
    hint: "Keep verifyOperatorToken / session custody. Do not short-circuit auth checks.",
    test: (_path, line) =>
      /(skip|bypass|disable).{0,24}(auth|verifyOperatorToken|confirmPairing)/i.test(line) ||
      /verifyOperatorToken\s*=\s*\(\)\s*=>\s*true/.test(line),
  },
  {
    id: "auth-session-leak",
    severity: CRITICAL,
    title: "Auth / data loss: session bytes in response",
    hint: "Session bytes must never appear in API responses or logs. Preserve 0600 session custody.",
    test: (_path, line) =>
      /(res\.(json|send)|console\.(log|info|debug)|return\s*\{)[^\n]*(sessionBytes|session_bytes|mtproto.?session)/i.test(line),
  },
  {
    id: "data-loss-unscoped-delete",
    severity: CRITICAL,
    title: "Data loss: unscoped destructive delete",
    hint: "Scope deletes to /data/.../<tenantId>/. Do not rm or DROP across tenants.",
    test: (path, line) =>
      /server\//.test(path) &&
      /(rmSync|rm\(|unlinkSync|DROP\s+TABLE|deleteMany\(\s*\))/.test(line) &&
      !/tenantId|tenants\//.test(line),
  },
];

export function addedLines(patch) {
  if (!patch) return [];
  const out = [];
  let line = 0;
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      const match = /\+([0-9]+)/.exec(raw);
      line = match ? Number(match[1]) : line;
      continue;
    }
    if (raw.startsWith("++") || raw.startsWith("---") || raw.startsWith("diff ") || raw.startsWith("index ")) continue;
    if (raw.startsWith("+")) {
      out.push({ line, text: raw.slice(1) });
      line += 1;
      continue;
    }
    if (raw.startsWith("-")) continue;
    line += 1;
  }
  return out;
}

export function scanFile(path, patch) {
  const findings = [];
  for (const { line, text } of addedLines(patch)) {
    for (const rule of RULES) {
      if (!rule.test(path, text)) continue;
      findings.push({
        id: rule.id,
        severity: rule.severity,
        title: rule.title,
        hint: rule.hint,
        path,
        line,
        snippet: text.trim().slice(0, 200),
      });
    }
  }
  return findings;
}

export function scanFiles(files) {
  return files.flatMap((file) => scanFile(file.filename || file.path || "", file.patch || ""));
}

export function rank(findings) {
  const order = { [CRITICAL]: 0, [HIGH]: 1, [NOTE]: 2 };
  return [...findings].sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
}

export function reviewBody(findings) {
  const ranked = rank(findings);
  const critical = ranked.filter((item) => item.severity === CRITICAL);
  const lines = [
    "## Code Pup review",
    "",
    "Deterministic gate for ghost join, auth bypass, and data loss.",
    "Northflank App `/readyz` is not required for this Actions job.",
    "",
  ];
  if (!ranked.length) {
    lines.push("No critical ghost-join, auth-bypass, or unscoped-delete patterns in the added hunks.");
    lines.push("Human review and CI still apply.");
    return { body: lines.join("\n"), event: "COMMENT", critical: false };
  }
  lines.push("| Severity | Finding | File | Line |");
  lines.push("| --- | --- | --- | --- |");
  for (const item of ranked) {
    lines.push(`| ${item.severity} | ${item.title} | \`${item.path}\` | ${item.line} |`);
  }
  lines.push("");
  for (const item of ranked) {
    lines.push(`### ${item.title}`);
    lines.push(`- File: \`${item.path}\`:${item.line}`);
    lines.push(`- Suggested fix: ${item.hint}`);
    lines.push(`- Hunk: \`${item.snippet}\``);
    lines.push("");
  }
  return {
    body: lines.join("\n"),
    event: critical.length ? "REQUEST_CHANGES" : "COMMENT",
    critical: critical.length > 0,
  };
}

export function reviewComments(findings) {
  return rank(findings)
    .filter((item) => item.severity === CRITICAL && item.line > 0)
    .slice(0, 20)
    .map((item) => ({
      path: item.path,
      line: item.line,
      side: "RIGHT",
      body: `**${item.severity}:** ${item.title}\n\n${item.hint}`,
    }));
}

function eventPayload() {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path) return {};
  return JSON.parse(requireFs().readFileSync(path, "utf8"));
}

function requireFs() {
  return awaitImport ? null : null;
}

async function github(method, url, body) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required");
  const res = await fetch(`https://api.github.com${url}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} failed: ${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

export async function loadPullFiles({ owner, repo, number, token }) {
  const files = [];
  let page = 1;
  for (;;) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/files?per_page=100&page=${page}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
        },
      },
    );
    if (!res.ok) throw new Error(`list files failed: ${res.status}`);
    const batch = await res.json();
    files.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return files;
}

function pullNumberFrom(event) {
  if (event.pull_request?.number) return event.pull_request.number;
  const ref = event.issue?.pull_request?.url;
  if (!ref) return 0;
  const match = /\/pulls\/(\d+)$/.exec(ref);
  return match ? Number(match[1]) : 0;
}

export async function runReview({ event, token, repository }) {
  const number = pullNumberFrom(event);
  if (!number) return { skipped: true, reason: "not-a-pull" };
  const [owner, repo] = repository.split("/");
  const files = await loadPullFiles({ owner, repo, number, token });
  const findings = scanFiles(files);
  const review = reviewBody(findings);
  const comments = reviewComments(findings);
  await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}/reviews`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      body: review.body,
      event: review.event,
      comments,
    }),
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`create review failed: ${res.status} ${text.slice(0, 400)}`);
    }
  });
  return { skipped: false, critical: review.critical, findings };
}

async function main() {
  if (process.argv.includes("--scan-stdin")) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const files = JSON.parse(Buffer.concat(chunks).toString("utf8") || "[]");
    const findings = scanFiles(files);
    const review = reviewBody(findings);
    process.stdout.write(JSON.stringify({ findings, review }) + "\n");
    process.exit(review.critical ? 1 : 0);
  }

  const { readFileSync } = await import("node:fs");
  const event = process.env.GITHUB_EVENT_PATH
    ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"))
    : {};
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !token) {
    console.error("GITHUB_REPOSITORY and GITHUB_TOKEN are required unless --scan-stdin is used");
    process.exit(2);
  }
  const result = await runReview({ event, token, repository });
  console.log(JSON.stringify({ service: "code-pup", ...result, count: result.findings?.length || 0 }));
  if (result.critical) process.exit(1);
}

const invoked = process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"));
if (invoked || process.argv[1]?.endsWith("codepup-review.mjs")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  });
}
