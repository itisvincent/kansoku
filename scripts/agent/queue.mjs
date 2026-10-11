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
//   node scripts/agent/queue.mjs lock | unlock      (one manager round at a time)
//
// Everything is done as the bot (config.bot, see bot.mjs). Two identities matter:
// - the owner: opens work issues, adds `agent-ready`, comments with feedback, merges risky PRs;
// - the bot: claims, opens PRs, reviews, merges, and writes every 🤖 comment.
// Comments are read through the REST API, where the bot is `<slug>[bot]` — a name no person
// can register — so a comment is the bot's only if GitHub says so.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { botToken, isBotLogin, pushArgs } from './bot.mjs';
import { classify, isReleaseChange, RELEASE_BRANCH } from './risk.mjs';
import {
  ciFromChecks,
  claimedAt,
  isStaleClaim,
  isStaleLock,
  labelAddedBy,
  localDay,
} from './state.mjs';

const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const { repo, owner, base, branchPrefix, timeZone } = config;
const slug = config.bot.slug;
const today = () => localDay(new Date(), timeZone);
const REVIEW_MARK = /<!-- agent-review:(approve|changes) sha=([0-9a-f]{7,40}) -->/;
const NEEDS_YOU_MARK = (sha) => `<!-- agent-needs-you sha=${sha} -->`;
let token = '';

function run(cmd, args, { allowFail = false } = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GH_TOKEN: token },
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFail) {
    // Never print the bot's login, which sits in the push arguments.
    const shown = args.map((a) => (a.includes('extraheader') ? '<bot login>' : a)).join(' ');
    throw new Error(`${cmd} ${shown} failed (${result.status}): ${result.stderr.trim()}`);
  }
  return result;
}
const gh = (args) => run('gh', args).stdout;
const ghJson = (args) => JSON.parse(gh(args) || 'null');
const ghLines = (args) =>
  gh(args)
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
const git = (args) => run('git', args).stdout.trim();

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
const isBot = (login) => isBotLogin(login, slug);

/** Every comment on an issue or PR, oldest first, with GitHub's own account names. */
function comments(n) {
  return ghLines([
    'api',
    `repos/${repo}/issues/${n}/comments`,
    '--paginate',
    '--jq',
    '.[] | {login: .user.login, body: .body, at: .created_at}',
  ]);
}
const ownerComments = (list) => list.filter((c) => c.login === owner);
const botComments = (list) => list.filter((c) => isBot(c.login));

function labelEvents(n) {
  return ghLines([
    'api',
    `repos/${repo}/issues/${n}/events`,
    '--paginate',
    '--jq',
    '.[] | select(.event == "labeled") | {event: .event, label: {name: .label.name}, actor: {login: .actor.login}}',
  ]);
}

function getIssue(n) {
  return ghJson([
    'issue',
    'view',
    String(n),
    '--repo',
    repo,
    '--json',
    'number,title,body,author,labels,state,createdAt',
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
    'number,title,author,labels,state,files,headRefName,headRefOid,baseRefName,isCrossRepository,mergeable',
  ]);
}

/**
 * Work issues come from the owner, or are the bot's own ideas the owner approved. The fork is
 * public, so anyone else's issue is ignored.
 */
function isTrustedIssue(issue) {
  const login = issue.author?.login;
  return login === owner || (isBot(login) && labelNames(issue).includes('agent-idea'));
}

function assertTrustedIssue(issue) {
  if (!isTrustedIssue(issue))
    fail(`issue #${issue.number} was not opened by ${owner} (or is not an agent idea)`);
  if (issue.state !== 'OPEN') fail(`issue #${issue.number} is not open`);
}

const approvedByOwner = (n) => labelAddedBy(labelEvents(n), 'agent-ready') === owner;

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

const isReleasePr = (pr) => pr.headRefName.startsWith(RELEASE_BRANCH);

function releaseFiles(n) {
  return ghJson(['api', `repos/${repo}/pulls/${n}/files?per_page=100`]);
}

function ciState(pr) {
  const result = run(
    'gh',
    ['pr', 'checks', String(pr.number), '--repo', repo, '--json', 'name,bucket'],
    { allowFail: true },
  );
  return ciFromChecks(result, config.requiredChecks);
}

/** The latest review verdict (the bot's, or the owner's own) for the PR's current head commit. */
function reviewState(pr, list) {
  const trusted = list.filter((c) => c.login === owner || isBot(c.login));
  for (const c of [...trusted].reverse()) {
    const m = c.body.match(REVIEW_MARK);
    if (!m) continue;
    return pr.headRefOid.startsWith(m[2]) ? m[1] : 'stale';
  }
  return 'none';
}

/** The owner's comments since the bot last said something on the PR. */
function pendingFeedback(list) {
  let lastBot = -1;
  list.forEach((c, i) => {
    if (isBot(c.login)) lastBot = i;
  });
  return ownerComments(list.slice(lastBot + 1)).map(({ at, body }) => ({ at, body }));
}

function assertAgentPr(pr) {
  if (pr.isCrossRepository) fail(`PR #${pr.number} comes from another repository`);
  if (!isBot(pr.author?.login)) fail(`PR #${pr.number} was not opened by the bot`);
  if (pr.baseRefName !== base) fail(`PR #${pr.number} targets ${pr.baseRefName}, not ${base}`);
  if (!pr.headRefName.startsWith(branchPrefix)) fail(`PR #${pr.number} is not an agent branch`);
  if (pr.state !== 'OPEN') fail(`PR #${pr.number} is not open`);
}

function listIssues(label, state = 'open') {
  return ghJson([
    'issue',
    'list',
    '--repo',
    repo,
    '--state',
    state,
    '--label',
    label,
    '--json',
    'number,title,author,labels,createdAt,state',
    '--limit',
    '100',
  ]).filter(isTrustedIssue);
}

function describePr(p) {
  const pr = getPr(p.number);
  const list = comments(pr.number);
  if (isReleasePr(pr)) {
    return {
      number: pr.number,
      title: pr.title,
      release: true,
      onlyVersionBump: isReleaseChange(pr.headRefName, releaseFiles(pr.number)),
      ci: ciState(pr),
      mergeable: pr.mergeable,
    };
  }
  return {
    number: pr.number,
    title: pr.title,
    issue: linkedIssue(pr),
    labels: labelNames(pr),
    ci: ciState(pr),
    review: reviewState(pr, list),
    risk: classify(pr.files, config),
    mergeable: pr.mergeable,
    feedback: pendingFeedback(list),
    changesRequested: botComments(list).filter((c) => /agent-review:changes/.test(c.body)).length,
  };
}

function status() {
  const labeledReady = listIssues('agent-ready').filter(
    (i) => !labelNames(i).includes('agent-working'),
  );
  const ready = labeledReady.filter((i) => approvedByOwner(i.number));
  const working = listIssues('agent-working');
  const agentPrs = ghJson([
    'pr',
    'list',
    '--repo',
    repo,
    '--state',
    'all',
    '--json',
    'number,title,headRefName,author,state,createdAt',
    '--limit',
    '100',
  ]).filter((p) => isBot(p.author?.login) && p.headRefName.startsWith(branchPrefix));
  const day = today();
  const ideas = listIssues('agent-idea', 'all');
  const detailed = agentPrs.filter((p) => p.state === 'OPEN').map(describePr);
  const busy = working.length;
  const startedToday =
    agentPrs.filter(
      (p) => !p.headRefName.startsWith(RELEASE_BRANCH) && localDay(p.createdAt, timeZone) === day,
    ).length + busy;
  const linkedIssues = new Set(detailed.map((p) => p.issue));
  const workingDetail = working.map(({ number, title, createdAt }) => {
    const startedAt = claimedAt({ createdAt, comments: botComments(comments(number)) });
    const stale = !linkedIssues.has(number) && isStaleClaim(startedAt, config.workingTimeoutHours);
    return { number, title, startedAt, stale };
  });
  console.log(
    JSON.stringify(
      {
        parallel: config.parallel,
        freeSlots: startedToday >= config.maxTasksPerDay ? 0 : Math.max(0, config.parallel - busy),
        startedToday,
        maxTasksPerDay: config.maxTasksPerDay,
        ready: ready.map(({ number, title }) => ({ number, title })),
        // Labeled agent-ready, but not by the owner: never work on these.
        notApproved: labeledReady
          .filter((i) => !ready.includes(i))
          .map(({ number, title }) => ({ number, title })),
        working: workingDetail,
        prs: detailed,
        ideas: {
          open: ideas.filter((i) => i.state === 'OPEN').length,
          openedToday: ideas.filter((i) => localDay(i.createdAt, timeZone) === day).length,
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
  assertTrustedIssue(issue);
  console.log(
    JSON.stringify(
      {
        number: issue.number,
        title: issue.title,
        body: issue.body,
        labels: labelNames(issue),
        ownerComments: ownerComments(comments(n)).map(({ at, body }) => ({ at, body })),
      },
      null,
      2,
    ),
  );
}

function claim(n) {
  const issue = getIssue(n);
  assertTrustedIssue(issue);
  const labels = labelNames(issue);
  if (!labels.includes('agent-ready')) fail(`issue #${n} is not labeled agent-ready`);
  if (!approvedByOwner(n)) fail(`agent-ready on #${n} was not added by ${owner}`);
  if (labels.includes('agent-working')) fail(`issue #${n} is already being worked on`);
  setLabels('issue', n, { add: ['agent-working'], remove: ['agent-ready', 'agent-stuck'] });
  comment('issue', n, `🤖 Started. Branch: \`${branchPrefix}${n}-…\``);
  console.log(`claimed #${n}`);
}

function pushBranch(branch) {
  git(pushArgs(token, repo, `${branch}:refs/heads/${branch}`));
}

function openPr(args) {
  const n = issueNumber(option(args, '--issue'));
  const title = option(args, '--title');
  if (!title) fail('--title is required');
  const body = readBody(args);
  const issue = getIssue(n);
  assertTrustedIssue(issue);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch.startsWith(`${branchPrefix}${n}-`))
    fail(`branch ${branch} must be named ${branchPrefix}${n}-<short-name>`);
  if (git(['status', '--porcelain']))
    fail('the working tree has uncommitted changes; commit them first');
  const ahead = Number(git(['rev-list', '--count', `origin/${base}..HEAD`]));
  if (ahead === 0) fail(`no commits on top of origin/${base}`);
  pushBranch(branch);
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
  pushBranch(branch);
  setLabels('pr', n, { add: ['agent-review'], remove: ['needs-you'] });
  comment('pr', n, `🤖 Updated:\n\n${body}`);
  console.log(`pushed ${branch} to #${n}`);
}

function verdict(n, kind, args) {
  if (kind !== 'approve' && kind !== 'changes') fail('verdict must be approve or changes');
  const body = readBody(args);
  const pr = getPr(n);
  assertAgentPr(pr);
  if (isReleasePr(pr)) fail('release PRs are not reviewed; they merge on passing checks');
  comment(
    'pr',
    n,
    `🤖 Review (${kind}):\n\n${body}\n\n<!-- agent-review:${kind} sha=${pr.headRefOid} -->`,
  );
  console.log(`${kind} recorded for #${n} at ${pr.headRefOid.slice(0, 7)}`);
}

function squashMerge(pr) {
  gh([
    'pr',
    'merge',
    String(pr.number),
    '--repo',
    repo,
    '--squash',
    '--delete-branch',
    '--match-head-commit',
    pr.headRefOid,
  ]);
}

function mergeRelease(pr, dryRun) {
  const ci = ciState(pr);
  const blockers = [];
  if (!isReleaseChange(pr.headRefName, releaseFiles(pr.number)))
    blockers.push('it changes more than the version and the changelog');
  if (ci !== 'pass') blockers.push(`checks are ${ci}`);
  if (pr.mergeable === 'CONFLICTING') blockers.push('it conflicts with the base branch');
  const line = { pr: pr.number, release: true, ci, mergeable: pr.mergeable };
  if (blockers.length || dryRun) {
    console.log(
      JSON.stringify(
        {
          ...line,
          merged: false,
          ...(blockers.length ? { waitingFor: blockers } : { wouldMerge: true }),
        },
        null,
        2,
      ),
    );
    return;
  }
  squashMerge(pr);
  console.log(JSON.stringify({ ...line, merged: true }, null, 2));
}

function merge(n, dryRun) {
  const pr = getPr(n);
  assertAgentPr(pr);
  if (isReleasePr(pr)) {
    mergeRelease(pr, dryRun);
    return;
  }
  const list = comments(n);
  const ci = ciState(pr);
  const review = reviewState(pr, list);
  const risk = classify(pr.files, config);
  const blockers = [];
  if (ci !== 'pass') blockers.push(`checks are ${ci}`);
  if (review !== 'approve') blockers.push(`review is ${review}`);
  if (pr.mergeable === 'CONFLICTING') blockers.push('it conflicts with the base branch');
  const verdictLine = { pr: n, ci, review, risk, mergeable: pr.mergeable };
  if (blockers.length) {
    console.log(JSON.stringify({ ...verdictLine, merged: false, waitingFor: blockers }, null, 2));
    return;
  }
  if (risk.level !== 'low') {
    const mark = NEEDS_YOU_MARK(pr.headRefOid);
    const already = botComments(list).some((c) => c.body.includes(mark));
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
  squashMerge(pr);
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
  assertTrustedIssue(issue);
  setLabels('issue', n, { add: ['agent-stuck'], remove: ['agent-working'] });
  comment('issue', n, `🤖 Stuck:\n\n${body}`);
  console.log(`marked #${n} stuck`);
}

function idea(args) {
  const title = option(args, '--title');
  if (!title) fail('--title is required');
  const body = readBody(args);
  const day = today();
  const openedToday = listIssues('agent-idea', 'all').filter(
    (i) => isBot(i.author?.login) && localDay(i.createdAt, timeZone) === day,
  ).length;
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

/** The round lock lives in the shared .git folder, so every worktree of the checkout sees it. */
function lockPath() {
  return join(resolve(git(['rev-parse', '--git-common-dir'])), 'agent-round.lock');
}

function lock() {
  const path = lockPath();
  let held = null;
  if (existsSync(path)) {
    try {
      held = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      held = { at: 'an unreadable time' }; // isStaleLock treats it as stale
    }
  }
  if (held && !isStaleLock(held.at, config.roundLockMinutes)) {
    fail(`another round has been running since ${held.at}; stop this one`);
  }
  writeFileSync(path, JSON.stringify({ at: new Date().toISOString(), pid: process.ppid }));
  console.log(held ? `took over a stale lock from ${held.at}` : 'locked');
}

function unlock() {
  rmSync(lockPath(), { force: true });
  console.log('unlocked');
}

const [command, ...rest] = process.argv.slice(2);
try {
  // The lock needs no GitHub login, so it works even when GitHub is down.
  if (command !== 'lock' && command !== 'unlock') token = await botToken(config);
  switch (command) {
    case 'lock':
      lock();
      break;
    case 'unlock':
      unlock();
      break;
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
