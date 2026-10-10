#!/usr/bin/env node
// The agent queue's only way to touch GitHub. Raw `gh pr create`, `gh pr merge` and
// `git push` are blocked for agents (see guard.mjs); every step here checks the rules first.
//
//   node scripts/agent/queue.mjs status
//   node scripts/agent/queue.mjs show <issue>
//   node scripts/agent/queue.mjs claim <issue>
//   node scripts/agent/queue.mjs open-pr --issue <n> --title <text> --body-file <path>
//   node scripts/agent/queue.mjs update-pr <pr> --body-file <path>
//   node scripts/agent/queue.mjs verdict <pr> approve|changes --body-file <path>
//   node scripts/agent/queue.mjs merge <pr> [--dry-run]
//   node scripts/agent/queue.mjs stuck <issue> --body-file <path>
//   node scripts/agent/queue.mjs idea --title <text> --body-file <path>
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { classify } from './risk.mjs';

const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const { repo, owner, base, branchPrefix } = config;
const REVIEW_MARK = /<!-- agent-review:(approve|changes) sha=([0-9a-f]{7,40}) -->/;
const NEEDS_YOU_MARK = (sha) => `<!-- agent-needs-you sha=${sha} -->`;

function run(cmd, args, { allowFail = false } = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFail) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${result.status}): ${result.stderr.trim()}`);
  }
  return result.stdout;
}
const gh = (args, opts) => run('gh', args, opts);
const ghJson = (args) => JSON.parse(gh(args) || 'null');
const git = (args, opts) => run('git', args, opts).trim();

function fail(message) {
  console.error(`refused: ${message}`);
  process.exit(1);
}

function option(args, name) {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

function readBody(args) {
  const path = option(args, '--body-file');
  if (!path) fail('--body-file is required');
  return readFileSync(path, 'utf8').trim();
}

function issueNumber(value) {
  const n = Number.parseInt(String(value ?? '').replace('#', ''), 10);
  if (!Number.isInteger(n) || n <= 0) fail(`not an issue or PR number: ${value}`);
  return n;
}

const labelNames = (item) => (item.labels ?? []).map((l) => l.name);
const isAgentComment = (body) => body.startsWith('🤖') || REVIEW_MARK.test(body);
const ownerComments = (item) =>
  (item.comments ?? [])
    .filter((c) => c.author?.login === owner)
    .map((c) => ({ at: c.createdAt, body: c.body }));

function getIssue(n) {
  return ghJson([
    'issue',
    'view',
    String(n),
    '--repo',
    repo,
    '--json',
    'number,title,body,author,labels,state,comments,createdAt',
  ]);
}

function getPr(n) {
  return ghJson([
    'pr',
    'view',
    String(n),
    '--repo',
    repo,
    '--json',
    'number,title,body,author,labels,state,files,headRefName,headRefOid,baseRefName,isCrossRepository,comments,mergeable',
  ]);
}

/** Only issues the owner opened count: the fork is public and anyone can open one. */
function assertOwnerIssue(issue) {
  if (issue.author?.login !== owner) fail(`issue #${issue.number} was not opened by ${owner}`);
  if (issue.state !== 'OPEN') fail(`issue #${issue.number} is not open`);
}

function setLabels(kind, n, { add = [], remove = [] }) {
  const args = [kind, 'edit', String(n), '--repo', repo];
  for (const l of add) args.push('--add-label', l);
  for (const l of remove) args.push('--remove-label', l);
  if (add.length || remove.length) gh(args);
}

const comment = (kind, n, body) => gh([kind, 'comment', String(n), '--repo', repo, '--body', body]);

/** The issue a PR works on, from its branch name `agent/<issue>-<slug>`. */
function linkedIssue(pr) {
  const m = pr.headRefName.match(/^agent\/(\d+)-/);
  return m ? Number(m[1]) : null;
}

function ciState(pr) {
  const needsCi = pr.files.some((f) =>
    config.ciPaths.some((p) => f.path === p || f.path.startsWith(p)),
  );
  if (!needsCi) return 'none-needed';
  const out = gh(['pr', 'checks', String(pr.number), '--repo', repo, '--json', 'name,bucket'], {
    allowFail: true,
  });
  const checks = out.trim() ? JSON.parse(out) : [];
  const required = checks.filter((c) => config.requiredChecks.includes(c.name));
  if (required.length < config.requiredChecks.length) return 'pending';
  if (required.some((c) => c.bucket === 'fail' || c.bucket === 'cancel')) return 'fail';
  if (required.every((c) => c.bucket === 'pass')) return 'pass';
  return 'pending';
}

/** The owner account's latest review verdict for the PR's current head commit. */
function reviewState(pr) {
  for (const c of [...ownerComments(pr)].reverse()) {
    const m = c.body.match(REVIEW_MARK);
    if (!m) continue;
    return pr.headRefOid.startsWith(m[2]) ? m[1] : 'stale';
  }
  return 'none';
}

/** The owner's own comments since the agent last said something on the PR. */
function pendingFeedback(pr) {
  const comments = ownerComments(pr);
  let lastAgent = -1;
  comments.forEach((c, i) => {
    if (isAgentComment(c.body)) lastAgent = i;
  });
  return comments.slice(lastAgent + 1).filter((c) => !isAgentComment(c.body));
}

function assertAgentPr(pr) {
  if (pr.isCrossRepository) fail(`PR #${pr.number} comes from another repository`);
  if (pr.author?.login !== owner) fail(`PR #${pr.number} was not opened by ${owner}`);
  if (pr.baseRefName !== base) fail(`PR #${pr.number} targets ${pr.baseRefName}, not ${base}`);
  if (!pr.headRefName.startsWith(branchPrefix)) fail(`PR #${pr.number} is not an agent branch`);
  if (pr.state !== 'OPEN') fail(`PR #${pr.number} is not open`);
}

function listIssues(label) {
  return ghJson([
    'issue',
    'list',
    '--repo',
    repo,
    '--state',
    'open',
    '--label',
    label,
    '--json',
    'number,title,author,labels,createdAt',
    '--limit',
    '100',
  ]).filter((i) => i.author?.login === owner);
}

function status() {
  const ready = listIssues('agent-ready').filter((i) => !labelNames(i).includes('agent-working'));
  const working = listIssues('agent-working');
  const prs = ghJson([
    'pr',
    'list',
    '--repo',
    repo,
    '--state',
    'open',
    '--base',
    base,
    '--json',
    'number,title,headRefName,author,labels',
    '--limit',
    '100',
  ]).filter((p) => p.author?.login === owner && p.headRefName.startsWith(branchPrefix));
  const today = new Date().toISOString().slice(0, 10);
  const ideas = listIssues('agent-idea');
  const detailed = prs.map((p) => {
    const pr = getPr(p.number);
    return {
      number: pr.number,
      title: pr.title,
      issue: linkedIssue(pr),
      labels: labelNames(pr),
      ci: ciState(pr),
      review: reviewState(pr),
      risk: classify(pr.files, config),
      mergeable: pr.mergeable,
      feedback: pendingFeedback(pr),
      changesRequested: ownerComments(pr).filter((c) => /agent-review:changes/.test(c.body)).length,
    };
  });
  const busy = working.length;
  const startedToday =
    ghJson([
      'pr',
      'list',
      '--repo',
      repo,
      '--state',
      'all',
      '--search',
      `created:>=${today}`,
      '--json',
      'headRefName,author',
      '--limit',
      '100',
    ]).filter((p) => p.author?.login === owner && p.headRefName.startsWith(branchPrefix)).length +
    busy;
  console.log(
    JSON.stringify(
      {
        parallel: config.parallel,
        freeSlots: startedToday >= config.maxTasksPerDay ? 0 : Math.max(0, config.parallel - busy),
        startedToday,
        maxTasksPerDay: config.maxTasksPerDay,
        ready: ready.map(({ number, title }) => ({ number, title })),
        working: working.map(({ number, title }) => ({ number, title })),
        prs: detailed,
        ideas: {
          open: ideas.length,
          openedToday: ideas.filter((i) => i.createdAt.startsWith(today)).length,
          perDay: config.ideasPerDay,
        },
      },
      null,
      2,
    ),
  );
}

function show(n) {
  const issue = getIssue(n);
  assertOwnerIssue(issue);
  console.log(
    JSON.stringify(
      {
        number: issue.number,
        title: issue.title,
        body: issue.body,
        labels: labelNames(issue),
        ownerComments: ownerComments(issue),
      },
      null,
      2,
    ),
  );
}

function claim(n) {
  const issue = getIssue(n);
  assertOwnerIssue(issue);
  const labels = labelNames(issue);
  if (!labels.includes('agent-ready')) fail(`issue #${n} is not labeled agent-ready`);
  if (labels.includes('agent-working')) fail(`issue #${n} is already being worked on`);
  setLabels('issue', n, { add: ['agent-working'], remove: ['agent-ready', 'agent-stuck'] });
  comment('issue', n, `🤖 Started. Branch: \`${branchPrefix}${n}-…\``);
  console.log(`claimed #${n}`);
}

function openPr(args) {
  const n = issueNumber(option(args, '--issue'));
  const title = option(args, '--title');
  if (!title) fail('--title is required');
  const body = readBody(args);
  const issue = getIssue(n);
  assertOwnerIssue(issue);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch.startsWith(`${branchPrefix}${n}-`))
    fail(`branch ${branch} must be named ${branchPrefix}${n}-<short-name>`);
  if (git(['status', '--porcelain']))
    fail('the working tree has uncommitted changes; commit them first');
  const ahead = Number(git(['rev-list', '--count', `origin/${base}..HEAD`]));
  if (ahead === 0) fail(`no commits on top of origin/${base}`);
  git(['push', '-u', 'origin', `${branch}:${branch}`]);
  const url = gh([
    'pr',
    'create',
    '--repo',
    repo,
    '--base',
    base,
    '--head',
    branch,
    '--title',
    title,
    '--body',
    `${body}\n\nWorks on #${n}.`,
  ]).trim();
  const prNumber = issueNumber(url.split('/').pop());
  setLabels('pr', prNumber, { add: ['agent-review'] });
  setLabels('issue', n, { add: ['agent-review'], remove: ['agent-working'] });
  comment('issue', n, `🤖 PR opened: ${url}`);
  console.log(url);
}

function updatePr(n, args) {
  const body = readBody(args);
  const pr = getPr(n);
  assertAgentPr(pr);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== pr.headRefName) fail(`checked out ${branch}, but PR #${n} is ${pr.headRefName}`);
  if (git(['status', '--porcelain']))
    fail('the working tree has uncommitted changes; commit them first');
  git(['push', 'origin', `${branch}:${branch}`]);
  setLabels('pr', n, { add: ['agent-review'], remove: ['needs-you'] });
  comment(
    'pr',
    n,
    `🤖 Updated:

${body}`,
  );
  console.log(`pushed ${branch} to #${n}`);
}

function verdict(n, kind, args) {
  if (kind !== 'approve' && kind !== 'changes') fail('verdict must be approve or changes');
  const body = readBody(args);
  const pr = getPr(n);
  assertAgentPr(pr);
  comment(
    'pr',
    n,
    `🤖 Review (${kind}):\n\n${body}\n\n<!-- agent-review:${kind} sha=${pr.headRefOid} -->`,
  );
  console.log(`${kind} recorded for #${n} at ${pr.headRefOid.slice(0, 7)}`);
}

function merge(n, dryRun) {
  const pr = getPr(n);
  assertAgentPr(pr);
  const ci = ciState(pr);
  const review = reviewState(pr);
  const risk = classify(pr.files, config);
  const blockers = [];
  if (ci !== 'pass' && ci !== 'none-needed') blockers.push(`checks are ${ci}`);
  if (review !== 'approve') blockers.push(`review is ${review}`);
  if (pr.mergeable === 'CONFLICTING') blockers.push('it conflicts with the base branch');
  const verdictLine = { pr: n, ci, review, risk, mergeable: pr.mergeable };
  if (blockers.length) {
    console.log(JSON.stringify({ ...verdictLine, merged: false, waitingFor: blockers }, null, 2));
    return;
  }
  if (risk.level !== 'low') {
    const mark = NEEDS_YOU_MARK(pr.headRefOid);
    const already = ownerComments(pr).some((c) => c.body.includes(mark));
    if (!dryRun && !already) {
      setLabels('pr', n, { add: ['needs-you'], remove: ['agent-review'] });
      comment(
        'pr',
        n,
        `🤖 Checks and review passed, but this needs you to merge:\n${risk.reasons.map((r) => `- ${r}`).join('\n')}\n\n${mark}`,
      );
    }
    console.log(JSON.stringify({ ...verdictLine, merged: false, needsYou: risk.reasons }, null, 2));
    return;
  }
  if (dryRun) {
    console.log(JSON.stringify({ ...verdictLine, merged: false, wouldMerge: true }, null, 2));
    return;
  }
  gh([
    'pr',
    'merge',
    String(n),
    '--repo',
    repo,
    '--squash',
    '--delete-branch',
    '--match-head-commit',
    pr.headRefOid,
  ]);
  const issue = linkedIssue(pr);
  if (issue) {
    setLabels('issue', issue, { remove: ['agent-review', 'agent-working'] });
    gh([
      'issue',
      'close',
      String(issue),
      '--repo',
      repo,
      '--comment',
      `🤖 Done in #${n} (merged into ${base}).`,
    ]);
  }
  console.log(JSON.stringify({ ...verdictLine, merged: true }, null, 2));
}

function stuck(n, args) {
  const body = readBody(args);
  const issue = getIssue(n);
  assertOwnerIssue(issue);
  setLabels('issue', n, { add: ['agent-stuck'], remove: ['agent-working'] });
  comment('issue', n, `🤖 Stuck:\n\n${body}`);
  console.log(`marked #${n} stuck`);
}

function idea(args) {
  const title = option(args, '--title');
  if (!title) fail('--title is required');
  const body = readBody(args);
  const today = new Date().toISOString().slice(0, 10);
  const openedToday = listIssues('agent-idea').filter((i) => i.createdAt.startsWith(today)).length;
  if (openedToday >= config.ideasPerDay)
    fail(`already opened ${openedToday} ideas today (limit ${config.ideasPerDay})`);
  const url = gh([
    'issue',
    'create',
    '--repo',
    repo,
    '--title',
    title,
    '--body',
    body,
    '--label',
    'agent-idea',
  ]).trim();
  console.log(url);
}

const [command, ...rest] = process.argv.slice(2);
try {
  switch (command) {
    case 'status':
      status();
      break;
    case 'show':
      show(issueNumber(rest[0]));
      break;
    case 'claim':
      claim(issueNumber(rest[0]));
      break;
    case 'open-pr':
      openPr(rest);
      break;
    case 'update-pr':
      updatePr(issueNumber(rest[0]), rest);
      break;
    case 'verdict':
      verdict(issueNumber(rest[0]), rest[1], rest);
      break;
    case 'merge':
      merge(issueNumber(rest[0]), rest.includes('--dry-run'));
      break;
    case 'stuck':
      stuck(issueNumber(rest[0]), rest);
      break;
    case 'idea':
      idea(rest);
      break;
    default:
      fail(`unknown command: ${command ?? '(none)'}`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
