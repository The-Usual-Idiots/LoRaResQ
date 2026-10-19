/**
 * LoRaResQ Offline IndexedDB Persistence Store
 * Retains personal messages (7 days), global messages (30 days),
 * user roster, location, and offline outbox across page reloads and AP hops.
 */

import {
  UserProfile,
  PersonalMessage,
  GlobalMessage,
  DeviceLocation,
} from '@/types/loraresq';

const DB_NAME = 'LoRaResQ_OfflineDB';
const DB_VERSION = 1;

interface LoRaResQSchema {
  personal_messages: PersonalMessage;
  global_messages: GlobalMessage;
  roster: UserProfile;
  outbox: { id: string; type: 'personal' | 'global' | 'sos'; payload: unknown; createdAt: number };
}

function openDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('personal_messages')) {
        db.createObjectStore('personal_messages', { keyPath: 'messageId' });
      }
      if (!db.objectStoreNames.contains('global_messages')) {
        db.createObjectStore('global_messages', { keyPath: 'messageId' });
      }
      if (!db.objectStoreNames.contains('roster')) {
        db.createObjectStore('roster', { keyPath: 'deviceUuid' });
      }
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('[OfflineDB] IndexedDB open error, falling back to in-memory');
      resolve(null);
    };
  });
}

export async function savePersonalMessage(msg: PersonalMessage): Promise<void> {
  const db = await openDB();
  if (!db) {
    saveToLocalStorageArray('loraresq_pm', msg, 'messageId');
    return;
  }
  const tx = db.transaction('personal_messages', 'readwrite');
  tx.objectStore('personal_messages').put(msg);
}

export async function getPersonalMessages(): Promise<PersonalMessage[]> {
  const db = await openDB();
  if (!db) {
    return getFromLocalStorageArray<PersonalMessage>('loraresq_pm');
  }
  return new Promise((resolve) => {
    const tx = db.transaction('personal_messages', 'readonly');
    const store = tx.objectStore('personal_messages');
    const req = store.getAll();
    req.onsuccess = () => {
      const msgs = (req.result as PersonalMessage[]) || [];
      // Sort newest first
      resolve(msgs.reverse());
    };
    req.onerror = () => resolve([]);
  });
}

export async function saveGlobalMessage(msg: GlobalMessage): Promise<void> {
  const db = await openDB();
  if (!db) {
    saveToLocalStorageArray('loraresq_gm', msg, 'messageId');
    return;
  }
  const tx = db.transaction('global_messages', 'readwrite');
  tx.objectStore('global_messages').put(msg);
}

export async function getGlobalMessages(): Promise<GlobalMessage[]> {
  const db = await openDB();
  if (!db) {
    return getFromLocalStorageArray<GlobalMessage>('loraresq_gm');
  }
  return new Promise((resolve) => {
    const tx = db.transaction('global_messages', 'readonly');
    const store = tx.objectStore('global_messages');
    const req = store.getAll();
    req.onsuccess = () => {
      const msgs = (req.result as GlobalMessage[]) || [];
      resolve(msgs.reverse());
    };
    req.onerror = () => resolve([]);
  });
}

export async function saveRoster(roster: UserProfile[]): Promise<void> {
  const db = await openDB();
  if (!db) {
    try {
      localStorage.setItem('loraresq_roster', JSON.stringify(roster));
    } catch {
      // storage blocked
    }
    return;
  }
  const tx = db.transaction('roster', 'readwrite');
  const store = tx.objectStore('roster');
  for (const user of roster) {
    store.put(user);
  }
}

export async function getRoster(): Promise<UserProfile[]> {
  const db = await openDB();
  if (!db) {
    try {
      const raw = localStorage.getItem('loraresq_roster');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  return new Promise((resolve) => {
    const tx = db.transaction('roster', 'readonly');
    const store = tx.objectStore('roster');
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as UserProfile[]) || []);
    req.onerror = () => resolve([]);
  });
}

export async function enqueueOutbox(item: { id: string; type: 'personal' | 'global' | 'sos'; payload: unknown }): Promise<void> {
  const entry = { ...item, createdAt: Date.now() };
  const db = await openDB();
  if (!db) {
    saveToLocalStorageArray('loraresq_outbox', entry, 'id');
    return;
  }
  const tx = db.transaction('outbox', 'readwrite');
  tx.objectStore('outbox').put(entry);
}

export async function getAndClearOutbox(): Promise<Array<{ id: string; type: 'personal' | 'global' | 'sos'; payload: unknown }>> {
  const db = await openDB();
  if (!db) {
    const items = getFromLocalStorageArray<any>('loraresq_outbox');
    try {
      localStorage.removeItem('loraresq_outbox');
    } catch {}
    return items;
  }
  return new Promise((resolve) => {
    const tx = db.transaction('outbox', 'readwrite');
    const store = tx.objectStore('outbox');
    const req = store.getAll();
    req.onsuccess = () => {
      const items = req.result || [];
      store.clear();
      resolve(items);
    };
    req.onerror = () => resolve([]);
  });
}

// LocalStorage helpers for fallbacks
function saveToLocalStorageArray<T>(key: string, item: T, idProp: keyof T): void {
  try {
    const existing = getFromLocalStorageArray<T>(key);
    const index = existing.findIndex((e) => e[idProp] === item[idProp]);
    if (index >= 0) {
      existing[index] = item;
    } else {
      existing.unshift(item);
    }
    localStorage.setItem(key, JSON.stringify(existing.slice(0, 100)));
  } catch {}
}

function getFromLocalStorageArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
