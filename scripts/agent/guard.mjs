#!/usr/bin/env node
// PreToolUse hook for the unattended agent queue. Claude Code runs it before every tool call
// and it refuses what an agent must never do, whatever its instructions say. Registered only
// in the agent's own checkout (.claude/settings.local.json there), never in the owner's.
//
// GitHub writes go through queue.mjs, which checks the rules first; releases go through
// release.mjs. Everything here fails closed: unreadable input is refused.
import { readFileSync } from 'node:fs';

const READ_ONLY_GH = [
  /^gh (pr|issue) (view|list|diff|checks|status)\b/,
  /^gh run (view|list|watch)\b/,
  /^gh (auth status|repo view|label list)\b/,
];

const OWN_TOOLS = /^node\s+(?:"?[^\s"]*[\\/])?scripts[\\/]agent[\\/](queue|release)\.mjs(\s|$)/;

// The same writes tucked inside another command (`node -e "...git push..."`, a script, eval).
const HIDDEN_WRITE =
  /\bgit\s+push\b|\bgh\s+(pr\s+(merge|create|edit|close|review|comment)|issue\s+(create|edit|close|comment|delete)|api|release|repo\s+(edit|delete|create|rename)|secret|workflow|label)\b/;

const SEGMENT_SPLIT = /&&|\|\||;|\||\r?\n/;

const PROTECTED_PATH =
  /(^|[\\/])(\.env(\.[\w-]+)?$|scripts[\\/]agent[\\/]|\.claude[\\/]settings[^\\/]*\.json$)/;
const ENV_FILE = /(^|[\s"'=\\/])\.env(\.(?!example\b)[\w-]+)?(?=$|[\s"'\\/])/;

// The bot's private key: only queue.mjs and release.mjs read it, inside their own process.
const BOT_KEY = /\.pem\b|KANSOKU_BOT_KEY|private-key|GH_TOKEN|extraheader/i;
const BOT_KEY_REASON =
  "the bot's GitHub key and login are only used inside queue.mjs and release.mjs";

/**
 * Whether `text` names the bot key or its folder (from KANSOKU_BOT_KEY, so no private path is
 * written here). The drive letter is dropped so `D:\a\b`, `D:/a/b` and `/d/a/b` all match.
 */
export function touchesBotKey(text, keyPath = process.env.KANSOKU_BOT_KEY) {
  if (BOT_KEY.test(text)) return true;
  if (!keyPath) return false;
  const norm = (s) => s.replaceAll('\\', '/').replace(/\/+/g, '/').toLowerCase();
  const folder = norm(keyPath)
    .replace(/\/[^/]*$/, '')
    .replace(/^([a-z]:|\/[a-z](?=\/))/, '');
  return folder.length > 1 && norm(text).includes(folder);
}

const WRITES =
  /(^|\s)(>|>>|tee|sed\s+-i|rm|mv|cp|Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item|New-Item)\b|>/;

const COMMAND_RULES = [
  [/\bkansoku-trade\b/, 'never touch the upstream project kansoku-trade/kansoku'],
  [/^git\s+push\b/, 'push only through `node scripts/agent/queue.mjs open-pr`'],
  [/^git\s+remote\s+(add|set-url|remove|rm|rename)\b/, 'remotes are fixed for the agent'],
  [
    /^git\s+(config)\b.*\b(url\.|remote\.|credential)/,
    'git remote and credential settings are fixed',
  ],
  [/^(longbridge|lb)\b/, 'no broker or market-data calls from the agent queue'],
  [
    /\b(11111|placeOrder|place_order|modify_order|unlock_trade|submit-order)\b/i,
    'no trading calls, ever',
  ],
  [
    /\b9336\b|remote-debugging|D:[\\/]+tools[\\/]+kansoku/i,
    'the installed app is only touched by release.mjs',
  ],
  [/\b(Stop-Process|taskkill|kill\s+-9)\b/i, 'do not stop processes'],
  [/\bcurl\b.*\bapi\.anthropic\.com|\bclaude\s+-p\b/i, 'do not start extra paid AI runs'],
];

function denyCommand(command) {
  const trimmed = command.trim();
  if (!trimmed) return null;
  if (ENV_FILE.test(trimmed)) return 'never read or write .env files';
  if (touchesBotKey(trimmed)) return BOT_KEY_REASON;
  for (const raw of trimmed.split(SEGMENT_SPLIT)) {
    const segment = raw.trim().replace(/^(cd\s+\S+\s*)/, '');
    if (!segment) continue;
    if (OWN_TOOLS.test(segment)) continue;
    for (const [pattern, reason] of COMMAND_RULES) {
      if (pattern.test(segment)) return reason;
    }
    if (HIDDEN_WRITE.test(segment) && !/^gh\b/.test(segment)) {
      return 'pushes and GitHub changes go through `node scripts/agent/queue.mjs`';
    }
    if (/^gh\b/.test(segment) && !READ_ONLY_GH.some((re) => re.test(segment))) {
      return 'GitHub changes go through `node scripts/agent/queue.mjs` (status, claim, open-pr, verdict, merge, stuck, idea)';
    }
    if (/(scripts[\\/]agent[\\/]|\.claude[\\/]settings)/.test(segment) && WRITES.test(segment)) {
      return 'the agent may not change its own rules (scripts/agent, .claude/settings)';
    }
  }
  return null;
}

/** Returns a refusal reason, or null to let the call through. */
export function decide(input) {
  const tool = input?.tool_name;
  const args = input?.tool_input ?? {};
  if (typeof tool !== 'string') return 'unreadable hook input';
  if (tool === 'Bash' || tool === 'PowerShell') {
    if (typeof args.command !== 'string') return 'unreadable command';
    return denyCommand(args.command);
  }
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const path = String(args.file_path ?? args.notebook_path ?? '');
    if (PROTECTED_PATH.test(path)) return 'the agent may not change .env files or its own rules';
    if (touchesBotKey(path)) return BOT_KEY_REASON;
    if (/D:[\\/]+tools[\\/]+kansoku/i.test(path))
      return 'the installed app is only touched by release.mjs';
    return null;
  }
  if (tool === 'Read') {
    const path = String(args.file_path ?? '');
    if (/(^|[\\/])\.env(\.(?!example\b)[\w-]+)?$/.test(path)) return 'never read .env files';
    if (touchesBotKey(path)) return BOT_KEY_REASON;
  }
  if (tool === 'Grep' || tool === 'Glob') {
    const text = [args.path, args.pattern, args.glob].filter(Boolean).join(' ');
    if (touchesBotKey(text)) return BOT_KEY_REASON;
  }
  return null;
}

function main() {
  let reason;
  try {
    reason = decide(JSON.parse(readFileSync(0, 'utf8')));
  } catch {
    reason = 'unreadable hook input';
  }
  if (reason) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Agent guard: ${reason}.`,
        },
      }),
    );
  }
  process.exit(0);
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/').split('/').pop())
) {
  main();
}
