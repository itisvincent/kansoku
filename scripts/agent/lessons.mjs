// The agent queue's lessons file: what the daily review learned from the queue's own mistakes
// and successes. Pure helpers, kept apart from queue.mjs so they can be tested.
//
// Agents never edit LESSONS.md themselves (the guard refuses scripts/agent); the daily review
// hands `queue.mjs lessons` a small JSON review, and these helpers turn it into the new file.
import { localDay } from './state.mjs';

export const LESSONS_PATH = 'scripts/agent/LESSONS.md';
export const LESSONS_BRANCH = 'agent/lessons-';
/** A lesson seen on this many different days becomes a rule (and needs the owner to merge). */
export const PROMOTE_AFTER_DAYS = 3;
export const MAX_NEW_PER_REVIEW = 3;

const KINDS = ['avoid', 'keep'];
const HEADING = /^### (L\d+) · (avoid|keep)\b.*$/;
const SIGHTING = /^(\d{4}-\d{2}-\d{2}) \(([^)]*)\)$/;

const INTRO = `# Agent lessons

What the agent queue has learned from its own mistakes and successes. The daily review
(\`scripts/agent/RETRO.md\`) writes it through \`node scripts/agent/queue.mjs lessons\`; the owner
may edit it by hand; the next lessons PR rewrites the file into this form and waits for the owner.
Workers read it before starting; reviewers check each PR against it.

A lesson seen on ${PROMOTE_AFTER_DAYS} different days moves up to **Rules**. That move needs the
owner: a lessons PR that changes the rules waits for them to merge it.`;

const RULES_INTRO = 'Must be followed. A reviewer asks for changes when a PR breaks one.';
const LESSONS_INTRO =
  'Should be followed. `avoid` = a mistake not to repeat; `keep` = something that worked.';

const days = (entry) => new Set(entry.seen.map((s) => s.day)).size;

function renderEntry(entry) {
  const seen = entry.seen.map((s) => `${s.day} (${s.refs.map((r) => `#${r}`).join(', ')})`);
  const count = days(entry);
  return [
    `### ${entry.id} · ${entry.kind} · seen on ${count} ${count === 1 ? 'day' : 'days'}`,
    `Rule: ${entry.rule}`,
    `Why: ${entry.why}`,
    `Seen: ${seen.join('; ')}`.trimEnd(),
  ].join('\n');
}

function renderSection(title, intro, entries) {
  const body = entries.length ? entries.map(renderEntry).join('\n\n') : '_None yet._';
  return `## ${title}\n\n${intro}\n\n${body}`;
}

/** The whole file for `book` ({ rules, lessons }). */
export function renderLessons(book) {
  return `${[
    INTRO,
    renderSection('Rules', RULES_INTRO, book.rules),
    renderSection('Lessons', LESSONS_INTRO, book.lessons),
  ].join('\n\n')}\n`;
}

function parseSeen(id, text) {
  if (!text) return [];
  return text.split('; ').map((part) => {
    const m = part.match(SIGHTING);
    if (!m) throw new Error(`${id}: cannot read the sighting "${part}"`);
    const refs = m[2].split(', ').map((r) => Number.parseInt(r.replace('#', ''), 10));
    if (refs.some((r) => !Number.isInteger(r))) throw new Error(`${id}: bad refs in "${part}"`);
    return { day: m[1], refs };
  });
}

function parseEntry(id, kind, lines) {
  const fields = {};
  for (const line of lines) {
    const m = line.match(/^(Rule|Why|Seen):\s?(.*)$/);
    if (!m) throw new Error(`${id}: unexpected line "${line}" (each entry has Rule / Why / Seen)`);
    if (m[1] in fields) throw new Error(`${id}: the ${m[1]} line is written twice`);
    fields[m[1]] = m[2].trim();
  }
  if (!fields.Rule || !fields.Why || fields.Seen === undefined) {
    throw new Error(`${id}: an entry needs a Rule, a Why and a Seen line`);
  }
  return { id, kind, rule: fields.Rule, why: fields.Why, seen: parseSeen(id, fields.Seen) };
}

/**
 * Reads the file into { rules, lessons }. Anything it cannot read is an error, not a dropped
 * entry: a lesson that silently vanished would never be promoted.
 */
export function parseLessons(text) {
  const book = { rules: [], lessons: [] };
  const ids = new Set();
  let section = null;
  let entry = null;
  const close = () => {
    if (!entry) return;
    if (!section) throw new Error(`${entry.id} sits outside the Rules and Lessons sections`);
    if (ids.has(entry.id)) throw new Error(`${entry.id} appears twice`);
    ids.add(entry.id);
    book[section].push(parseEntry(entry.id, entry.kind, entry.lines));
    entry = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith('## ')) {
      close();
      const title = line.slice(3).trim();
      section = title === 'Rules' ? 'rules' : title === 'Lessons' ? 'lessons' : null;
      continue;
    }
    const heading = line.match(HEADING);
    if (heading) {
      close();
      entry = { id: heading[1], kind: heading[2], lines: [] };
      continue;
    }
    if (line.startsWith('### ')) throw new Error(`cannot read the entry heading "${line}"`);
    if (entry && line) entry.lines.push(line);
  }
  close();
  return book;
}

function addSighting(entry, day, refs) {
  const same = entry.seen.find((s) => s.day === day);
  const merged = [...new Set([...(same?.refs ?? []), ...refs])].sort((a, b) => a - b);
  const seen = same
    ? entry.seen.map((s) => (s === same ? { day, refs: merged } : s))
    : [...entry.seen, { day, refs: merged }];
  return { ...entry, seen };
}

/**
 * Applies a review ({ add, seen }) on `day`. Returns the new book and what changed; a lesson
 * seen on PROMOTE_AFTER_DAYS different days moves to the rules.
 */
export function applyReview(book, review, day) {
  const seenIds = (review.seen ?? []).map((s) => s.id);
  const bump = (entry) => {
    const hit = (review.seen ?? []).find((s) => s.id === entry.id);
    return hit ? addSighting(entry, day, hit.refs) : entry;
  };
  const rules = book.rules.map(bump);
  let lessons = book.lessons.map(bump);
  const used = [...book.rules, ...book.lessons].map((e) => Number(e.id.slice(1)));
  let next = Math.max(0, ...used);
  const added = (review.add ?? []).map((a) => {
    next += 1;
    return addSighting(
      { id: `L${next}`, kind: a.kind, rule: a.rule, why: a.why, seen: [] },
      day,
      a.refs,
    );
  });
  lessons = [...lessons, ...added];
  // Only what this review saw moves up: a promotion is always backed by today's evidence.
  const ripe = lessons.filter((e) => seenIds.includes(e.id) && days(e) >= PROMOTE_AFTER_DAYS);
  return {
    book: { rules: [...rules, ...ripe], lessons: lessons.filter((e) => !ripe.includes(e)) },
    added: added.map((e) => e.id),
    seen: seenIds,
    promoted: ripe.map((e) => e.id),
  };
}

function oneLine(value, field, min, max) {
  if (typeof value !== 'string') throw new Error(`${field} must be text`);
  if (/[\r\n]/.test(value)) throw new Error(`${field} must be one line`);
  const text = value.trim();
  if (text.length < min || text.length > max) {
    throw new Error(`${field} must be ${min}–${max} characters`);
  }
}

function checkRefs(refs, where) {
  const ok =
    Array.isArray(refs) &&
    refs.length > 0 &&
    refs.length <= 10 &&
    refs.every((r) => Number.isInteger(r) && r > 0);
  if (!ok) throw new Error(`${where}: refs must be 1–10 PR or issue numbers`);
}

/** Throws a plain-English reason when `review` is not something applyReview should take. */
export function validateReview(review, book) {
  if (!review || typeof review !== 'object') throw new Error('the review must be a JSON object');
  const add = review.add ?? [];
  const seen = review.seen ?? [];
  if (!Array.isArray(add) || !Array.isArray(seen)) throw new Error('add and seen must be lists');
  if (!add.length && !seen.length) throw new Error('nothing to record; use --none instead');
  if (add.length > MAX_NEW_PER_REVIEW) {
    throw new Error(`at most ${MAX_NEW_PER_REVIEW} new lessons per review`);
  }
  add.forEach((a, i) => {
    if (!KINDS.includes(a?.kind)) throw new Error(`add[${i}]: kind must be avoid or keep`);
    oneLine(a.rule, `add[${i}] rule`, 10, 300);
    oneLine(a.why, `add[${i}] why`, 10, 600);
    checkRefs(a.refs, `add[${i}]`);
  });
  const known = new Set([...book.rules, ...book.lessons].map((e) => e.id));
  const listed = new Set();
  for (const s of seen) {
    if (!known.has(s?.id)) throw new Error(`${s?.id} is not in the lessons file`);
    if (listed.has(s.id)) throw new Error(`${s.id} is listed twice`);
    listed.add(s.id);
    checkRefs(s.refs, s.id);
  }
}

const ruleKey = (book) =>
  JSON.stringify(book.rules.map(({ id, kind, rule, why }) => ({ id, kind, rule, why })));

/** Whether the rules (not just their sightings) differ between two versions of the file. */
export function rulesChanged(baseText, headText) {
  return ruleKey(parseLessons(baseText)) !== ruleKey(parseLessons(headText));
}

const isGenerated = (text) => text.replaceAll('\r\n', '\n') === renderLessons(parseLessons(text));

/**
 * What a lessons PR does to the file, from the base and head versions:
 * - 'sightings': only new lessons and sightings; safe to merge on passing checks.
 * - 'rules': it adds, removes or rewords a rule.
 * - 'unreadable': either version cannot be read.
 * - 'base-edited': the base was edited by hand and the PR rewrites it into the standard form.
 * - 'not-generated': the head is not exactly what the review writes (loose text, extra
 *   headings, a deleted file), so the rule check alone cannot be trusted.
 * Everything but 'sightings' waits for the owner.
 */
export function lessonsChange(baseText, headText) {
  try {
    if (!isGenerated(headText)) return 'not-generated';
    if (baseText && !isGenerated(baseText)) return 'base-edited';
    return rulesChanged(baseText, headText) ? 'rules' : 'sightings';
  } catch {
    return 'unreadable';
  }
}

/** A lessons PR from `queue.mjs lessons`: its only change adds or edits the lessons file. */
export function isLessonsChange(branch, files) {
  const [file] = files;
  return (
    branch.startsWith(LESSONS_BRANCH) &&
    files.length === 1 &&
    file.filename.replaceAll('\\', '/') === LESSONS_PATH &&
    (file.status === 'modified' || file.status === 'added') &&
    !file.previous_filename
  );
}

/**
 * Reads `git log --format=%x1e%H%x1f%an%x1f%aI%x1f%s --name-only` into
 * { sha, author, at, subject, files }.
 */
export function parseGitLog(text) {
  return text
    .split('\x1e')
    .filter((record) => record.trim())
    .map((record) => {
      const [head, ...rest] = record.split('\n');
      const [sha, author, at, subject] = head.split('\x1f');
      return { sha, author, at, subject, files: rest.map((l) => l.trim()).filter(Boolean) };
    });
}

// Files every release and lessons PR touches; sharing them says nothing about a hand fix.
const BOOKKEEPING = new Set([
  LESSONS_PATH,
  'apps/desktop/CHANGELOG.md',
  'apps/desktop/package.json',
]);

/**
 * The owner's commits (authored under one of `owners`) since `since` that touch files an agent
 * commit changed in the `lookbackDays` before: work the owner redid by hand.
 */
export function handFixes(commits, { since, bot, owners, lookbackDays }) {
  const start = Date.parse(since);
  const agent = commits.filter((c) => c.author === bot);
  return commits
    .filter((c) => owners.includes(c.author) && Date.parse(c.at) >= start)
    .map((human) => {
      const at = Date.parse(human.at);
      const own = new Set(human.files.filter((f) => !BOOKKEEPING.has(f)));
      const earlier = agent.filter((a) => {
        const t = Date.parse(a.at);
        return t < at && t >= at - lookbackDays * 86_400_000 && a.files.some((f) => own.has(f));
      });
      const shared = [...new Set(earlier.flatMap((a) => a.files.filter((f) => own.has(f))))].sort();
      return {
        sha: human.sha,
        subject: human.subject,
        at: human.at,
        files: shared,
        agentCommits: earlier.map((a) => {
          const pr = a.subject.match(/\(#(\d+)\)\s*$/);
          return { sha: a.sha, subject: a.subject, pr: pr ? Number(pr[1]) : null };
        }),
      };
    })
    .filter((fix) => fix.agentCommits.length > 0);
}

function localHour(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' });
  return Number(parts.formatToParts(now).find((p) => p.type === 'hour').value);
}

/**
 * Whether the daily review is due: once a local day, from `hour` on, and never while a lessons
 * PR is still open. `marker` is the last review ({ day, at }) or null. `since` is where the
 * review's window starts: where the last review stopped reading, or a day back, never more than
 * a week; `cut` says the week limit dropped older activity.
 */
export function retroDue({ marker, openLessonsPr, now = new Date(), timeZone, hour }) {
  const week = new Date(now.getTime() - 7 * 86_400_000);
  const from = marker?.at ? new Date(marker.at) : new Date(now.getTime() - 86_400_000);
  const cut = !(Number.isFinite(from.getTime()) && from > week);
  const window = { since: (cut ? week : from).toISOString(), cut };
  if (openLessonsPr)
    return { due: false, ...window, reason: `lessons PR #${openLessonsPr} is still open` };
  if (marker?.day === localDay(now, timeZone))
    return { due: false, ...window, reason: 'already ran today' };
  if (localHour(now, timeZone) < hour)
    return { due: false, ...window, reason: `not before ${hour}:00` };
  return { due: true, ...window };
}
