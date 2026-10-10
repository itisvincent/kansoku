// Decides whether an agent PR may merge itself or must wait for the owner.

/** Turns a path glob (`**` any depth, `*` within one folder) into a RegExp. */
export function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      // `**/` matches zero or more folders; a trailing `**` matches the rest of the path.
      if (glob[i + 2] === '/') {
        out += '(?:.*/)?';
        i += 2;
      } else {
        out += '.*';
        i += 1;
      }
    } else if (c === '*') {
      out += '[^/]*';
    } else {
      out += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

export const RELEASE_BRANCH = 'agent/release-';

/**
 * A release PR from release.mjs: only the version line of the desktop package.json changes and
 * the changelog only gains lines. It merges on passing checks alone — the app it describes is
 * already installed and running.
 */
export function isReleaseChange(branch, files) {
  if (!branch.startsWith(RELEASE_BRANCH) || files.length !== 2) return false;
  // `files` is the REST shape: { filename, additions, deletions, patch }.
  const byPath = Object.fromEntries(files.map((f) => [f.filename.replaceAll('\\', '/'), f]));
  const pkg = byPath['apps/desktop/package.json'];
  const log = byPath['apps/desktop/CHANGELOG.md'];
  if (!pkg || !log || pkg.additions !== 1 || pkg.deletions !== 1 || log.deletions !== 0) {
    return false;
  }
  const changed = (pkg.patch ?? '').split('\n').filter((l) => /^[+-](?![+-])/.test(l));
  return (
    changed.length === 2 && changed.every((l) => /^[+-]\s*"version": "\d+\.\d+\.\d+",?$/.test(l))
  );
}

/**
 * `files` is a list of `{ path, additions, deletions }` (as `gh pr view --json files` gives).
 * Returns `{ level: 'low' | 'needs-you', reasons: string[] }`.
 */
export function classify(files, { needsYou, maxChangedLines }) {
  const patterns = needsYou.map((glob) => ({ glob, re: globToRegExp(glob) }));
  const reasons = [];
  for (const file of files) {
    const path = file.path.replaceAll('\\', '/');
    const hit = patterns.find((p) => p.re.test(path));
    if (hit) reasons.push(`${path} is in a guarded area (${hit.glob})`);
  }
  const changed = files.reduce((sum, f) => sum + (f.additions ?? 0) + (f.deletions ?? 0), 0);
  if (changed > maxChangedLines) {
    reasons.push(`${changed} changed lines is more than ${maxChangedLines}`);
  }
  if (files.length === 0) reasons.push('the PR changes no files');
  return { level: reasons.length === 0 ? 'low' : 'needs-you', reasons };
}
