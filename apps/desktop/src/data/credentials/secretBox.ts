import { chmodSync, existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { MasterKeyStatus, SecretBox } from '@kansoku/pro-api';
import {
  decryptWithKey,
  encryptWithKey,
  SecretBoxError,
} from '@kansoku/core/platform/secretCrypto';
import type { SafeStorageLike } from './store.js';

const KEY_BYTES = 32;

export interface DesktopSecretBoxDeps {
  safeStorage: SafeStorageLike;
  wrappedKeyPath: string;
  legacyKeyPath: string;
}

interface WrappedKeyFile {
  version: 1;
  ciphertext: string;
}

function isWrappedKeyFile(value: unknown): value is WrappedKeyFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as WrappedKeyFile).version === 1 &&
    typeof (value as WrappedKeyFile).ciphertext === 'string'
  );
}

/** Write to a sibling temp file, then rename, so a crash never leaves a half-written key. */
function writeFileAtomic(path: string, data: string | Buffer): void {
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temp, data, { mode: 0o600 });
    chmodSync(temp, 0o600);
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

function writeWrappedKey(path: string, key: Buffer, safeStorage: SafeStorageLike): void {
  const ciphertext = safeStorage.encryptString(key.toString('base64')).toString('base64');
  const payload: WrappedKeyFile = { version: 1, ciphertext };
  writeFileAtomic(path, JSON.stringify(payload));
}

type WrappedKeyRead = { kind: 'ok'; key: Buffer } | { kind: 'missing' } | { kind: 'invalid'; reason: string };

/**
 * Only a file that does not exist counts as missing. Anything else (a transient lock from an
 * antivirus scan, bad JSON, a DPAPI failure) is "invalid": minting a new key then would make
 * every saved credential undecryptable, so callers must not overwrite the file.
 */
function readWrappedKey(path: string, safeStorage: SafeStorageLike): WrappedKeyRead {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' };
    return { kind: 'invalid', reason: `cannot read the key file (${(error as NodeJS.ErrnoException).code ?? 'error'})` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'invalid', reason: 'the key file is not valid JSON' };
  }
  if (!isWrappedKeyFile(parsed)) return { kind: 'invalid', reason: 'unexpected key file format' };
  try {
    const decoded = safeStorage.decryptString(Buffer.from(parsed.ciphertext, 'base64'));
    const key = Buffer.from(decoded, 'base64');
    if (key.length !== KEY_BYTES) return { kind: 'invalid', reason: 'the stored key has the wrong length' };
    return { kind: 'ok', key };
  } catch {
    return { kind: 'invalid', reason: 'OS secure storage could not decrypt the key' };
  }
}

function readLegacyKey(path: string): Buffer | null {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    return null;
  }
  if (!stats.isFile() || stats.size !== KEY_BYTES) return null;
  return readFileSync(path);
}

function writeLegacyKey(path: string, key: Buffer): void {
  writeFileAtomic(path, key);
}

// Migration order on every boot: prefer an already-wrapped key (steady
// state); else wrap a pre-P3 plaintext keyfile in place, keeping the
// original file untouched (never delete user data); else mint a fresh key.
// The legacy plaintext file, if wrapped, is intentionally left on disk —
// this function only adds a safeStorage-wrapped copy alongside it.
function resolveKey(deps: DesktopSecretBoxDeps): Buffer | null {
  const wrapped = readWrappedKey(deps.wrappedKeyPath, deps.safeStorage);
  if (wrapped.kind === 'ok') return wrapped.key;
  if (wrapped.kind === 'invalid') {
    throw new SecretBoxError(`master key unavailable: ${wrapped.reason}; it was left untouched`);
  }

  if (!deps.safeStorage.isEncryptionAvailable()) return null;

  const legacy = readLegacyKey(deps.legacyKeyPath);
  if (legacy) {
    writeWrappedKey(deps.wrappedKeyPath, legacy, deps.safeStorage);
    return legacy;
  }

  const fresh = randomBytes(KEY_BYTES);
  writeWrappedKey(deps.wrappedKeyPath, fresh, deps.safeStorage);
  return fresh;
}

export function createDesktopSecretBox(deps: DesktopSecretBoxDeps): SecretBox {
  // Read once; later encrypt/decrypt calls never touch the file, so a transient lock on it
  // cannot interrupt them.
  let cached: Buffer | null = null;
  function currentKey(): Buffer {
    if (cached) return cached;
    const key = resolveKey(deps);
    if (!key) throw new SecretBoxError('OS secure storage unavailable for master key');
    cached = key;
    return key;
  }

  return {
    status(): MasterKeyStatus {
      const wrapped = readWrappedKey(deps.wrappedKeyPath, deps.safeStorage);
      if (wrapped.kind === 'ok') return 'ready';
      if (wrapped.kind === 'invalid') return 'invalid';
      if (!deps.safeStorage.isEncryptionAvailable()) {
        return existsSync(deps.wrappedKeyPath) ? 'invalid' : 'missing';
      }
      if (readLegacyKey(deps.legacyKeyPath)) return 'missing';
      return existsSync(deps.wrappedKeyPath) ? 'invalid' : 'missing';
    },

    encrypt(provider: string, plaintext: string): string {
      return encryptWithKey(currentKey(), provider, plaintext);
    },

    decrypt(provider: string, envelope: string): string {
      return decryptWithKey(currentKey(), provider, envelope);
    },

    resetKey(): void {
      if (!deps.safeStorage.isEncryptionAvailable()) {
        throw new SecretBoxError('OS secure storage unavailable for master key');
      }
      const fresh = randomBytes(KEY_BYTES);
      writeWrappedKey(deps.wrappedKeyPath, fresh, deps.safeStorage);
      cached = fresh;
      // A bare-Node host sharing this data root (no Electron, no safeStorage)
      // reads the master key straight from legacyKeyPath — if that file is
      // still around, keep it in lockstep or it'd decrypt with a stale key
      // after this reset.
      if (readLegacyKey(deps.legacyKeyPath)) writeLegacyKey(deps.legacyKeyPath, fresh);
    },
  };
}
