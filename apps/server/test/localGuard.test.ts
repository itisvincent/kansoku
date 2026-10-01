import { describe, expect, it } from 'vitest';
import { refuseReason } from '../src/localGuard.js';

const base = {
  remoteAddress: '127.0.0.1',
  method: 'POST',
  host: 'localhost:1792',
  origin: 'http://localhost:1792',
  secFetchSite: 'same-origin',
};

describe('refuseReason', () => {
  it('lets the app itself through', () => {
    expect(refuseReason(base)).toBeNull();
    expect(refuseReason({ ...base, remoteAddress: '::1' })).toBeNull();
    expect(refuseReason({ ...base, remoteAddress: '::ffff:127.0.0.1' })).toBeNull();
  });

  it('lets non-browser clients (curl, skill scripts) through', () => {
    expect(refuseReason({ ...base, origin: undefined, secFetchSite: undefined })).toBeNull();
  });

  it('refuses other machines on the network', () => {
    expect(refuseReason({ ...base, remoteAddress: '192.168.1.20' })).toMatch(/this computer/);
  });

  it('refuses a DNS-rebinding page by its Host header', () => {
    expect(refuseReason({ ...base, host: 'evil.example:1792' })).toMatch(/Host/);
  });

  it('refuses a state-changing request from another website', () => {
    expect(refuseReason({ ...base, origin: 'https://evil.example', secFetchSite: 'cross-site' })).toMatch(
      /cross-site/,
    );
    expect(refuseReason({ ...base, origin: 'https://evil.example', secFetchSite: undefined })).toMatch(
      /cross-origin/,
    );
  });

  it('allows reads from the app even when the browser marks them same-site', () => {
    expect(refuseReason({ ...base, method: 'GET', secFetchSite: 'cross-site' })).toBeNull();
  });
});
