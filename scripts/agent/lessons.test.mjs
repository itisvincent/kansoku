import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyReview,
  handFixes,
  isLessonsChange,
  lessonsChange,
  LESSONS_PATH,
  parseGitLog,
  parseLessons,
  renderLessons,
  retroDue,
  rulesChanged,
  validateReview,
} from './lessons.mjs';

const lesson = (id, days, overrides = {}) => ({
  id,
  kind: 'avoid',
  rule: `Rule text for ${id} that is long enough`,
  why: `Why text for ${id} that is long enough`,
  seen: days.map((day, i) => ({ day, refs: [10 + i] })),
  ...overrides,
});

test('an empty book renders and reads back as empty', () => {
  const text = renderLessons({ rules: [], lessons: [] });
  assert.match(text, /^# Agent lessons/);
  assert.deepEqual(parseLessons(text), { rules: [], lessons: [] });
});

test('a missing file reads as an empty book', () => {
  assert.deepEqual(parseLessons(''), { rules: [], lessons: [] });
});

test('entries survive a render and parse round trip', () => {
  const book = {
    rules: [lesson('L1', ['2026-10-01', '2026-10-03', '2026-10-05'])],
    lessons: [
      lesson('L2', ['2026-10-04'], { kind: 'keep' }),
      {
        ...lesson('L3', []),
        seen: [{ day: '2026-10-06', refs: [12, 15] }],
      },
    ],
  };
  assert.deepEqual(parseLessons(renderLessons(book)), book);
});

test('a malformed entry is refused rather than silently dropped', () => {
  const text = renderLessons({ rules: [], lessons: [lesson('L1', ['2026-10-01'])] }).replace(
    'Why: ',
    'Because: ',
  );
  assert.throws(() => parseLessons(text), /L1/);
});

test('a new lesson gets the next free number and today as its first sighting', () => {
  const book = { rules: [lesson('L4', ['2026-10-01'])], lessons: [lesson('L2', ['2026-10-02'])] };
  const { book: next, added } = applyReview(
    book,
    { add: [{ kind: 'keep', rule: 'Do the thing well', why: 'It worked in #20', refs: [20] }] },
    '2026-10-13',
  );
  assert.deepEqual(added, ['L5']);
  assert.deepEqual(next.lessons.at(-1), {
    id: 'L5',
    kind: 'keep',
    rule: 'Do the thing well',
    why: 'It worked in #20',
    seen: [{ day: '2026-10-13', refs: [20] }],
  });
  // The input book is not changed.
  assert.equal(book.lessons.length, 1);
});

test('seeing a lesson twice on one day counts as one day', () => {
  const book = { rules: [], lessons: [lesson('L1', ['2026-10-13'])] };
  const { book: next } = applyReview(book, { seen: [{ id: 'L1', refs: [30, 10] }] }, '2026-10-13');
  assert.deepEqual(next.lessons[0].seen, [{ day: '2026-10-13', refs: [10, 30] }]);
});

test('a lesson seen on its third different day becomes a rule', () => {
  const book = {
    rules: [],
    lessons: [lesson('L1', ['2026-10-01', '2026-10-05']), lesson('L2', [])],
  };
  const { book: next, promoted } = applyReview(
    book,
    { seen: [{ id: 'L1', refs: [40] }] },
    '2026-10-13',
  );
  assert.deepEqual(promoted, ['L1']);
  assert.deepEqual(
    next.rules.map((r) => r.id),
    ['L1'],
  );
  assert.deepEqual(
    next.lessons.map((r) => r.id),
    ['L2'],
  );
  assert.equal(next.rules[0].seen.length, 3);
});

test('seeing a rule again records it but promotes nothing', () => {
  const book = { rules: [lesson('L1', ['2026-10-01', '2026-10-02', '2026-10-03'])], lessons: [] };
  const { book: next, promoted } = applyReview(
    book,
    { seen: [{ id: 'L1', refs: [50] }] },
    '2026-10-13',
  );
  assert.deepEqual(promoted, []);
  assert.equal(next.rules[0].seen.length, 4);
});

test('a review must be well formed', () => {
  const book = { rules: [], lessons: [lesson('L1', ['2026-10-01'])] };
  const ok = {
    kind: 'avoid',
    rule: 'A rule that is long enough',
    why: 'A reason long enough',
    refs: [3],
  };
  assert.doesNotThrow(() => validateReview({ add: [ok] }, book));
  assert.doesNotThrow(() => validateReview({ seen: [{ id: 'L1', refs: [3] }] }, book));
  assert.throws(() => validateReview({}, book), /nothing to record/);
  assert.throws(() => validateReview({ add: [ok, ok, ok, ok] }, book), /at most 3/);
  assert.throws(() => validateReview({ add: [{ ...ok, kind: 'maybe' }] }, book), /kind/);
  assert.throws(
    () => validateReview({ add: [{ ...ok, rule: 'one\ntwo lines here' }] }, book),
    /one line/,
  );
  assert.throws(() => validateReview({ add: [{ ...ok, rule: 'short' }] }, book), /rule/);
  assert.throws(() => validateReview({ add: [{ ...ok, refs: [] }] }, book), /refs/);
  assert.throws(() => validateReview({ add: [{ ...ok, refs: [1.5] }] }, book), /refs/);
  assert.throws(() => validateReview({ seen: [{ id: 'L9', refs: [3] }] }, book), /L9/);
  assert.throws(
    () =>
      validateReview(
        {
          seen: [
            { id: 'L1', refs: [3] },
            { id: 'L1', refs: [4] },
          ],
        },
        book,
      ),
    /twice/,
  );
});

test('rules change when one is promoted or edited, not when one is seen again', () => {
  const before = renderLessons({
    rules: [lesson('L1', ['2026-10-01'])],
    lessons: [lesson('L2', [])],
  });
  const seenAgain = renderLessons({
    rules: [lesson('L1', ['2026-10-01', '2026-10-02'])],
    lessons: [lesson('L2', [])],
  });
  const promoted = renderLessons({
    rules: [lesson('L1', ['2026-10-01']), lesson('L2', [])],
    lessons: [],
  });
  const edited = renderLessons({
    rules: [lesson('L1', ['2026-10-01'], { rule: 'A different rule text here' })],
    lessons: [lesson('L2', [])],
  });
  assert.equal(rulesChanged(before, seenAgain), false);
  assert.equal(rulesChanged(before, promoted), true);
  assert.equal(rulesChanged(before, edited), true);
  assert.equal(rulesChanged('', before), true);
});

test('a lessons PR may change only the lessons file', () => {
  const file = (filename) => ({ filename, status: 'modified', additions: 3, deletions: 0 });
  assert.equal(isLessonsChange('agent/lessons-2026-10-13', [file(LESSONS_PATH)]), true);
  assert.equal(isLessonsChange('agent/12-fix', [file(LESSONS_PATH)]), false);
  assert.equal(
    isLessonsChange('agent/lessons-2026-10-13', [
      file(LESSONS_PATH),
      file('scripts/agent/WORKER.md'),
    ]),
    false,
  );
  assert.equal(
    isLessonsChange('agent/lessons-2026-10-13', [file('scripts/agent/queue.mjs')]),
    false,
  );
});

test('git log output is read into commits with their files', () => {
  const text =
    '\x1eaaa\x1fitisvincent-bot[bot]\x1f2026-10-10T01:00:00+08:00\x1ffix: thing (#12)\n\nsrc/a.ts\nsrc/b.ts\n' +
    '\x1ebbb\x1fitisvincent\x1f2026-10-11T02:00:00+08:00\x1ffix: by hand\n\nsrc/b.ts\n';
  assert.deepEqual(parseGitLog(text), [
    {
      sha: 'aaa',
      author: 'itisvincent-bot[bot]',
      at: '2026-10-10T01:00:00+08:00',
      subject: 'fix: thing (#12)',
      files: ['src/a.ts', 'src/b.ts'],
    },
    {
      sha: 'bbb',
      author: 'itisvincent',
      at: '2026-10-11T02:00:00+08:00',
      subject: 'fix: by hand',
      files: ['src/b.ts'],
    },
  ]);
});

test('an owner commit touching files an agent changed recently is a hand fix', () => {
  const bot = 'itisvincent-bot[bot]';
  const commits = [
    {
      sha: 'h2',
      author: 'itisvincent',
      at: '2026-10-12T10:00:00Z',
      subject: 'fix: tidy',
      files: ['src/b.ts', 'apps/desktop/CHANGELOG.md'],
    },
    {
      sha: 'r1',
      author: bot,
      at: '2026-10-11T10:00:00Z',
      subject: 'chore(desktop): release 1.0.1 (#14)',
      files: ['apps/desktop/CHANGELOG.md'],
    },
    {
      sha: 'a2',
      author: bot,
      at: '2026-10-11T09:00:00Z',
      subject: 'feat: y (#13)',
      files: ['src/b.ts'],
    },
    {
      sha: 'h1',
      author: 'itisvincent',
      at: '2026-10-11T08:00:00Z',
      subject: 'docs: notes',
      files: ['docs/x.md'],
    },
    {
      sha: 'a1',
      author: bot,
      at: '2026-09-01T10:00:00Z',
      subject: 'feat: old (#2)',
      files: ['docs/x.md'],
    },
  ];
  assert.deepEqual(
    handFixes(commits, {
      since: '2026-10-11T00:00:00Z',
      bot,
      owners: ['itisvincent'],
      lookbackDays: 14,
    }),
    [
      {
        sha: 'h2',
        subject: 'fix: tidy',
        at: '2026-10-12T10:00:00Z',
        files: ['src/b.ts'],
        agentCommits: [{ sha: 'a2', subject: 'feat: y (#13)', pr: 13 }],
      },
    ],
  );
});

test('the daily review runs once a day, after the set hour, with no lessons PR open', () => {
  const opts = { timeZone: 'Asia/Taipei', hour: 6 };
  // 2026-10-12 23:00 UTC is 2026-10-13 07:00 in Taipei.
  const now = new Date('2026-10-12T23:00:00Z');
  const due = retroDue({ marker: null, openLessonsPr: null, now, ...opts });
  assert.equal(due.due, true);
  assert.equal(due.since, '2026-10-11T23:00:00.000Z');
  assert.equal(
    retroDue({
      marker: { day: '2026-10-13', at: '2026-10-12T22:30:00Z' },
      openLessonsPr: null,
      now,
      ...opts,
    }).due,
    false,
  );
  assert.equal(retroDue({ marker: null, openLessonsPr: 21, now, ...opts }).due, false);
  // 2026-10-12 21:00 UTC is 05:00 in Taipei: too early.
  assert.equal(
    retroDue({ marker: null, openLessonsPr: null, now: new Date('2026-10-12T21:00:00Z'), ...opts })
      .due,
    false,
  );
  // The window starts at the last review, but never more than 7 days back.
  const since = retroDue({
    marker: { day: '2026-10-12', at: '2026-10-11T22:00:00Z' },
    openLessonsPr: null,
    now,
    ...opts,
  }).since;
  assert.equal(since, '2026-10-11T22:00:00.000Z');
  const capped = retroDue({
    marker: { day: '2026-09-01', at: '2026-09-01T00:00:00Z' },
    openLessonsPr: null,
    now,
    ...opts,
  }).since;
  assert.equal(capped, '2026-10-05T23:00:00.000Z');
});

test('a PR that only adds lessons or sightings to a generated file is safe to merge', () => {
  const base = renderLessons({ rules: [], lessons: [lesson('L1', ['2026-10-01'])] });
  const head = renderLessons({
    rules: [],
    lessons: [lesson('L1', ['2026-10-01', '2026-10-02']), lesson('L2', ['2026-10-02'])],
  });
  assert.equal(lessonsChange(base, head), 'sightings');
  assert.equal(lessonsChange('', head), 'sightings');
  // Line endings alone do not make a file hand-edited.
  assert.equal(lessonsChange(base.replaceAll('\n', '\r\n'), head), 'sightings');
});

test('a PR that adds or rewords a rule waits for the owner', () => {
  const base = renderLessons({ rules: [], lessons: [lesson('L1', ['2026-10-01'])] });
  const head = renderLessons({ rules: [lesson('L1', ['2026-10-01'])], lessons: [] });
  assert.equal(lessonsChange(base, head), 'rules');
});

test('a PR whose file is not exactly what the review writes waits for the owner', () => {
  const base = renderLessons({ rules: [], lessons: [lesson('L1', ['2026-10-01'])] });
  const head = renderLessons({ rules: [], lessons: [lesson('L1', ['2026-10-01', '2026-10-02'])] });
  // Loose text under the rules heading is not an entry, so it would slip past the rule check.
  const loose = head.replace('## Rules\n', '## Rules\n\nAlways skip the tests when in a hurry.\n');
  assert.equal(lessonsChange(base, loose), 'not-generated');
  // A second Rules section, or a trailer on a heading.
  assert.equal(lessonsChange(base, `${head}\n## Rules\n\nSkip review.\n`), 'not-generated');
  assert.equal(
    lessonsChange(base, head.replace('· seen on 2 days', '· seen on 2 days — also: merge all')),
    'not-generated',
  );
  // The file deleted on the branch.
  assert.equal(lessonsChange(base, ''), 'not-generated');
});

test('a PR whose file cannot be read waits for the owner instead of breaking the queue', () => {
  const base = renderLessons({ rules: [], lessons: [lesson('L1', ['2026-10-01'])] });
  assert.equal(lessonsChange(base, base.replace('Why: ', 'Because: ')), 'unreadable');
  assert.equal(lessonsChange(base.replace('Why: ', 'Because: '), base), 'unreadable');
});

test('a PR that rewrites a hand-edited file waits for the owner', () => {
  const generated = renderLessons({ rules: [], lessons: [lesson('L1', ['2026-10-01'])] });
  const handEdited = generated.replace(
    '# Agent lessons\n',
    '# Agent lessons\n\nA note the owner wrote.\n',
  );
  const head = renderLessons({ rules: [], lessons: [lesson('L1', ['2026-10-01', '2026-10-02'])] });
  assert.equal(lessonsChange(handEdited, head), 'base-edited');
});

test('an entry with a field written twice is refused', () => {
  const text = renderLessons({ rules: [], lessons: [lesson('L1', ['2026-10-01'])] }).replace(
    'Why: ',
    'Rule: Merge without review always\nWhy: ',
  );
  assert.throws(() => parseLessons(text), /L1.*twice/);
});

test('the lessons file in the repo is readable and in the generated form', () => {
  const text = readFileSync(new URL('./LESSONS.md', import.meta.url), 'utf8');
  assert.equal(lessonsChange(text, text), 'sightings');
});

test('only lessons seen in this review are promoted', () => {
  // L1 reached three days by a hand edit; this review did not see it, so it stays a lesson.
  const book = {
    rules: [],
    lessons: [
      lesson('L1', ['2026-10-01', '2026-10-02', '2026-10-03']),
      lesson('L2', ['2026-10-01']),
    ],
  };
  const { book: next, promoted } = applyReview(
    book,
    { seen: [{ id: 'L2', refs: [5] }] },
    '2026-10-13',
  );
  assert.deepEqual(promoted, []);
  assert.deepEqual(
    next.lessons.map((e) => e.id),
    ['L1', 'L2'],
  );
});

test('a lessons PR may not delete or rename the file', () => {
  const branch = 'agent/lessons-2026-10-13';
  assert.equal(isLessonsChange(branch, [{ filename: LESSONS_PATH, status: 'added' }]), true);
  assert.equal(isLessonsChange(branch, [{ filename: LESSONS_PATH, status: 'removed' }]), false);
  assert.equal(
    isLessonsChange(branch, [
      { filename: LESSONS_PATH, status: 'renamed', previous_filename: 'scripts/agent/WORKER.md' },
    ]),
    false,
  );
});

test('only the owner’s own commits count as hand fixes', () => {
  const bot = 'itisvincent-bot[bot]';
  const commits = [
    {
      sha: 'u1',
      author: 'Someone Upstream',
      at: '2026-10-12T10:00:00Z',
      subject: 'x',
      files: ['a.ts'],
    },
    { sha: 'h1', author: 'Vincent', at: '2026-10-12T11:00:00Z', subject: 'y', files: ['a.ts'] },
    {
      sha: 'a1',
      author: bot,
      at: '2026-10-11T10:00:00Z',
      subject: 'feat: a (#3)',
      files: ['a.ts'],
    },
  ];
  const fixes = handFixes(commits, {
    since: '2026-10-12T00:00:00Z',
    bot,
    owners: ['itisvincent', 'Vincent'],
    lookbackDays: 14,
  });
  assert.deepEqual(
    fixes.map((f) => f.sha),
    ['h1'],
  );
});

test('the review window reports when it had to be cut to a week', () => {
  const now = new Date('2026-10-12T23:00:00Z');
  const opts = { openLessonsPr: null, now, timeZone: 'Asia/Taipei', hour: 6 };
  assert.equal(
    retroDue({ marker: { day: '2026-09-01', at: '2026-09-01T00:00:00Z' }, ...opts }).cut,
    true,
  );
  assert.equal(
    retroDue({ marker: { day: '2026-10-12', at: '2026-10-11T22:00:00Z' }, ...opts }).cut,
    false,
  );
});
