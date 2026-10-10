import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { appJwt, isBotLogin, pushArgs } from './bot.mjs';

test('only the bot forms that a person cannot register count as the bot', () => {
  assert.equal(isBotLogin('itisvincent-bot[bot]', 'itisvincent-bot'), true);
  assert.equal(isBotLogin('app/itisvincent-bot', 'itisvincent-bot'), true);
  assert.equal(isBotLogin('itisvincent-bot', 'itisvincent-bot'), false);
  assert.equal(isBotLogin('itisvincent', 'itisvincent-bot'), false);
});

test('the app login token is signed with the key and names the app', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs1', format: 'pem' });
  const jwt = appJwt(5263771, pem, 1_000_000);
  const [header, payload, signature] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), {
    iat: 999_940,
    exp: 1_000_540,
    iss: '5263771',
  });
  assert.ok(
    verify(
      'RSA-SHA256',
      Buffer.from(`${header}.${payload}`),
      publicKey,
      Buffer.from(signature, 'base64url'),
    ),
  );
});

test('a bot push never saves its login and goes to the named repo only', () => {
  const args = pushArgs('tok', 'itisvincent/kansoku', 'agent/1-x:agent/1-x');
  assert.ok(args.includes('credential.helper='));
  assert.equal(args.at(-2), 'https://github.com/itisvincent/kansoku.git');
  assert.equal(args.at(-1), 'agent/1-x:agent/1-x');
  assert.ok(!args.join(' ').includes('tok '));
});
