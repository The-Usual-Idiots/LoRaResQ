/**
 * Stable Device Identity Manager
 * Ensures that the device maintains a persistent UUID across AP handovers
 * and browser restarts, with fallbacks for non-secure HTTP contexts.
 */

const STORAGE_KEY_UUID = 'loraresq_device_uuid';
const STORAGE_KEY_NAME = 'loraresq_display_name';
const STORAGE_KEY_MODEL = 'loraresq_device_model';

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
      return (globalThis as any).localStorage;
    }
  } catch {}
  return null;
}

export function generateFallbackUUID(): string {
  // RFC4122 v4 compliant fallback when crypto.randomUUID is inaccessible
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getOrCreateDeviceUUID(): string {
  const storage = getStorage();
  if (!storage) {
    // If no window or storage, check if we can generate a temporary fallback
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return generateFallbackUUID();
  }

  try {
    let uuid = storage.getItem(STORAGE_KEY_UUID);
    if (!uuid) {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        uuid = crypto.randomUUID();
      } else {
        uuid = generateFallbackUUID();
      }
      storage.setItem(STORAGE_KEY_UUID, uuid);
    }
    return uuid;
  } catch {
    // If storage is blocked (e.g. sandboxed captive portal webview)
    return generateFallbackUUID();
  }
}

export function getStoredDisplayName(): string {
  const storage = getStorage();
  if (!storage) return 'Civilian';
  try {
    return storage.getItem(STORAGE_KEY_NAME) || 'User-' + Math.floor(1000 + Math.random() * 9000);
  } catch {
    return 'User-' + Math.floor(1000 + Math.random() * 9000);
  }
}

export function setStoredDisplayName(name: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY_NAME, name.trim());
  } catch (err) {
    console.warn('Unable to persist display name in storage:', err);
  }
}

export function getDetectedDeviceModel(): string {
  const storage = getStorage();
  if (storage) {
    try {
      const saved = storage.getItem(STORAGE_KEY_MODEL);
      if (saved) return saved;
    } catch {}
  }

  if (typeof navigator === 'undefined') return 'Portable Device';

  try {
    const ua = navigator.userAgent;
    let model = 'Web Client';

    if (/Android/i.test(ua)) {
      const match = ua.match(/Android[^;]+; ([^;]+)\)/);
      model = match ? match[1].split('Build')[0].trim() : 'Android Device';
    } else if (/iPhone/i.test(ua)) {
      model = 'Apple iPhone';
    } else if (/iPad/i.test(ua)) {
      model = 'Apple iPad';
    } else if (/Windows/i.test(ua)) {
      model = 'Windows PC';
    } else if (/Macintosh/i.test(ua)) {
      model = 'Mac';
    } else if (/Linux/i.test(ua)) {
      model = 'Linux Workstation';
    }

    if (storage) {
      storage.setItem(STORAGE_KEY_MODEL, model);
    }
    return model;
  } catch {
    return 'Portable Device';
  }
}
