// Durable game storage. Every change is written to two places on the device
// (localStorage and IndexedDB) plus a rolling previous copy, so a corrupted
// write or one store being cleared doesn't lose games. Backups can be
// exported to a file and restored.

const KEY = 'tball.games.v1';
const PREV = 'tball.games.prev';
const DB = 'tball';

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) {
  const db = await idb();
  return new Promise((res, rej) => {
    const q = db.transaction('kv').objectStore('kv').get(k);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
async function idbSet(k, v) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(v, k);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}

function parse(raw) {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

// Ids of deleted games, so older copies can't bring them back.
const GONE = 'tball.deleted';
const gone = () => { try { return new Set(JSON.parse(localStorage.getItem(GONE)) || []); } catch { return new Set(); } };
export function forget(id) {
  const s = gone();
  s.add(id);
  try { localStorage.setItem(GONE, JSON.stringify([...s])); } catch { /* ignore */ }
}

// Union of game lists by id; the most recently updated copy of each wins.
export function merge(...lists) {
  const byId = new Map();
  const dead = gone();
  for (const list of lists) {
    for (const g of list || []) {
      if (!g?.id || dead.has(g.id) || !Array.isArray(g.events) || !Array.isArray(g.teams)) continue;
      const have = byId.get(g.id);
      if (!have || (g.updated || 0) > (have.updated || 0)) byId.set(g.id, g);
    }
  }
  return [...byId.values()];
}

// Fast synchronous load for first paint.
export function loadSync() {
  let main = null;
  let prev = null;
  try {
    main = parse(localStorage.getItem(KEY));
    prev = parse(localStorage.getItem(PREV));
  } catch { /* storage blocked */ }
  // The previous copy is only a fallback for a corrupted main copy.
  return merge(main ?? prev);
}

// Folds in the IndexedDB copy; resolves with the merged list.
export async function loadDeep(current) {
  try {
    return merge(current, parse(await idbGet(KEY)));
  } catch {
    return current;
  }
}

let lastOk = true;
export function saveAll(games) {
  const json = JSON.stringify(games);
  let ok = false;
  try {
    const old = localStorage.getItem(KEY);
    if (old && old !== json) localStorage.setItem(PREV, old);
    localStorage.setItem(KEY, json);
    ok = true;
  } catch { /* quota or blocked; IndexedDB below still has it */ }
  idbSet(KEY, json).then(() => (lastOk = true)).catch(() => (lastOk = ok));
  return ok;
}
export const healthy = () => lastOk;

// Ask the browser not to evict our data under storage pressure.
export async function persist() {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) || false;
  } catch {
    return false;
  }
}

export function backupFile(games) {
  const body = JSON.stringify({ app: 'tball-tracker', version: 1, exported: new Date().toISOString(), games }, null, 1);
  const d = new Date().toLocaleDateString('en-CA');
  return new File([body], `teeball-backup-${d}.json`, { type: 'application/json' });
}

export async function readBackup(file) {
  const data = JSON.parse(await file.text());
  const list = Array.isArray(data) ? data : data?.games;
  if (!Array.isArray(list)) throw new Error('Not a Tee-ball backup file');
  // Restoring is explicit, so games deleted here earlier may come back.
  const s = gone();
  list.forEach((g) => s.delete(g?.id));
  try { localStorage.setItem(GONE, JSON.stringify([...s])); } catch { /* ignore */ }
  return merge(list);
}

const BK = 'tball.lastBackup';
export const lastBackup = () => { try { return +localStorage.getItem(BK) || 0; } catch { return 0; } };
export const markBackup = () => { try { localStorage.setItem(BK, String(Date.now())); } catch { /* ignore */ } };
