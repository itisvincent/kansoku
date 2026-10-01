import { existsSync, lstatSync, readlinkSync, realpathSync, rmdirSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

/**
 * Older packaged builds exposed Resources/skills as Workspace/.claude/skills.
 * Skill discovery and bash now resolve the bundled directory independently, so
 * remove only that exact legacy link and leave user-owned directories untouched.
 */
export function removeLegacyBundledSkillsLink(dataRoot: string, bundledSkillsDir: string): boolean {
  const target = join(dataRoot, '.claude', 'skills');
  try {
    if (!existsSync(target) || !lstatSync(target).isSymbolicLink()) return false;
    const current = readlinkSync(target);
    // isAbsolute, not startsWith('/'): Windows link targets are drive paths (C:/...).
    const currentAbs = isAbsolute(current) ? current : join(dirname(target), current);
    if (!samePath(currentAbs, bundledSkillsDir)) return false;
    // unlink removes only the link; rmSync without recursive refuses a folder link on
    // Windows (EISDIR).
    unlinkSync(target);
    try {
      rmdirSync(dirname(target));
    } catch {
      // Keep .claude when it contains user-owned files.
    }
    return true;
  } catch {
    return false;
  }
}

function samePath(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return a === b;
  }
}

export function bundledSkillsPath(resourcesPath: string): string {
  return join(resourcesPath, 'skills');
}
