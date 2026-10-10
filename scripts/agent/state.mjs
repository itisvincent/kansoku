// Pure helpers for reading the queue's state. Kept apart from queue.mjs so they can be tested.

/** The calendar day (YYYY-MM-DD) of `date` in `timeZone`, so daily limits reset at local midnight. */
export function localDay(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(date));
}

/**
 * The required checks' state from a `gh pr checks --json name,bucket` run.
 * `gh` exits non-zero when checks fail or are pending, so the exit code alone means nothing;
 * output that is not JSON means the read itself failed (login, network) and must not pass as
 * "pending" forever.
 */
export function ciFromChecks({ status, stdout, stderr }, requiredChecks) {
  let checks;
  try {
    checks = JSON.parse(stdout);
  } catch {
    if (/no checks reported/i.test(stderr)) return 'pending';
    throw new Error(`could not read the PR checks (gh exit ${status}): ${stderr.trim()}`);
  }
  const required = checks.filter((c) => requiredChecks.includes(c.name));
  if (required.length < requiredChecks.length) return 'pending';
  if (required.some((c) => c.bucket === 'fail' || c.bucket === 'cancel')) return 'fail';
  if (required.every((c) => c.bucket === 'pass')) return 'pass';
  return 'pending';
}

/**
 * When a worker claimed the issue: the last "🤖 Started" comment, or the issue's own date if
 * that comment is missing.
 */
export function claimedAt(issue) {
  const started = (issue.comments ?? []).filter((c) => c.body.startsWith('🤖 Started'));
  return started.length ? started[started.length - 1].createdAt : issue.createdAt;
}

/**
 * Who last added `label`, from the issue's REST events. The bot can write labels too, so a
 * label only counts as the owner's approval when the owner added it.
 */
export function labelAddedBy(events, label) {
  const added = events.filter((e) => e.event === 'labeled' && e.label?.name === label);
  return added.length ? (added[added.length - 1].actor?.login ?? null) : null;
}

/** A claim with no PR after `hours` means the worker stopped (crash, closed session). */
export function isStaleClaim(startedAt, hours, now = new Date()) {
  return now.getTime() - new Date(startedAt).getTime() > hours * 3_600_000;
}
