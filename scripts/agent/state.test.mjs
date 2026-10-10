import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ciFromChecks, claimedAt, isStaleClaim, localDay } from './state.mjs';

const required = ['check'];
const checks = (list, status = 0) => ({ status, stdout: JSON.stringify(list), stderr: '' });

test('the day turns at Taiwan midnight, not UTC midnight', () => {
  // 2026-10-10 17:00 UTC is 2026-10-11 01:00 in Taipei.
  assert.equal(localDay('2026-10-10T17:00:00Z', 'Asia/Taipei'), '2026-10-11');
  assert.equal(localDay('2026-10-10T15:59:00Z', 'Asia/Taipei'), '2026-10-10');
});

test('required checks decide the CI state', () => {
  assert.equal(ciFromChecks(checks([{ name: 'check', bucket: 'pass' }]), required), 'pass');
  assert.equal(
    ciFromChecks(
      checks(
        [
          { name: 'check', bucket: 'fail' },
          { name: 'desktop-branch-build', bucket: 'pass' },
        ],
        1,
      ),
      required,
    ),
    'fail',
  );
  assert.equal(
    ciFromChecks(checks([{ name: 'check', bucket: 'pending' }], 8), required),
    'pending',
  );
  assert.equal(
    ciFromChecks(checks([{ name: 'desktop-branch-build', bucket: 'fail' }], 1), required),
    'pending',
  );
});

test('no checks yet is pending, but a failed read is an error', () => {
  assert.equal(
    ciFromChecks(
      { status: 1, stdout: '', stderr: "no checks reported on the 'agent/3-x' branch" },
      required,
    ),
    'pending',
  );
  assert.throws(
    () => ciFromChecks({ status: 1, stdout: '', stderr: 'HTTP 401: Bad credentials' }, required),
    /could not read the PR checks/,
  );
});

test('a claim goes stale after the time limit', () => {
  const issue = {
    createdAt: '2026-10-09T00:00:00Z',
    comments: [
      { body: '🤖 Started. Branch: x', createdAt: '2026-10-10T01:00:00Z' },
      { body: '🤖 Stuck: y', createdAt: '2026-10-10T02:00:00Z' },
      { body: '🤖 Started. Branch: x', createdAt: '2026-10-10T08:00:00Z' },
    ],
  };
  const started = claimedAt(issue);
  assert.equal(started, '2026-10-10T08:00:00Z');
  assert.equal(isStaleClaim(started, 3, new Date('2026-10-10T10:00:00Z')), false);
  assert.equal(isStaleClaim(started, 3, new Date('2026-10-10T11:30:00Z')), true);
  assert.equal(
    claimedAt({ createdAt: '2026-10-09T00:00:00Z', comments: [] }),
    '2026-10-09T00:00:00Z',
  );
});
