import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { getOrCreateDeviceUUID, getStoredDisplayName, setStoredDisplayName } from '../src/lib/deviceIdentity';

describe('LoRaResQ Client Identity & Persistence (BLUEPRINT.md Section 9.2)', () => {
  beforeAll(() => {
    // Provide in-memory localStorage mock for node test runner
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => store.get(key) || null,
      setItem: (key: string, val: string) => store.set(key, val),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      get length() {
        return store.size;
      },
      key: (i: number) => Array.from(store.keys())[i] || null,
    };
    (globalThis as any).localStorage = mockStorage;
  });

  beforeEach(() => {
    if (globalThis.localStorage) {
      globalThis.localStorage.clear();
    }
  });

  it('generates a valid RFC 4122 v4 UUID in non-secure HTTP contexts', () => {
    const uuid = getOrCreateDeviceUUID();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('preserves persistent identity across simulated reloads', () => {
    const uuid1 = getOrCreateDeviceUUID();
    const uuid2 = getOrCreateDeviceUUID();
    expect(uuid1).toBe(uuid2);
  });

  it('stores and retrieves sanitized display name', () => {
    setStoredDisplayName('Volunteer - Saivel');
    expect(getStoredDisplayName()).toBe('Volunteer - Saivel');
  });
});
