import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../src/db/index.js';
import { createSecretBox, type SecretBox } from '../src/ai/settings/secretBox.js';
import { createCredentialStore } from '../src/ai/settings/credentialStore.js';
import { createLicenseStore, type LicenseRecord } from '../src/license/licenseStore.js';
import { aiSettingsService } from '../src/settings/aiSettings.service.js';
import { setSettingsDepsForTests } from '../src/settings/settings.deps.js';

describe('resetCredentials', () => {
  let dir: string;
  let db: Db;
  let secretBox: SecretBox;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'reset-credentials-'));
    // In memory: Windows cannot delete a temp folder while a database file in it is open.
    db = createDb(':memory:');
    secretBox = createSecretBox(join(dir, 'master.key'));
    const credentials = createCredentialStore(db, secretBox, { codexAuthPath: join(dir, 'auth.json') });
    setSettingsDepsForTests({
      db,
      secretBox,
      credentials,
      models: { setProvider() {} } as never,
      settingsStore: {} as never,
      watchedMarketsStore: {} as never,
    });
  });

  afterEach(() => {
    setSettingsDepsForTests(null);
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best effort on Windows.
    }
  });

  it('keeps the license readable after rotating the master key', async () => {
    const license = createLicenseStore(db, secretBox);
    const record = { key: 'LIC-123', instanceId: 'inst-1' } as unknown as LicenseRecord;
    license.write(record);
    await aiSettingsService.resetCredentials();
    expect(createLicenseStore(db, secretBox).read()).toEqual(record);
  });

  it('refuses to delete the license through the AI credentials API', async () => {
    await expect(aiSettingsService.deleteCredential({ provider: 'kansoku-license' })).rejects.toThrow(
      /not an AI credential/,
    );
  });
});
