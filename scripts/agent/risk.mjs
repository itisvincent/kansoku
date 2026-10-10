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
