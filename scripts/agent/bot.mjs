// The agent's own GitHub identity: the GitHub App in config.bot. Every GitHub write by the agent
// queue goes out as the bot, never as the owner, with a 1-hour login that reaches only
// config.repo — even though the app itself is installed on more of the owner's repositories.
//
// The private key path comes from the KANSOKU_BOT_KEY environment variable (set in the agent
// checkout's local settings). Without it, nothing is written: there is no fallback to the
// owner's own GitHub login.
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PERMISSIONS = {
  contents: 'write',
  issues: 'write',
  pull_requests: 'write',
  actions: 'read',
  checks: 'read',
  statuses: 'read',
  metadata: 'read',
};

/**
 * Whether a GitHub login is the bot: `slug[bot]` (REST API) or `app/slug` (gh's PR and issue
 * authors). Never the bare `slug` — gh shows comment authors that way, and any person could
 * register that user name.
 */
export function isBotLogin(login, slug) {
  return login === `${slug}[bot]` || login === `app/${slug}`;
}

/** A JSON Web Token signed with the app's key, as GitHub asks for before it hands out a login. */
export function appJwt(appId, privateKey, now = Math.floor(Date.now() / 1000)) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ iat: now - 60, exp: now + 540, iss: String(appId) })}`;
  return `${body}.${createSign('RSA-SHA256').update(body).sign(privateKey, 'base64url')}`;
}

/** A 1-hour bot login limited to `repo` and the permissions above. */
export async function botToken({ bot, repo }) {
  const keyPath = process.env.KANSOKU_BOT_KEY;
  if (!keyPath) throw new Error('KANSOKU_BOT_KEY is not set, so the agent has no GitHub login');
  const jwt = appJwt(bot.appId, readFileSync(keyPath, 'utf8'));
  const res = await fetch(
    `https://api.github.com/app/installations/${bot.installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${jwt}`,
        'accept': 'application/vnd.github+json',
        'user-agent': bot.slug,
      },
      body: JSON.stringify({ repositories: [repo.split('/')[1]], permissions: PERMISSIONS }),
    },
  );
  const json = await res.json();
  if (!res.ok || !json.token) {
    throw new Error(`could not get the bot login (${res.status}): ${json.message ?? 'no token'}`);
  }
  return json.token;
}

/**
 * `git` arguments that push `refspec` to `repo` as the bot. The login goes in a header for this
 * one command, and credential helpers are switched off so it is never saved over the owner's.
 */
export function pushArgs(token, repo, refspec) {
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
  return [
    '-c',
    'credential.helper=',
    '-c',
    'credential.https://github.com.helper=',
    '-c',
    `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`,
    'push',
    `https://github.com/${repo}.git`,
    refspec,
  ];
}
