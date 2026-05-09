import { describe, expect, it, beforeEach } from 'vitest';
import { __resetForTests, hashIp, recordAndCheck } from '../lib/guide/abuse-guards';

const SALT = 'unit-test-salt-32-chars-or-longer-1234';

describe('hashIp', () => {
  it('produces deterministic hashes', () => {
    expect(hashIp('1.2.3.4', SALT)).toBe(hashIp('1.2.3.4', SALT));
  });

  it('produces different hashes for different IPs', () => {
    expect(hashIp('1.2.3.4', SALT)).not.toBe(hashIp('5.6.7.8', SALT));
  });

  it('produces different hashes for different salts', () => {
    expect(hashIp('1.2.3.4', SALT)).not.toBe(hashIp('1.2.3.4', `${SALT}!`));
  });
});

describe('recordAndCheck (per-IP rate limiter)', () => {
  beforeEach(() => __resetForTests());

  it('allows the first request', () => {
    const result = recordAndCheck('h1', Date.now());
    expect(result.ok).toBe(true);
  });

  it('blocks after 10 messages in one minute', () => {
    const t0 = Date.now();
    for (let i = 0; i < 10; i++) {
      const r = recordAndCheck('h1', t0 + i * 100);
      expect(r.ok).toBe(true);
    }
    const blocked = recordAndCheck('h1', t0 + 11 * 100);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('per-minute');
  });

  it('blocks after 60 messages in one hour', () => {
    const t0 = Date.now();
    for (let minute = 0; minute < 6; minute++) {
      for (let i = 0; i < 10; i++) {
        const r = recordAndCheck('h2', t0 + minute * 60_000 + i * 100);
        expect(r.ok).toBe(true);
      }
    }
    const blocked = recordAndCheck('h2', t0 + 6 * 60_000 + 1000);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('per-hour');
  });

  it('tracks IPs independently', () => {
    const t0 = Date.now();
    for (let i = 0; i < 10; i++) recordAndCheck('h3', t0 + i * 100);
    const otherIp = recordAndCheck('h4', t0 + 11 * 100);
    expect(otherIp.ok).toBe(true);
  });
});
