// Durable game storage. Every change is written to two places on the device
// (localStorage and IndexedDB) plus a rolling previous copy, so a corrupted
// write or one store being cleared doesn't lose games. Backups can be
// exported to a file and restored.
// exported to a file and restored with schema sanitization.

const KEY = 'tball.games.v1';
const PREV = 'tball.games.prev';
const DB = 'tball';
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const DEFAULT_COLORS = ['#3b82f6', '#e5484d'];

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

// Sanitize a game record from storage or untrusted backup JSON.
export function sanitizeGame(g) {
  if (!g || typeof g.id !== 'string' || !Array.isArray(g.events) || !Array.isArray(g.teams) || g.teams.length !== 2) {
    return null;
  }
  const cleanTeam = (t, idx) => {
    if (!t || typeof t !== 'object') return null;
    const players = Array.isArray(t.players)
      ? t.players.slice(0, 40).map((p) => String(p ?? '').trim().slice(0, 24))
      : Array(9).fill('');
    const color = typeof t.color === 'string' && HEX_COLOR_RE.test(t.color.trim())
      ? t.color.trim()
      : DEFAULT_COLORS[idx] || '#3b82f6';
    const start = typeof t.start === 'number' && t.start >= 1 && t.start <= players.length
      ? Math.floor(t.start)
      : players.length;
    return {
      ...t,
      name: String(t.name || `Team ${idx + 1}`).trim().slice(0, 30) || `Team ${idx + 1}`,
      color,
      players: players.length ? players : Array(9).fill(''),
      start: players.length ? start : 9,
    };
  };
  const t0 = cleanTeam(g.teams[0], 0);
  const t1 = cleanTeam(g.teams[1], 1);
  if (!t0 || !t1) return null;

  // Unknown fields are kept so data from newer versions isn't lost.
  const { signatureRaw, ...rest } = g; // dropped: older test builds stored a second signature copy
  const int = (v, def, lo, hi) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
  };
  return {
    ...rest,
    id: g.id.slice(0, 48),
    created: Number(g.created) || Date.now(),
    updated: Number(g.updated) || Number(g.created) || Date.now(),
    date: typeof g.date === 'string' ? g.date.slice(0, 16) : new Date().toLocaleDateString('en-CA'),
    venue: typeof g.venue === 'string' ? g.venue.slice(0, 80) : '',
    innings: int(g.innings, 4, 1, 30),
    maxOuts: int(g.maxOuts, 3, 0, 9),
    maxBatters: int(g.maxBatters, 9, 0, 30),
    strikeouts: g.strikeouts !== false,
    privacyMode: Boolean(g.privacyMode),
    teams: [t0, t1],
    events: g.events.filter((ev) => ev && typeof ev === 'object' && typeof ev.t === 'string'),
    signature: typeof g.signature === 'string' && g.signature.startsWith('data:image/png;base64,') ? g.signature : null,
  };
}

// Union of game lists by id; the most recently updated copy of each wins.
export function merge(...lists) {
  const byId = new Map();
  const dead = gone();
  for (const list of lists) {
    for (const raw of list || []) {
      const g = sanitizeGame(raw);
      if (!g || dead.has(g.id)) continue;
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

// `presets` is the team preset and squad, so a new phone gets them back too.
export function backupFile(games, presets) {
  const body = JSON.stringify({ app: 'tball-tracker', version: 1, exported: new Date().toISOString(), games, presets }, null, 1);
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
  return { games: merge(list), presets: Array.isArray(data) ? null : data?.presets ?? null };
}

const BK = 'tball.lastBackup';
export const lastBackup = () => { try { return +localStorage.getItem(BK) || 0; } catch { return 0; } };
export const markBackup = () => { try { localStorage.setItem(BK, String(Date.now())); } catch { /* ignore */ } };
