import {
  newGame, replay, battingTeam, currentInning, halfDone, canBat, canRun,
  pathClear, batterLimit, total, forcedMoves, canAllBat,
} from './model.js';
import { renderGrid, renderSheet, drawCell } from './draw.js';
import { ICON, esc, sheet, confirmSheet, toast, buzz, viewer } from './ui.js';
import * as db from './storage.js';
import { teamOptions, teamName, teamDefaultColor, fixtureOn, nextFixture } from './fixtures.js';

const app = document.getElementById('app');
const BASE = ['Home', '1st', '2nd', '3rd', 'Home'];
const COLORS = ['#3b82f6', '#e5484d', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899', '#0ea5e9', '#f97316', '#334155'];
const COLOR_NAMES = {
  '#3b82f6': 'Royal Blue',
  '#e5484d': 'Crimson Red',
  '#16a34a': 'Emerald Green',
  '#f59e0b': 'Amber Gold',
  '#8b5cf6': 'Electric Purple',
  '#ec4899': 'Hot Pink',
  '#0ea5e9': 'Sky Blue',
  '#f97316': 'Tangerine Orange',
  '#334155': 'Charcoal Slate',
};

const HITS = [
  { r: 1, label: '1st' },
  { r: 2, label: '2nd' },
  { r: 3, label: '3rd' },
  { r: 4, label: 'Home run' },
];
const OUTS = [
  { r: 'K', label: 'Struck out', hint: '3 strikes', glyph: 'K', icon: 'strikeout' },
  { r: 'C', label: 'Caught', hint: 'In the air', glyph: 'C', icon: 'caught' },
  { r: 'T', label: 'Tagged out', hint: 'Beaten to base', glyph: 'T', icon: 'tagged' },
];
const RULES = [
  { key: '3:9', title: '3 outs or 9 batters', text: 'Most junior leagues. Whichever comes first.' },
  { key: '3:0', title: '3 outs', text: 'Standard rule. Innings ends on the third out.' },
  { key: '0:0', title: 'Everyone bats', text: 'No outs limit. Innings ends when the whole team has batted.' },
  { key: 'custom', title: 'Custom', text: 'Set your own outs and batter limits.' },
];

// ---------- storage ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};
let games = db.loadSync();
function save() {
  if (game) game.updated = Date.now();
  if (!db.saveAll(games) && !db.healthy()) toast('Could not save on this device. Back up your games.');
}
let tips = store.get('tball.tips', true);
let shortcuts = store.get('tball.shortcuts', true); // Game day guide / Sample game on home

// Seed a realistic sample game on first run if no games exist yet so the user can test every screen immediately.
// The sample game is kept out of backups, reminders and carried-over teams.
const DEMO_ID = 'g-demo-live';
const realGames = () => games.filter((g) => g.id !== DEMO_ID);

function buildDemoGame() {
  const g = newGame({
    date: new Date().toLocaleDateString('en-CA'),
    venue: 'Aubin Grove Res · Diamond 3 · 8:30am',
    innings: 4,
    maxOuts: 3,
    maxBatters: 9,
    strikeouts: true,
    teams: [
      {
        name: 'Ninjas',
        color: '#3b82f6',
        players: ['Ava Smith', 'Ben Jones', 'Chloe Tan', 'Liam Patel', 'Mia Davis', 'Noah Wilson', 'Zoe Martin', 'Jack Taylor', 'Ruby White'],
      },
      {
        name: 'Willetton',
        color: '#e5484d',
        players: ['Leo Brown', 'Grace Lee', 'Sam Kelly', 'Isla Moore', 'Max Hall', 'Evie Young', 'Ollie King', 'Lily Scott', 'Hugo Green'],
      },
    ],
  });
  g.id = DEMO_ID;
  g.events = [
    // Innings 1 Top: Ninjas bat (3 runs, 3 outs)
    { t: 'bat', r: 2, m: 'Ava safe on 2nd' },
    { t: 'bat', r: 1, m: 'Ben safe on 1st, Ava to 3rd', g: 'p1' },
    { t: 'adv', p: 0, to: 3, m: 'Ben safe on 1st, Ava to 3rd', g: 'p1' },
    { t: 'bat', r: 4, m: 'Chloe hit a home run, Ava scored, Ben scored' },
    { t: 'bat', r: 'K', m: 'Liam struck out' },
    { t: 'bat', r: 'C', m: 'Mia caught' },
    { t: 'bat', r: 'T', m: 'Noah tagged out' },
    { t: 'end', m: 'innings ended' },
    // Innings 1 Bottom: Willetton bat (2 runs, 3 outs)
    { t: 'bat', r: 1, m: 'Leo safe on 1st' },
    { t: 'bat', r: 3, m: 'Grace safe on 3rd, Leo scored', g: 'p2' },
    { t: 'adv', p: 0, to: 4, m: 'Grace safe on 3rd, Leo scored', g: 'p2' },
    { t: 'bat', r: 1, m: 'Sam safe on 1st, Grace scored', g: 'p3' },
    { t: 'adv', p: 1, to: 4, m: 'Sam safe on 1st, Grace scored', g: 'p3' },
    { t: 'bat', r: 'T', m: 'Isla tagged out' },
    { t: 'bat', r: 'C', m: 'Max caught' },
    { t: 'bat', r: 'K', m: 'Evie struck out' },
    { t: 'end', m: 'innings ended' },
    // Innings 2 Top: Ninjas batting now (runners on 1st and 2nd, no outs, #9 Ruby up to bat)
    { t: 'bat', r: 2, m: 'Zoe safe on 2nd' },
    { t: 'bat', r: 1, m: 'Jack safe on 1st' },
  ];
  return g;
}

// Production: sample game is loaded on demand via the "Sample game" button on Home.

// ---------- app state ----------
let game = null;
let state = null;
let draft = null; // setup wizard
let selected = null; // selected runner (player index)
let pending = null; // play being placed before Confirm: {r, rows}
let upNext = null; // batter picked out of order, else null
let outPick = false; // runner panel asking where the runner was out
let lastCommit = 0; // time of the last saved play, to ignore double taps
let gridTeam = 0;
let current = 'home';
let redoStack = []; // holds popped event groups for Redo

function go(view, arg, fromPop = false) {
  current = view;
  document.body.dataset.view = view;
  selected = null;
  pending = null;
  upNext = null;
  outPick = false;
  if (!fromPop) {
    try { history.pushState({ view, gameId: game?.id || null }, ''); } catch { /* sandboxed iframe */ }
  }
  ({ home: renderHome, intro: renderIntro, setup: renderSetup, score: renderScore, sheet: renderSheetTab, finish: renderFinish })[view](arg);
  window.scrollTo(0, 0);
}

window.addEventListener('popstate', (e) => {
  const viewerEl = document.querySelector('.viewer');
  if (viewerEl) { viewerEl.querySelector('[data-v="close"]')?.click(); return; }
  const scrimEl = document.querySelector('.scrim');
  if (scrimEl) { scrimEl.querySelector('[data-close]')?.click(); return; }
  if (pending) { pending = null; renderScore(); return; }
  const target = e.state?.view;
  if (target && target !== current) {
    if (e.state?.gameId) game = games.find((g) => g.id === e.state.gameId) || game;
    go(target, undefined, true);
  } else if (current !== 'home') {
    go('home', undefined, true);
  }
});

// Click delegation: any element with data-action calls ACTIONS[name].
const ACTIONS = {};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled || el.closest('.scrim')) return;
  ACTIONS[el.dataset.action]?.(el, e);
});

const topBar = ({ back, title, sub, right = '' }) => `
  <header class="top">
    ${back ? `<button class="icon-btn" data-action="${back}" aria-label="Back">${ICON.back}</button>` : '<span class="brand-mark"></span>'}
    <div class="top-title"><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div>
    ${right}
  </header>`;
const helpBtn = `<button class="icon-btn" data-action="help" aria-label="Help">${ICON.help}</button>`;

// ---------- intro ----------
const ART = {
  tap: `<svg viewBox="0 0 200 140" class="art"><rect x="30" y="20" width="140" height="100" rx="18" class="a-card"/>
    <rect x="46" y="38" width="50" height="30" rx="8" class="a-safe"/><rect x="104" y="38" width="50" height="30" rx="8" class="a-safe"/>
    <rect x="46" y="76" width="50" height="30" rx="8" class="a-out"/><rect x="104" y="76" width="50" height="30" rx="8" class="a-out"/>
    <circle cx="130" cy="58" r="14" class="a-tap"/></svg>`,
  diamond: `<svg viewBox="0 0 200 140" class="art"><path d="M100 128L20 60a110 110 0 0 1 160 0z" class="a-grass"/>
    <path d="M100 118L150 72 100 26 50 72z" class="a-dirt"/>
    <rect x="144" y="66" width="12" height="12" transform="rotate(45 150 72)" class="a-base"/>
    <rect x="94" y="20" width="12" height="12" transform="rotate(45 100 26)" class="a-base"/>
    <rect x="44" y="66" width="12" height="12" transform="rotate(45 50 72)" class="a-base"/>
    <rect x="128" y="60" width="44" height="22" rx="11" class="a-chip"/><path d="M150 50 C 140 30, 120 24, 110 24" class="a-arrow"/></svg>`,
  share: `<svg viewBox="0 0 200 140" class="art"><rect x="50" y="14" width="100" height="112" rx="10" class="a-card"/>
    ${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<rect x="${62 + c * 26}" y="${28 + r * 26}" width="22" height="22" class="a-cell"/>`).join('')).join('')}
    <path d="M64 114c10-12 18 6 28-4s14 6 26-2" class="a-sig"/><circle cx="160" cy="100" r="22" class="a-tap"/>
    <path d="M160 110V90M152 97l8-8 8 8" class="a-share"/></svg>`,
};
const SLIDES = [
  { art: ART.tap, title: 'Score with taps', text: 'For each batter, tap what happened: a hit to a base, or how they got out. No scoring knowledge needed.' },
  { art: ART.diamond, title: 'Runners on the diamond', text: 'After each hit, the app lists everyone on base. Forced moves are pre-filled; tap any runner to adjust, then Confirm.' },
  { art: ART.share, title: 'Share the paper sheet', text: 'The app draws the official tee-ball scoresheet as you go. At the end the umpire signs and you share it in one tap.' },
];

function renderIntro(i = 0) {
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;
  app.innerHTML = `
    <section class="intro">
      <button class="skip" data-action="introDone">Skip</button>
      <div class="intro-art">${s.art}</div>
      <h2>${esc(s.title)}</h2>
      <p>${esc(s.text)}</p>
      <div class="dots">${SLIDES.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
      <button class="btn primary big" data-action="${last ? 'introDone' : 'introNext'}" data-i="${i + 1}">${last ? "Let's play" : 'Next'}</button>
    </section>`;
}
ACTIONS.introNext = (el) => renderIntro(+el.dataset.i);
ACTIONS.introDone = () => { store.set('tball.onboarded', true); go('home'); };

// ---------- home ----------
function safeColor(c, fallback) {
  return typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : fallback;
}

function gameCard(g) {
  const s = replay(g);
  const [a, b] = g.teams;
  const ra = total(s.teams[0].runs);
  const rb = total(s.teams[1].runs);
  const ca = safeColor(a.color, COLORS[0]);
  const cb = safeColor(b.color, COLORS[1]);
  const status = s.over ? 'Final' : `Innings ${Math.min(currentInning(s) + 1, g.innings)}`;
  return `
    <div class="game-card-wrap">
      <button class="game-card" data-action="open" data-id="${esc(g.id)}">
        <div class="gc-teams">
          <div class="gc-row"><i style="background:${ca}"></i><span>${esc(a.name)}</span><b>${ra}</b></div>
          <div class="gc-row"><i style="background:${cb}"></i><span>${esc(b.name)}</span><b>${rb}</b></div>
        </div>
        <div class="gc-meta"><span class="pill ${s.over ? '' : 'live'}">${status}</span>
          <span>${esc(fmtDate(g.date))}${g.venue ? ' · ' + esc(g.venue) : ''}</span></div>
      </button>
      <button class="gc-del" data-action="deleteCard" data-id="${esc(g.id)}" aria-label="Delete ${esc(a.name)} vs ${esc(b.name)}">${ICON.trash}</button>
    </div>`;
}

function renderHome() {
  const sorted = [...games].sort((a, b) => b.created - a.created);
  const live = sorted.filter((g) => !replay(g).over);
  const done = sorted.filter((g) => replay(g).over);
  app.innerHTML = `
    ${topBar({ title: 'Tee-ball', sub: 'Scorekeeper', right: `${helpBtn}<button class="icon-btn" data-action="homeMenu" aria-label="Backup and restore">${ICON.more}</button>` })}
    <main class="home">
      ${showInstall() ? `<div class="tip install">${ICON.phone}<p><b>Install the app</b> for full-screen scoring that works offline and keeps your games safe.</p>
        <button class="btn small" data-action="install">Install</button></div>` : ''}
      ${needsBackup() ? `<div class="tip backup">${ICON.shield}<p><b>Keep your games safe.</b> Save a backup file in case this phone is lost or its browser data is cleared.</p>
        <button class="btn small" data-action="backup">Back up</button></div>` : ''}
      <button class="hero-cta" data-action="new">
        <span class="cta-icon">${ICON.plus}</span>
        <span><b>New game</b><small>Set up teams in under a minute</small></span>
        ${ICON.chevron}
      </button>
      ${shortcuts ? `<div class="quick-links">
        <button class="quick-link" data-action="help">${ICON.bulb}<span>Game guide</span></button>
        <button class="quick-link" data-action="loadDemo">${ICON.sparkle}<span>Sample game</span></button>
        <button class="icon-btn sm quick-hide" data-action="hideShortcuts" aria-label="Hide shortcuts">${ICON.x}</button>
      </div>` : ''}
      ${live.length ? `<h2 class="section">In progress</h2>${live.map(gameCard).join('')}` : ''}
      ${done.length ? `<h2 class="section">Finished</h2>${done.map(gameCard).join('')}` : ''}
      ${games.length ? '' : `<div class="empty">${ART.diamond}<p>No games yet. Tap <b>New game</b> to start scoring${shortcuts ? ', or try the <b>Sample game</b>' : ''}.</p></div>`}
    </main>`;
}

ACTIONS.hideShortcuts = () => {
  shortcuts = false;
  store.set('tball.shortcuts', false);
  renderHome();
  toast('Shortcuts hidden. Bring them back from ⋯ on this screen');
};

ACTIONS.loadDemo = () => {
  const existing = games.find((g) => g.id === DEMO_ID);
  if (existing) {
    game = existing;
  } else {
    game = buildDemoGame();
    games.push(game);
    save();
  }
  redoStack = [];
  go('score');
  toast('Loaded sample live game (Innings 2 of 4)');
};

ACTIONS.deleteCard = async (el, e) => {
  e.stopPropagation();
  const target = games.find((g) => g.id === el.dataset.id);
  if (!target) return;
  if (!await confirmSheet('Delete this game?', `${target.teams[0].name} vs ${target.teams[1].name} will be permanently removed.`, 'Delete', 'danger')) return;
  db.forget(target.id);
  games = games.filter((g) => g.id !== target.id);
  if (game?.id === target.id) game = null;
  save();
  renderHome();
  toast('Game deleted');
};

// ---------- install as an app (PWA) ----------
let installPrompt = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const showInstall = () => !standalone() && !store.get('tball.installDismissed', false) && (installPrompt || isIOS());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  if (current === 'home') renderHome();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  toast('Installed! Open Tee-ball from your home screen.');
  if (current === 'home') renderHome();
});

ACTIONS.install = async () => {
  if (installPrompt) {
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    installPrompt = null;
    if (outcome !== 'accepted') store.set('tball.installDismissed', true);
    return renderHome();
  }
  const ios = isIOS();
  const ok = await sheet({
    title: 'Install Tee-ball',
    body: `<p class="sheet-text">Adds Tee-ball to your home screen like a normal app. It opens full screen and works with no signal.</p>
      <ol class="steps">${ios
        ? `<li><span>Open this page in <b>Safari</b></span></li>
           <li><span>Tap the <b>Share</b> button ${ICON.share}</span></li>
           <li><span>Scroll down and tap <b>Add to Home Screen</b></span></li>
           <li><span>Tap <b>Add</b></span></li>`
        : `<li><span>Open your browser menu (<b>⋮</b> or <b>…</b>)</span></li>
           <li><span>Tap <b>Install app</b> or <b>Add to Home screen</b></span></li>`}</ol>`,
    actions: [{ label: "Don't show again", value: 'hide', kind: 'ghost' }, { label: 'Got it', value: 'ok', kind: 'primary' }],
  });
  if (ok === 'hide') { store.set('tball.installDismissed', true); renderHome(); }
};

// Nudge for a backup once a finished game has changed since the last one.
function needsBackup() {
  const since = db.lastBackup();
  return realGames().some((g) => (g.updated || g.created) > since && replay(g).over);
}

ACTIONS.homeMenu = async () => {
  const when = db.lastBackup();
  const own = teamName(myTeam);
  const v = await sheet({
    title: 'Options & data',
    body: `<p class="sheet-text">Games and your team preset are saved on this device and work fully offline.
      ${when ? `Last backup: <b>${esc(new Date(when).toLocaleString())}</b>.` : 'No backup made yet.'}</p>
      <div class="menu-list">
        <button class="menu-item" data-i="2">${ICON.shield}<span><b>Preset my team</b><small>${own ? `${esc(own)} · auto-fills opponent, colours &amp; venue` : 'Choose your team for automatic game-day setup'}</small></span></button>
        <button class="menu-item" data-i="0">${ICON.download}<span><b>Back up all games</b><small>Save or send a backup file (e.g. to Files, Drive or email)</small></span></button>
        <button class="menu-item" data-i="1">${ICON.upload}<span><b>Restore from backup</b><small>Adds games from a backup file; nothing is overwritten with older data</small></span></button>
        <button class="menu-item" data-i="3">${ICON.sparkle}<span><b>Sample game</b><small>Open a live 2nd-innings demo</small></span></button>
        <button class="menu-item" data-i="4">${ICON.bulb}<span><b>${shortcuts ? 'Hide' : 'Show'} home shortcuts</b><small>Game day guide and Sample game buttons</small></span></button>
      </div>`,
    actions: [{ value: 'backup' }, { value: 'restore' }, { value: 'presetTeam' }, { value: 'demo' }, { value: 'shortcuts' }],
  });
  if (v === 'demo') ACTIONS.loadDemo();
  if (v === 'shortcuts') { shortcuts = !shortcuts; store.set('tball.shortcuts', shortcuts); renderHome(); }
  if (v === 'presetTeam') ACTIONS.presetTeam();
  if (v === 'backup') ACTIONS.backup();
  if (v === 'restore') restore();
};

ACTIONS.backup = async () => {
  if (!games.length) return toast('No games to back up yet');
  const file = db.backupFile(realGames(), { myTeam, teamPresets });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Tee-ball backup' });
      db.markBackup();
      toast('Backup saved');
    } catch (e) {
      if (e.name !== 'AbortError') { saveFile(file); db.markBackup(); }
    }
  } else {
    saveFile(file);
    db.markBackup();
    toast('Backup downloaded');
  }
  if (current === 'home') renderHome();
};

function restore() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json,application/json';
  inp.onchange = async () => {
    try {
      const { games: incoming, presets } = await db.readBackup(inp.files[0]);
      const before = games.length;
      games = db.merge(games, incoming);
      restorePresets(presets);
      db.saveAll(games);
      toast(`Restored. ${games.length - before} new game${games.length - before === 1 ? '' : 's'} added.`);
      renderHome();
    } catch {
      toast("That file isn't a Tee-ball backup");
    }
  };
  inp.click();
}

// Adds the team preset and squad from a backup without removing anything
// already on this phone: missing settings are filled in, squads are merged.
function restorePresets(p) {
  if (!p || typeof p !== 'object') return;
  if (!myTeam && typeof p.myTeam === 'string' && teamName(p.myTeam)) {
    myTeam = p.myTeam;
    store.set('tball.myTeam', myTeam);
  }
  for (const [key, v] of Object.entries(p.teamPresets || {})) {
    if (!v || typeof v !== 'object') continue;
    const have = teamPresets[key] || {};
    const merged = { ...have };
    if (!have.color && safeColor(v.color, '')) merged.color = v.color;
    if (!have.players?.length && Array.isArray(v.players)) merged.players = v.players.map((n) => String(n ?? '').slice(0, 24)).slice(0, 40);
    teamPresets[key] = merged;
    if (Array.isArray(v.squad)) setSquad([...(have.squad || []), ...v.squad], key);
  }
  store.set('tball.teamPresets', teamPresets);
  ensureSquad();
}

function saveFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

ACTIONS.open = (el) => {
  game = games.find((g) => g.id === el.dataset.id);
  if (!game) return;
  redoStack = [];
  go('score');
};

// ---------- fixture & device team presets ----------
// The user's team and per-team colours/rosters are kept on this device only.
let myTeam = store.get('tball.myTeam', '');
let teamPresets = store.get('tball.teamPresets', {});

function getDeviceTeamData(name, fxKey = '') {
  const byKey = fxKey && teamPresets[fxKey];
  const byName = name && teamPresets[name];
  const fromGames = name
    ? realGames().sort((a, b) => (b.updated || b.created) - (a.updated || a.created)).flatMap((g) => g.teams).find((t) => t.name === name)
    : null;
  const defColor = fxKey ? teamDefaultColor(fxKey) : '';
  const color = safeColor(byKey?.color || byName?.color || fromGames?.color || defColor, '');
  const squad = fxKey ? squadOf(fxKey) : null;
  const players = squad?.length
    ? [...squad]
    : Array.isArray(byKey?.players) && byKey.players.length
    ? [...byKey.players]
    : Array.isArray(byName?.players) && byName.players.length
      ? [...byName.players]
      : fromGames?.players?.length
        ? [...fromGames.players]
        : [];
  return { color, players };
}

function saveDeviceTeamData(name, fxKey, color, players) {
  if (!name && !fxKey) return;
  const entry = {};
  if (color) entry.color = safeColor(color, COLORS[0]);
  if (Array.isArray(players) && players.some((p) => p)) entry.players = [...players];
  if (fxKey) teamPresets[fxKey] = { ...(teamPresets[fxKey] || {}), ...entry };
  if (name) teamPresets[name] = { ...(teamPresets[name] || {}), ...entry };
  store.set('tball.teamPresets', teamPresets);
}

// The full squad of the user's own team, kept on this phone (and in backup
// files). Each game starts from it in squad order; children missing that
// day are marked Not here, so the squad itself never shrinks.
function squadOf(key = myTeam) {
  return key && Array.isArray(teamPresets[key]?.squad) ? teamPresets[key].squad : null;
}
function setSquad(names, key = myTeam) {
  if (!key) return;
  const clean = [...new Set(names.map((n) => String(n ?? '').trim().slice(0, 24)).filter(Boolean))];
  teamPresets[key] = { ...(teamPresets[key] || {}), squad: clean };
  store.set('tball.teamPresets', teamPresets);
}
// A team picked before squads existed starts from its latest player list.
function ensureSquad() {
  if (myTeam && !squadOf()) setSquad(getDeviceTeamData(teamName(myTeam), myTeam).players);
}
ensureSquad();
const isOwn = (name) => !!myTeam && !!name && name === teamName(myTeam);
// Named players not in the squad yet, for the "Add to the squad?" prompt.
function notInSquad(names) {
  const s = squadOf();
  return s ? [...new Set(names.map((n) => (n || '').trim()).filter((n) => n && !s.includes(n)))] : [];
}
async function offerSquadAdd(names) {
  if (!names.length) return;
  const one = names.length === 1;
  const ok = await confirmSheet(
    'Add to the squad?',
    `${names.join(', ')} ${one ? "isn't" : "aren't"} in your ${teamName(myTeam)} squad yet. Add ${one ? 'them' : 'them all'} so ${one ? 'they show' : 'they show'} up in future games?`,
    'Add to squad',
  );
  if (!ok) return;
  setSquad([...squadOf(), ...names]);
  toast(`Added to the squad: ${names.join(', ')}`);
}

function distinctColor(preferred, avoid) {
  const c = safeColor(preferred, COLORS[1]);
  if (c !== avoid) return c;
  return COLORS.find((x) => x !== avoid) || COLORS[1];
}

// ---------- setup wizard ----------
const STEPS = ['Teams', 'Players', 'Rules'];

ACTIONS.new = ( startDate ) => {
  const last = realGames().sort((a, b) => b.created - a.created)[0];
  // Carry over the user's own team from the last game: the one matching the
  // picked fixture team, else the one that batted first.
  const own = teamName(myTeam);
  const mineData = own ? getDeviceTeamData(own, myTeam) : null;
  const fallbackTeam = !own ? last?.teams[0] : null;
  const initName = own || fallbackTeam?.name || '';
  const initColor = safeColor(mineData?.color || fallbackTeam?.color, COLORS[0]);
  const initPlayers = mineData?.players?.length ? [...mineData.players] : fallbackTeam ? [...fallbackTeam.players] : [];
  const today = typeof startDate === 'string' ? startDate : new Date().toLocaleDateString('en-CA');
  draft = {
    editing: false,
    step: 0,
    tab: 0,
    date: today,
    venue: '',
    innings: last?.innings || 4,
    maxOuts: last?.maxOuts ?? 3,
    maxBatters: last?.maxBatters ?? 9,
    strikeouts: last?.strikeouts ?? true,
    // Start from last game's own team to save typing each week.
    teams: [
      { name: initName, color: initColor, players: initPlayers },
      { name: '', color: distinctColor(COLORS[1], initColor), players: [] },
    ],
    locked: [0, 0],
    full: [false, false],
    // A carried-over name is a default, so the fixture may replace it.
    auto: {
      mine: initName,
      opp: '',
      venue: '',
      myColor: initColor,
      oppColor: distinctColor(COLORS[1], initColor),
      players: JSON.stringify(initPlayers),
      oppPlayers: JSON.stringify([]),
    },
  };
  draft.preset = presetOf(draft);
  applyFixture();
  go('setup');
};

// ---------- fixture ----------
// The user's team is picked in the app and kept on this phone only.
// Fill names and venue from the fixture, leaving anything the user typed.
// Fill names, team colours, saved rosters, and venue from the fixture + device data.
function applyFixture() {
  const d = draft;
  const fx = fixtureOn(myTeam, d.date);
  const own = teamName(myTeam);
  const mineAt = d.teams.findIndex((t) => t.name && t.name === (d.auto.mine || own));
  const mine = mineAt < 0 ? 0 : mineAt;
  const opp = 1 - mine;
  const free = (v, last) => !v.trim() || v === last;

  if (own && free(d.teams[mine].name, d.auto.mine)) {
    d.teams[mine].name = own;
    d.auto.mine = own;
  }
  const mineInfo = own ? getDeviceTeamData(own, myTeam) : null;
  if (mineInfo?.color && (!d.teams[mine].color || d.teams[mine].color === d.auto.myColor)) {
    d.teams[mine].color = mineInfo.color;
    d.auto.myColor = mineInfo.color;
  }
  if (mineInfo?.players?.length && JSON.stringify(d.teams[mine].players) === d.auto.players) {
    d.teams[mine].players = [...mineInfo.players];
    d.auto.players = JSON.stringify(d.teams[mine].players);
  }

  const g = fx?.type === 'game' ? fx : null;
  if (free(d.teams[opp].name, d.auto.opp)) {
    d.teams[opp].name = g ? g.opponent : '';
    d.auto.opp = d.teams[opp].name;
  }
  if (g) {
    const oppInfo = getDeviceTeamData(g.opponent, g.oppKey);
    const wantedOppColor = distinctColor(oppInfo.color || g.oppColor || COLORS[1], d.teams[mine].color);
    if (!d.teams[opp].color || d.teams[opp].color === d.auto.oppColor) {
      d.teams[opp].color = wantedOppColor;
      d.auto.oppColor = wantedOppColor;
    }
    if (oppInfo.players?.length && JSON.stringify(d.teams[opp].players) === d.auto.oppPlayers) {
      d.teams[opp].players = [...oppInfo.players];
      d.auto.oppPlayers = JSON.stringify(d.teams[opp].players);
    }
  }
  if (free(d.venue, d.auto.venue)) {
    d.venue = g ? g.venue : '';
    d.auto.venue = d.venue;
  }
}

function fixtureCard() {
  const fx = fixtureOn(myTeam, draft.date);
  let line = '';
  if (fx?.type === 'game') line = `<p class="fx-line"><b>v ${esc(fx.opponent)}</b> (${fx.home ? 'home' : 'away'}) · ${esc(fx.venue)}</p>`;
  else if (fx?.type === 'bye') line = '<p class="fx-line">Bye this round.</p>';
  else if (fx) line = `<p class="fx-line">${esc(fx.text)}.</p>`;
  if (myTeam && fx?.type !== 'game') {
    const nx = nextFixture(myTeam, draft.date);
    line += nx ? `<button class="fx-next" data-action="fixtureDate" data-d="${esc(nx.date)}">Next game: <b>${esc(fmtDate(nx.date))}</b> v ${esc(nx.opponent)} · ${esc(nx.ground)}</button>`
      : (fx ? '' : '<p class="fx-line">No more games in the fixture.</p>');
  }
  return `
    <div class="card">
      <label class="field"><span>My team preset <em>saved on this device, auto-fills opponent, colours &amp; venue</em></span>
        <select class="input" id="my-team">
          <option value="">Not set</option>
          ${teamOptions().map((g) => `<optgroup label="${esc(g.label)}">${g.teams.map((t) => `<option value="${esc(t.key)}" ${t.key === myTeam ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</optgroup>`).join('')}
        </select></label>
      ${line}
    </div>`;
}

// Picking a team brings in its players from the latest game it played,
// unless the carried-over list has already been edited.
function carryTeam() {
  const d = draft;
  const own = teamName(myTeam);
  const info = own ? getDeviceTeamData(own, myTeam) : null;
  const at = d.teams.findIndex((t) => t.name && t.name === d.auto.mine);
  const t = d.teams[at < 0 ? 0 : at];
  if (!info) return;
  if (info.players.length && JSON.stringify(t.players) === d.auto.players) {
    t.players = [...info.players];
    d.auto.players = JSON.stringify(t.players);
  }
  if (info.color && t.color === d.auto.myColor) {
    t.color = safeColor(info.color, COLORS[0]);
    d.auto.myColor = t.color;
  }
}

ACTIONS.fixtureDate = (el) => { draft.date = el.dataset.d; applyFixture(); renderSetup(); };

ACTIONS.editGame = () => {
  draft = {
    editing: true,
    step: 0,
    tab: 0,
    date: game.date,
    venue: game.venue,
    innings: game.innings,
    maxOuts: game.maxOuts,
    maxBatters: game.maxBatters,
    strikeouts: game.strikeouts ?? true,
    // Events refer to batting positions, so players who have batted keep
    // their spot (they can still be renamed). Batting runs 1, 2, 3… so
    // they are always the first `bats` positions. Once the whole lineup
    // has batted, adding players would change who batted earlier.
    // Once play has started, players are renamed here only; adding, removing
    // and reordering go through Lineup so past plays keep their players.
    teams: game.teams.map((t, i) => ({ name: t.name, color: safeColor(t.color, COLORS[i]), players: [...t.players] })),
    locked: game.teams.map((t) => (game.events.length ? t.players.length : 0)),
    full: game.teams.map(() => game.events.length > 0),
  };
  draft.preset = presetOf(draft);
  go('setup');
};

function presetOf(d) {
  const k = `${d.maxOuts}:${d.maxBatters}`;
  return RULES.some((r) => r.key === k) ? k : 'custom';
}

function renderSetup() {
  const d = draft;
  const step = d.step;
  const body = [setupTeams, setupPlayers, setupRules][step]();
  const last = step === STEPS.length - 1;
  app.innerHTML = `
    ${topBar({ back: 'setupBack', title: d.editing ? 'Edit game' : 'New game', sub: `Step ${step + 1} of 3 · ${STEPS[step]}` })}
    <div class="stepper">${STEPS.map((s, i) => `<span class="${i <= step ? 'on' : ''}"></span>`).join('')}</div>
    <main class="setup">${body}<p id="setup-error" class="error" hidden></p></main>
    <footer class="action-bar">
      ${step ? '<button class="btn ghost" data-action="setupBack">Back</button>' : ''}
      <button class="btn primary grow" data-action="setupNext">${last ? (d.editing ? 'Save changes' : 'Start game') : 'Next'}</button>
    </footer>`;
  bindSetupInputs();
}

function teamFields(i) {
  const t = draft.teams[i];
  const tc = safeColor(t.color, COLORS[i]);
  return `
    <div class="card team-card" style="--team:${tc}">
      <div class="team-card-head"><span class="order">${i ? 'Bats second' : 'Bats first'}</span></div>
      <input class="input big" data-bind="team:${i}:name" value="${esc(t.name)}" placeholder="${i ? 'Opponent name' : 'Your team name'}" autocomplete="off" enterkeyhint="next" maxlength="30">
      <div class="swatches" role="radiogroup" aria-label="Team colour">
        ${COLORS.map((c) => `<button class="swatch ${c === tc ? 'on' : ''}" role="radio" aria-checked="${c === tc}" style="--c:${c}" data-action="color" data-t="${i}" data-c="${c}" aria-label="${COLOR_NAMES[c] || c}"></button>`).join('')}
      </div>
    </div>`;
}

function setupTeams() {
  return `
    <p class="lead">Who's playing? The team that bats first goes on top.</p>
    ${draft.editing ? '' : fixtureCard()}
    ${teamFields(0)}
    <button class="swap-btn" data-action="swapTeams">${ICON.swap} Swap batting order</button>
    ${teamFields(1)}
    <div class="card">
      <label class="field"><span>Date</span><input class="input" type="date" data-bind="date" value="${esc(draft.date)}" enterkeyhint="next"></label>
      <label class="field"><span>Venue <em>optional</em></span><input class="input" data-bind="venue" value="${esc(draft.venue)}" placeholder="e.g. Riverside Park" autocomplete="off" enterkeyhint="done"></label>
    </div>`;
}

function setupPlayers() {
  const i = draft.tab;
  const t = draft.teams[i];
  const locked = draft.locked[i];
  // The user's own team starts from the squad: mark who isn't here instead
  // of deleting them.
  const squad = !draft.editing && isOwn(t.name) ? squadOf() : null;
  const out = t.out || [];
  const inSquad = (p) => !!squad && !!p.trim() && squad.includes(p.trim());
  return `
    <p class="lead">${squad
      ? 'Your squad, in squad order. Tap <b>Not here</b> for anyone missing today, then drag to set today\'s batting order.'
      : 'Add players in batting order. Tip: paste a comma-separated list to add the whole team at once, or leave blank for numbers (#1, #2…).'}</p>
    <div class="segmented">${draft.teams.map((tm, k) => `
      <button class="${k === i ? 'on' : ''}" data-action="tab" data-t="${k}" style="--team:${safeColor(tm.color, COLORS[k])}">
        <i></i><span class="seg-name">${esc(tm.name || (k ? 'Team 2' : 'Team 1'))}</span> <small>${tm.players.length}</small></button>`).join('')}
    </div>
    ${draft.full[i] ? `<p class="hint-line">${ICON.lock} The game has started: rename players here. To add, remove or reorder, use <b>Lineup</b> on the Score screen.</p>` : `<div class="add-row">
      <input class="input" id="new-player" placeholder="Name or paste list (e.g. Ava, Ben, Chloe)" autocomplete="off" enterkeyhint="done" maxlength="300">
      <button class="btn primary" data-action="addPlayer">${ICON.plus}<span class="sr">Add</span></button>
    </div>`}
    ${t.players.length > 1 ? `<p class="hint-line">${locked ? 'Players who have already batted keep their spot. ' : ''}Drag ${ICON.grip} to change the batting order.</p>` : ''}
    <ol class="players" id="players">
      ${t.players.map((p, k) => `
        <li data-k="${k}" class="${k < locked ? 'locked' : ''}">
          <span class="num">${k + 1}</span>
          ${inSquad(p) ? `<button class="btn small out not-here" data-action="notHere" data-k="${k}">Not here</button>` : ''}
          <input class="input bare" data-bind="player:${i}:${k}" value="${esc(p)}" placeholder="#${k + 1}" aria-label="Player ${k + 1} name" enterkeyhint="${k < t.players.length - 1 ? 'next' : 'done'}" maxlength="24">
          ${inSquad(p) ? '' : `<button class="icon-btn sm" data-action="removePlayer" data-k="${k}" ${k < locked ? 'disabled' : ''} aria-label="Remove">${ICON.x}</button>`}
          ${k < locked ? `<span class="grip off" aria-hidden="true">${ICON.lock}</span>`
            : `<span class="grip" data-grip="${k}" role="button" tabindex="0" aria-label="Drag, or use arrow keys, to move ${esc(p || `player ${k + 1}`)}">${ICON.grip}</span>`}
        </li>`).join('')}
    </ol>
    ${out.length ? `<h4 class="lu-h">Not here today</h4><ul class="lu-list">${out.map((n, k) => `
      <li class="lu-row gone"><span class="lu-name">${esc(n)}</span>
        <button class="btn small ghost" data-action="isHere" data-k="${k}">Here</button></li>`).join('')}</ul>` : ''}
    ${t.players.length ? '' : `<div class="empty small"><p>No players yet.</p>
      <button class="btn ghost" data-action="quickFill">Add 9 numbered players</button></div>`}`;
}

function setupRules() {
  const d = draft;
  const played = d.editing ? Math.ceil(replay(game).half / 2) : 0;
  return `
    <p class="lead">How long is the game, and when does each innings end? Ask your coach if unsure; the first option suits most junior leagues.</p>
    <div class="card stepper-row">
      <div><b>Innings</b><small>Each team bats once per innings</small></div>
      <div class="num-stepper">
        <button class="icon-btn" data-action="innings" data-d="-1" ${d.innings <= Math.max(1, played) ? 'disabled' : ''} aria-label="Fewer">−</button>
        <output>${d.innings}</output>
        <button class="icon-btn" data-action="innings" data-d="1" ${d.innings >= 12 ? 'disabled' : ''} aria-label="More">+</button>
      </div>
    </div>
    <h2 class="section">Innings ends after</h2>
    <div class="choices">
      ${RULES.map((r) => `
        <button class="choice ${d.preset === r.key ? 'on' : ''}" data-action="preset" data-k="${r.key}">
          <span class="radio"></span><span><b>${r.title}</b><small>${r.text}</small></span>
        </button>`).join('')}
    </div>
    ${d.preset === 'custom' ? `
      <div class="card row2">
        <label class="field"><span>Outs <em>0 = no limit</em></span><input class="input" type="number" min="0" max="9" inputmode="numeric" enterkeyhint="next" data-bind="maxOuts" value="${d.maxOuts}"></label>
        <label class="field"><span>Batters <em>0 = whole team</em></span><input class="input" type="number" min="0" max="30" inputmode="numeric" enterkeyhint="done" data-bind="maxBatters" value="${d.maxBatters}"></label>
      </div>` : ''}
    <h2 class="section">Strikeouts</h2>
    <div class="card">
      <label class="toggle setting"><input type="checkbox" data-action="strikeouts" ${d.strikeouts ? 'checked' : ''}><span></span>
        <div><b>Batters can strike out</b><small>Out after 3 misses. Many junior leagues let the batter keep swinging until they hit, so turn this off if yours does. You can change it later.</small></div></label>
    </div>`;
}

function bindSetupInputs() {
  app.querySelectorAll('[data-bind]').forEach((el) =>
    el.addEventListener('input', () => {
      const [k, a, b] = el.dataset.bind.split(':');
      if (k === 'team') draft.teams[+a][b] = el.value;
      else if (k === 'player') draft.teams[+a].players[+b] = el.value;
      else if (k === 'maxOuts' || k === 'maxBatters') draft[k] = Math.max(0, +el.value || 0);
      else draft[k] = el.value;
    }),
  );
  bindPlayerDrag();
  // A new date or team refills the opponent and venue from the fixture.
  const refill = () => { if (!draft.editing) { applyFixture(); renderSetup(); } };
  app.querySelector('[data-bind="date"]')?.addEventListener('change', refill);
  app.querySelector('#my-team')?.addEventListener('change', (e) => {
    myTeam = e.target.value;
    ensureSquad();
    if (!draft.editing) carryTeam();
    store.set('tball.myTeam', myTeam);
    refill();
  });
  const np = document.getElementById('new-player');
  np?.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text') || '';
    if (text.includes(',') || text.includes('\n')) {
      e.preventDefault();
      addPlayerNames(text);
    }
  });
}

function addPlayerNames(raw) {
  const t = draft.teams[draft.tab];
  const parts = raw.split(/[\n,]+/).map((s) => s.trim().slice(0, 24)).filter(Boolean);
  if (parts.length > 1) {
    t.players.push(...parts);
    toast(`Added ${parts.length} players`);
  } else {
    t.players.push((parts[0] || '').slice(0, 24));
  }
  renderSetup();
  document.getElementById('new-player')?.focus();
}

const setupError = (msg) => {
  const el = document.getElementById('setup-error');
  el.textContent = msg;
  el.hidden = false;
  buzz(30);
};

ACTIONS.color = (el) => {
  const tIdx = +el.dataset.t;
  const c = safeColor(el.dataset.c, COLORS[0]);
  draft.teams[tIdx].color = c;
  const card = el.closest('.team-card');
  if (card) {
    card.style.setProperty('--team', c);
    card.querySelectorAll('.swatch').forEach((sw) => {
      const on = sw.dataset.c === c;
      sw.classList.toggle('on', on);
      sw.setAttribute('aria-checked', String(on));
    });
  } else {
    renderSetup();
  }
};
ACTIONS.swapTeams = () => {
  if (draft.full[0] || draft.locked[0]) return toast("Batting order can't change once the game has started");
  draft.teams.reverse();
  renderSetup();
};
ACTIONS.tab = (el) => { draft.tab = +el.dataset.t; renderSetup(); };
ACTIONS.addPlayer = () => {
  const inp = document.getElementById('new-player');
  if (!inp) return;
  addPlayerNames(inp.value);
};
ACTIONS.quickFill = () => {
  const t = draft.teams[draft.tab];
  for (let k = 1; k <= 9; k++) t.players.push('');
  renderSetup();
};
// Drag and drop reordering (pointer events, so it works with touch).
// Rows below the dragged one slide to show where it will land.

function bindPlayerDrag() {
  const list = document.getElementById('players');
  if (!list) return;
  makeSortable(list, draft.locked[draft.tab], (from, to) => {
    const ps = draft.teams[draft.tab].players;
    ps.splice(to, 0, ps.splice(from, 1)[0]);
    renderSetup();
  });
}

// Drag and drop reordering for a list whose rows have a [data-grip=index]
// handle (pointer events, so it works with touch). Rows below the dragged
// one slide to show where it will land. Rows before `min` stay put. The
// grip is focusable and Arrow up/down move the row too. onMove(from, to)
// saves the change and redraws the list.
function makeSortable(list, min, onMove) {
  // Inside a bottom sheet the sheet scrolls, elsewhere the page does.
  const box = list.closest('.bsheet');
  const scrollTop = () => (box ? box.scrollTop : window.scrollY);
  const scrollBy = (v) => (box ? box.scrollBy(0, v) : window.scrollBy(0, v));
  const refocus = (to) => document.querySelector(`#${list.id} [data-grip="${to}"]`)?.focus();

  list.addEventListener('keydown', (e) => {
    const grip = e.target.closest('[data-grip]');
    if (!grip || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const from = +grip.dataset.grip;
    const to = from + (e.key === 'ArrowUp' ? -1 : 1);
    if (to < min || to >= list.children.length) return;
    onMove(from, to);
    refocus(to);
  });

  // Phones treat a held finger as a long press (text selection, copy menu,
  // context menu) unless the touch itself is claimed by the grip.
  const onGrip = (e) => { if (e.target.closest('[data-grip]')) e.preventDefault(); };
  list.addEventListener('touchstart', onGrip, { passive: false });
  list.addEventListener('contextmenu', onGrip);
  list.addEventListener('selectstart', onGrip);

  list.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('[data-grip]');
    if (!grip) return;
    e.preventDefault();
    document.activeElement?.blur?.();
    const rows = [...list.children];
    const from = +grip.dataset.grip;
    const row = rows[from];
    const pitch = rows.length > 1 ? rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top : row.offsetHeight;
    const startY = e.clientY + scrollTop();
    let to = from;
    let lastY = e.clientY;
    let raf = 0;
    grip.setPointerCapture(e.pointerId);
    row.classList.add('dragging');
    list.classList.add('sorting');
    buzz(8);

    const update = () => {
      const dy = lastY + scrollTop() - startY;
      row.style.transform = `translateY(${dy}px)`;
      to = Math.max(min, Math.min(rows.length - 1, from + Math.round(dy / pitch)));
      rows.forEach((r, k) => {
        if (r === row) return;
        let shift = 0;
        if (from < to && k > from && k <= to) shift = -pitch;
        if (from > to && k >= to && k < from) shift = pitch;
        r.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    // Scroll while dragging near the top or bottom edge, once the row has
    // actually moved (so grabbing a row near an edge doesn't scroll).
    let moved = false;
    const edgeScroll = () => {
      const r = box ? box.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const top = r.top + (box ? 60 : 90);
      const bottom = r.bottom - (box ? 60 : 110);
      moved ||= Math.abs(lastY - e.clientY) > 12;
      const v = !moved ? 0 : lastY < top ? -(top - lastY) / 6 : lastY > bottom ? (lastY - bottom) / 6 : 0;
      if (v) { scrollBy(v); update(); }
      raf = requestAnimationFrame(edgeScroll);
    };
    raf = requestAnimationFrame(edgeScroll);

    const move = (ev) => { lastY = ev.clientY; update(); };
    const done = () => {
      cancelAnimationFrame(raf);
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', done);
      grip.removeEventListener('pointercancel', done);
      if (to !== from) buzz(10);
      rows.forEach((r) => { r.style.transform = ''; });
      row.classList.remove('dragging');
      list.classList.remove('sorting');
      onMove(from, to);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', done);
    grip.addEventListener('pointercancel', done);
  });
}
ACTIONS.removePlayer = (el) => { draft.teams[draft.tab].players.splice(+el.dataset.k, 1); renderSetup(); };
ACTIONS.notHere = (el) => {
  const t = draft.teams[draft.tab];
  (t.out ||= []).push(...t.players.splice(+el.dataset.k, 1));
  renderSetup();
};
// Back in today's lineup, at the end of the batting order.
ACTIONS.isHere = (el) => {
  const t = draft.teams[draft.tab];
  t.players.push(...t.out.splice(+el.dataset.k, 1));
  renderSetup();
};
ACTIONS.innings = (el) => { draft.innings += +el.dataset.d; renderSetup(); };
ACTIONS.strikeouts = (el) => { draft.strikeouts = el.checked; };
ACTIONS.preset = (el) => {
  draft.preset = el.dataset.k;
  if (draft.preset !== 'custom') [draft.maxOuts, draft.maxBatters] = draft.preset.split(':').map(Number);
  renderSetup();
};

ACTIONS.setupBack = () => {
  if (draft.step === 0) return go(draft.editing ? 'score' : 'home');
  draft.step--;
  renderSetup();
};

ACTIONS.setupNext = () => {
  const d = draft;
  if (d.step === 0) {
    d.teams.forEach((t) => (t.name = t.name.trim()));
    if (!d.teams[0].name || !d.teams[1].name) return setupError('Give both teams a name.');
    if (d.teams[0].name === d.teams[1].name) return setupError('The teams need different names.');
  }
  if (d.step === 1) {
    // Unnamed players are stored blank and shown by batting number.
    d.teams.forEach((t) => (t.players = t.players.map((p) => p.trim())));
    const empty = d.teams.filter((t) => !t.players.length);
    empty.forEach((t) => (t.players = Array(9).fill('')));
  }
  if (d.step < 2) { d.step++; return renderSetup(); }

  const opts = {
    date: d.date,
    venue: d.venue.trim(),
    innings: d.innings,
    maxOuts: d.maxOuts,
    maxBatters: d.maxBatters,
    strikeouts: d.strikeouts,
    teams: d.teams.map((t, idx) => ({
      name: t.name,
      color: safeColor(t.color, COLORS[idx]),
      players: t.players,
      // Before the first play the lineup can still grow or shrink here; after
      // that it only changes through Lineup, which keeps its own start.
      start: d.editing && game.events.length ? (game.teams[idx].start ?? t.players.length) : t.players.length,
    })),
  };
  const own = teamName(myTeam);
  opts.teams.forEach((t) => {
    saveDeviceTeamData(t.name, own && t.name === own ? myTeam : '', t.color, t.players);
  });
  if (d.editing) Object.assign(game, opts);
  else { game = newGame(opts); games.push(game); db.persist(); }
  redoStack = [];
  save();
  go('score');
  const mine = opts.teams.find((t) => isOwn(t.name));
  if (mine) offerSquadAdd(notInSquad(mine.players));
};

// ---------- scoring ----------
// Older games have no setting: strikeouts were always available.
const strikeoutsOn = () => game.strikeouts !== false;
const lastEvent = () => game.events[game.events.length - 1];
const anyRunners = () => state.runners.some((r) => r != null);
// Players without a name go by their batting number.
const playerName = (team, p) => game.teams[team].players[p] || `Batter #${p + 1}`;
// Who is batting now: the next in order unless another player was picked.
// Nobody bats twice in one innings column or while on base, so after a
// lineup change the next in order may be skipped to the first who can bat.

function batterUp(bt) {
  if (upNext != null) return upNext;
  const T = state.teams[bt];
  const inning = currentInning(state);
  const i = T.order.indexOf(T.next);
  if (i < 0) return T.next;
  for (let k = 0; k < T.order.length; k++) {
    const p = T.order[(i + k) % T.order.length];
    if (!T.cells[inning + ':' + p] && !state.runners.includes(p)) return p;
  }
  return T.next;
}
const batEvent = (r) => {
  const bt = battingTeam(state);
  const p = batterUp(bt);
  return p !== state.teams[bt].next ? { t: 'bat', r, p } : { t: 'bat', r };
};
const tooSoon = () => Date.now() - lastCommit < 450;
const shortName = (team, p) => game.teams[team].players[p]?.split(' ')[0] || `#${p + 1}`;

// Phase is derived from the log so undo always lands in the right place.
function phase() {
  if (state.over) return 'over';
  if (pending) return 'confirm';
  if (halfDone(game, state)) return 'inningsOver';
  return 'bat';
}

// The description is stored on the event and shown in the top bar next to
// Undo, so no pop-up ever covers the screen.
function commit(ev, msg) {
  commitPlay([ev], msg);
}

// A play can be several events (batter plus runner moves). They share a
// group id so Undo takes the whole play back in one tap.
function commitPlay(evs, msg) {
  redoStack = [];
  const g = evs.length > 1 ? 'p' + Date.now().toString(36) : null;
  for (const ev of evs) {
    if (msg) ev.m = msg;
    if (g) ev.g = g;
    game.events.push(ev);
  }
  save();
  selected = null;
  pending = null;
  upNext = null;
  outPick = false;
  lastCommit = Date.now();
  buzz();
  renderScore();
  // Say what was saved, right away, while the play is still fresh.
  if (msg) toast(`Recorded: ${msg}`, { label: 'Undo', run: () => { undo(); buzz(6); } }, 'rec');
}

function lastPlay() {
  const ev = lastEvent();
  if (!ev) return 'Tap a play to begin';
  const generic = { bat: 'batter recorded', adv: 'runner moved', rout: 'runner out', order: 'lineup updated', end: 'innings ended', over: 'game ended' };
  return `Last: ${esc(ev.m || generic[ev.t] || 'play')}`;
}

const tabBar = (active) => `
  <nav class="bottom-bar tabs-bar" role="tablist">
    <button role="tab" aria-selected="${active === 'score'}" class="${active === 'score' ? 'on' : ''}" data-action="tabScore">${ICON.ball}<span>Score</span></button>
    <button role="tab" aria-selected="${active === 'sheet'}" class="${active === 'sheet' ? 'on' : ''}" data-action="tabSheet">${ICON.sheet}<span>Sheet</span></button>
    <button role="tab" aria-selected="${active === 'share'}" class="${active === 'share' ? 'on' : ''} ${replay(game).over && active !== 'share' ? 'hot' : ''}" data-action="finish">${ICON.share}<span>Share</span></button>
  </nav>`;

function undo() {
  document.getElementById('toast')?.classList.remove('show');
  upNext = null;
  outPick = false;
  if (pending) { pending = null; renderScore(); return; }
  if (!game.events.length) return;
  const popped = [game.events.pop()];
  const g = popped[0].g;
  while (g && lastEvent()?.g === g) popped.unshift(game.events.pop());
  redoStack.push(popped);
  save();
  selected = null;
  renderScore();
  toast('Undone last play', { label: 'Redo', run: () => { redo(); buzz(6); } });
}

function redo() {
  if (!redoStack.length) return;
  const group = redoStack.pop();
  for (const ev of group) {
    if (ev.t === 'order' && Array.isArray(ev.names)) {
      game.teams[ev.team].players = [...ev.names];
    }
    game.events.push(ev);
  }
  save();
  selected = null;
  pending = null;
  renderScore();
}

function coachTip(ph, bt) {
  if (!tips || state.half >= 2) return '';
  const name = esc(playerName(bt, batterUp(bt)));
  const text = {
    bat: game.events.length === 0
      ? '<b>Watch the whole play</b>, then tap where the batter got to. Full guide: <b>⋯ &gt; Help</b>.'
      : `Tap where <b>${name}</b> got to, or how they got out.`,
    confirm: 'Forced moves are pre-filled. Tap any runner to change where they ended up, then <b>Confirm</b>.',
    inningsOver: 'Tell the umpire, then swap: the other team bats now.',
    over: 'Get the umpire to check and sign the scoresheet, then share it.',
  }[ph];
  return `<div class="coach">${ICON.bulb}<p>${text}</p><button class="icon-btn sm" data-action="hideTips" aria-label="Hide tips">${ICON.x}</button></div>`;
}

// ---------- placing a play ----------
// After the batter's result, every runner gets a row. The batter is set to
// the base tapped and forced runners are pre-set to the base they were
// forced to; the scorer changes any that ran further or were put out.
// Unforced runners must be placed explicitly.
const OUT = -1;

function startPlay(r) {
  const forced = typeof r === 'number' ? new Map(forcedMoves(state, r).map(([p, , to]) => [p, to])) : new Map();
  const rows = [];
  // Batter first, then runners from 1st to 3rd, so rows run trailing runner first.
  if (typeof r === 'number') {
    const bt = battingTeam(state);
    rows.push({ p: batterUp(bt), from: 0, min: r, pick: r, batter: true });
  }
  for (let b = 1; b <= 3; b++) {
    const p = state.runners[b];
    if (p == null) continue;
    // min: where the batter's hit leaves this runner before any extra moves.
    const min = forced.get(p) ?? b;
    rows.push({ p, from: b, min, pick: forced.has(p) ? min : null });
  }
  pending = { r, rows };
  settle();
}

// Works out each row's lowest possible base (floor) and final base (dest)
// from the trailing runner forward: a runner must end ahead of everyone
// behind them. A pick that has become impossible is cleared, so the runner
// must be placed again, and returns if the runner behind is moved back.
function settle() {
  let behind = 0; // lowest base still free for the next runner ahead
  for (const w of pending.rows) {
    w.floor = Math.max(w.min, Math.min(behind, 4));
    if (w.pick === OUT) {
      w.dest = OUT;
      const bases = outBases(w);
      if (bases.length === 1) w.outAt = bases[0];
    } else w.dest = w.pick != null && w.pick >= w.floor ? w.pick : null;
    if (w.dest != null && w.dest !== OUT) behind = Math.max(behind, w.dest + 1);
  }
}

const unplaced = (w) => w.dest == null || (w.dest === OUT && !w.outAt);
const playOuts = () => pending.rows.filter((w) => w.dest === OUT).length + (typeof pending.r === 'number' ? 0 : 1);

// Rows are trailing runner first. Returns a message when the placement
// can't happen on a real field, else null.
function playProblem(rows) {
  const bt = battingTeam(state);
  const outs = state.outs + playOuts();
  if (game.maxOuts > 0 && outs > game.maxOuts) return `That's ${outs} outs. The innings ends at ${game.maxOuts}.`;
  const live = rows.filter((w) => w.dest !== OUT);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const behindRunner = live[i];
      const aheadRunner = live[j];
      if (behindRunner.dest == null || aheadRunner.dest == null) continue;
      if (aheadRunner.dest !== 4 && behindRunner.dest === aheadRunner.dest) {
        return `${shortName(bt, behindRunner.p)} and ${shortName(bt, aheadRunner.p)} can't both be on ${BASE[aheadRunner.dest]}.`;
      }
      if (behindRunner.dest > aheadRunner.dest) {
        return `${shortName(bt, behindRunner.p)} can't pass ${shortName(bt, aheadRunner.p)}.`;
      }
    }
  }
  return null;
}

// Bases a row's runner could have been put out at. A batter has already
// reached the base hit; a runner is out at the earliest on the next base.
const outBases = (w) => {
  const first = (w.batter ? pending.r : w.from) + 1;
  return Array.from({ length: Math.max(0, 5 - first) }, (_, k) => first + k);
};
const outText = (b) => (b === 4 ? 'home' : BASE[b]);

// Allowed, but worth a second look: runs on the play that ends the innings.
function playWarning() {
  if (!(game.maxOuts > 0 && state.outs + playOuts() === game.maxOuts)) return null;
  const bt = battingTeam(state);
  const runs = pending.rows.filter((w) => w.dest === 4).map((w) => shortName(bt, w.p));
  if (!runs.length) return null;
  const nth = ['', '1st', '2nd', '3rd'][game.maxOuts] || `${game.maxOuts}th`;
  return `Did ${runs.join(' and ')} score before the ${nth} out? If not, change ${runs.length > 1 ? 'their rows' : 'their row'}.`;
}

function playSummary() {
  const bt = battingTeam(state);
  const batter = shortName(bt, batterUp(bt));
  const { r, rows } = pending;
  const parts = [];
  const b = rows.find((w) => w.batter);
  if (!b) parts.push(`${batter} ${OUTS.find((o) => o.r === r).label.toLowerCase()}`);
  for (const w of rows) {
    if (!w.batter && w.dest === w.from) continue;
    const n = shortName(bt, w.p);
    parts.push(w.dest === OUT ? `${n} out at ${outText(w.outAt)}` : w.dest === 4 ? `${n} scored` : `${n} to ${BASE[w.dest]}`);
  }
  return parts.join(', ');
}

function confirmPlay() {
  const { r, rows } = pending;
  // Runners put out are taken off their starting base before the hit is
  // applied, so the sheet never shows them reaching a base they were out at.
  const runnersOut = rows.filter((w) => !w.batter && w.dest === OUT);
  const evs = runnersOut.map((w) => ({ t: 'rout', p: w.p, at: w.outAt }));
  evs.push(batEvent(r));
  const batter = rows.find((w) => w.batter);
  if (batter?.dest === OUT) evs.push({ t: 'rout', p: batter.p, at: batter.outAt });
  // Where everyone stands once the hit is applied without those runners.
  const at = new Map(rows.map((w) => [w.p, w.batter ? r : w.from]));
  if (typeof r === 'number') {
    const runners = [...state.runners];
    for (const w of runnersOut) runners[w.from] = null;
    for (const [p, , to] of forcedMoves({ runners }, r)) at.set(p, to);
  }
  // Lead runner first so nobody lands on a base that is still occupied.
  for (const w of [...rows].reverse()) if (w.dest !== OUT && w.dest > at.get(w.p)) evs.push({ t: 'adv', p: w.p, to: w.dest });
  commitPlay(evs, playSummary());
}

function hero(bt) {
  const limit = batterLimit(game, bt, state);
  const plus = pending ? pending.rows.filter((w) => w.dest === 4).length : 0;
  const dots = game.maxOuts
    ? Array.from({ length: game.maxOuts }, (_, k) => `<i class="${k < state.outs ? 'on' : ''}"></i>`).join('')
    : `<b>${state.outs}</b>`;
  const team = (i) => {
    const t = game.teams[i];
    const tc = safeColor(t.color, COLORS[i]);
    const on = !state.over && i === bt;
    return `<div class="sb-team ${on ? 'batting' : ''}" style="--team:${tc}">
      <i class="sb-bar"></i>
      <span class="sb-name">${esc(t.name)}</span>${on ? '<small>Batting</small>' : ''}<b class="sb-runs">${total(state.teams[i].runs)}</b></div>`;
  };
  return `
    <section class="scoreboard">
      <div class="sb-teams">${team(0)}${team(1)}</div>
      ${state.over ? '' : `
      <div class="sb-strip">
        <span class="sb-inn">Innings runs <b>${state.teams[bt].runs[currentInning(state)] || 0}</b>${plus ? `<em>+${plus}</em>` : ''}</span>
        <span class="sb-outs">Outs <span class="out-dots">${dots}</span></span>
        <span>Batted <b>${state.batters}</b>/${limit}</span>
        ${game.events.length === 0 ? `<button class="sb-swap-btn" data-action="swapInGame" title="Swap which team bats first">${ICON.swap}<span>Swap batting team</span></button>` : ''}
      </div>`}
    </section>`;
}

// Diamond positions (percent of the field box) for bases 0..3.
const POS = [[50, 88], [85, 53], [50, 20], [15, 53]];

// Shared mowed-turf stadium SVG backdrop
function fieldTurfSvg(inner) {
  return `
    <svg viewBox="0 0 300 250" aria-hidden="true">
      <defs>
        <clipPath id="outfield-clip">
          <path d="M150 242L12 104A196 196 0 0 1 288 104Z"/>
        </clipPath>
        <pattern id="mow-stripes" width="28" height="28" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="14" height="28" fill="#1f7044"/>
          <rect x="14" width="14" height="28" fill="#26804f"/>
        </pattern>
        <marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0L10 5 0 10z" fill="#c6f432"/>
        </marker>
      </defs>
      <g clip-path="url(#outfield-clip)">
        <rect width="300" height="250" fill="url(#mow-stripes)"/>
        <path d="M150 242L12 104A196 196 0 0 1 288 104Z" class="warning-track"/>
      </g>
      <path d="M150 226L261 130 150 34 39 130Z" class="dirt"/>
      <path d="M150 202L233 130 150 58 67 130Z" class="infield-grass"/>
      <circle cx="150" cy="220" r="18" fill="#c67d47"/>
      <circle cx="255" cy="130" r="15" fill="#c67d47"/>
      <circle cx="150" cy="40" r="15" fill="#c67d47"/>
      <circle cx="45" cy="130" r="15" fill="#c67d47"/>
      <path d="M150 220L255 130 150 40 45 130Z" class="lines"/>
      <rect x="134" y="213" width="8" height="14" rx="1" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.2"/>
      <rect x="158" y="213" width="8" height="14" rx="1" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.2"/>
      <circle cx="150" cy="134" r="11" class="mound"/>
      ${inner}
    </svg>`;
}

function diamond(bt, ph) {
  const color = safeColor(game.teams[bt].color, COLORS[bt]);
  const runOk = canRun(game, state);
  const targets = new Set();
  if (selected != null) {
    const from = state.runners.indexOf(selected);
    for (let to = from + 1; to <= 4; to++) if (pathClear(state, from, to)) targets.add(to % 4);
  }
  if (pending) return previewDiamond(bt);
  const ev = lastEvent();
  const moved = ev?.t === 'adv' ? ev.p : ev?.t === 'bat' ? state.teams[bt].last : null;
  const chips = [];
  for (let b = 1; b <= 3; b++) {
    const p = state.runners[b];
    if (p == null) continue;
    chips.push(`<button class="chip ${game.teams[bt].players[p] ? '' : 'num-only'} ${selected === p ? 'sel' : ''} ${p === moved ? 'pop' : ''}" style="left:${POS[b][0]}%;top:${POS[b][1]}%;--team:${color}"
      data-action="pick" data-p="${p}" ${runOk ? '' : 'disabled'}><span>${p + 1}</span>${game.teams[bt].players[p] ? `<em>${esc(shortName(bt, p))}</em>` : ''}</button>`);
  }
  if (ph === 'bat') {
    const p = batterUp(bt);
    chips.push(`<div class="chip batter ${game.teams[bt].players[p] ? '' : 'num-only'}" style="left:${POS[0][0]}%;top:${POS[0][1]}%;--team:${color}"><span>${p + 1}</span>${game.teams[bt].players[p] ? `<em>${esc(shortName(bt, p))}</em>` : ''}</div>`);
  }
  const base = (b, x, y) => `<g class="base ${targets.has(b) ? 'target' : ''}" ${targets.has(b) ? `data-action="moveTo" data-to="${b || 4}"` : ''}>
      <circle cx="${x}" cy="${y}" r="26" class="hit"/>
      ${b ? `<rect x="${x - 8}" y="${y - 8}" width="16" height="16" rx="2.5" transform="rotate(45 ${x} ${y})"/>` : `<path d="M${x - 9} ${y - 7}h18v7l-9 8-9-8z"/>`}
    </g>`;

  let actionRow = '';
  if (selected != null) {
    const from = state.runners.indexOf(selected);
    const opts = [];
    for (let to = from + 1; to <= 4; to++) {
      if (!pathClear(state, from, to)) continue;
      opts.push(`<button class="btn safe" data-action="moveTo" data-to="${to}">${to === 4 ? 'Scored' : BASE[to]}</button>`);
    }
    const outRow = Array.from({ length: 4 - from }, (_, k) => from + 1 + k)
      .map((b) => `<button class="btn out" data-action="runnerOutAt" data-b="${b}">${b === 4 ? 'Home' : BASE[b]}</button>`).join('');
    actionRow = outPick ? `
      <div class="runner-panel">
        <p><b>${esc(playerName(bt, selected))}</b> was out at…</p>
        <div class="runner-btns">${outRow}
          <button class="btn ghost" data-action="pick" data-p="${selected}">Cancel</button></div>
      </div>` : `
      <div class="runner-panel">
        <p>Move <b>${esc(playerName(bt, selected))}</b> to…</p>
        <div class="runner-btns">${opts.join('')}
          <button class="btn out" data-action="runnerOut">Out</button>
          <button class="btn ghost" data-action="pick" data-p="${selected}">Cancel</button></div>
        ${opts.length < 4 - from ? '<small>Blocked bases: move the runner ahead first.</small>' : ''}
      </div>`;
  }
  return `
    <section class="field-card">
      <div class="field">
        ${fieldTurfSvg(`${base(1, 255, 130)}${base(2, 150, 40)}${base(3, 45, 130)}${base(0, 150, 220)}`)}
        ${chips.join('')}
      </div>
      ${actionRow || (anyRunners() && runOk && ph === 'bat' ? '<p class="field-hint">Runner moved on an overthrow or steal? Tap their badge on the diamond.</p>' : '')}
    </section>`;
}

// SVG points of bases 0..3, with 4 = home again.
const SVG_BASE = [[150, 220], [255, 130], [150, 40], [45, 130], [150, 220]];

function previewDiamond(bt) {
  const color = safeColor(game.teams[bt].color, COLORS[bt]);
  const arrows = [];
  const chips = [];
  const scored = [];
  const outs = [];
  for (const w of pending.rows) {
    const named = game.teams[bt].players[w.p];
    const label = `<span>${w.p + 1}</span>${named ? `<em>${esc(shortName(bt, w.p))}</em>` : ''}`;
    if (w.dest === OUT) { outs.push(esc(shortName(bt, w.p))); continue; }
    if (w.dest != null && w.dest > w.from) {
      const pts = SVG_BASE.slice(w.from, w.dest + 1).map((q) => q.join(' '));
      arrows.push(`<path d="M${pts.join('L')}" class="run-arrow"/>`);
    }
    if (w.dest === 4) { scored.push(esc(shortName(bt, w.p))); continue; }
    const at = w.dest ?? w.from;
    chips.push(`<div class="chip ${named ? '' : 'num-only'} ${w.dest == null ? 'ask' : ''} ${w.batter ? 'batter' : ''}" style="left:${POS[at][0]}%;top:${POS[at][1]}%;--team:${color}">${label}</div>`);
  }
  const base = (x, y, b) => b ? `<rect x="${x - 8}" y="${y - 8}" width="16" height="16" rx="2.5" transform="rotate(45 ${x} ${y})" class="pbase"/>` : `<path d="M${x - 9} ${y - 7}h18v7l-9 8-9-8z" class="pbase"/>`;
  const tray = scored.length || outs.length
    ? `<div class="tray">${scored.length ? `<span class="tray-run">${ICON.ball} Scored: <b>${scored.join(', ')}</b></span>` : ''}${outs.length ? `<span class="tray-out">Out: <b>${outs.join(', ')}</b></span>` : ''}</div>`
    : '';
  return `
    <section class="field-card">
      <div class="field">
        ${fieldTurfSvg(`${base(255, 130, 1)}${base(150, 40, 2)}${base(45, 130, 3)}${base(150, 220, 0)}${arrows.join('')}`)}
        ${chips.join('')}
      </div>
      ${tray}
    </section>`;
}

function miniDiamond(to) {
  const pts = [[14, 24], [24, 14], [14, 4], [4, 14]];
  const path = pts.slice(0, to + 1).map((p, i) => (i ? 'L' : 'M') + (p || pts[0]).join(' ')).join('') + (to === 4 ? 'L14 24' : '');
  return `<svg viewBox="0 0 28 28" class="mini"><path d="M14 24L24 14 14 4 4 14Z" class="md-base"/><path d="${path}" class="md-run"/>
    ${pts.slice(1, Math.min(to, 3) + 1).map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" class="md-dot"/>`).join('')}
    ${to === 4 ? '<circle cx="14" cy="14" r="3.6" class="md-dot"/>' : ''}</svg>`;
}

function panel(ph, bt) {
  if (ph === 'bat') {
    const p = batterUp(bt);
    const tc = safeColor(game.teams[bt].color, COLORS[bt]);
    return `
      <section class="panel">
        <div class="batter-row"><span class="num-badge" style="--team:${tc}">${p + 1}</span>
          <div><small>Up to bat · ${esc(game.teams[bt].name)}${upNext != null ? ' (out of order)' : ''}</small><h2>${esc(playerName(bt, p))}</h2></div>
          <button class="btn small ghost lineup-btn" data-action="lineup" aria-label="Lineup and who is batting">${ICON.sheet}<span>Lineup</span></button>
        </div>
        ${coachTip(ph, bt)}
        <h3 class="group safe-t">Safe on</h3>
        <div class="plays hits">${HITS.map((h) => `
          <button class="play safe ${h.r === 4 ? 'hr' : ''}" data-action="bat" data-r="${h.r}">${miniDiamond(h.r)}<b>${h.label}</b></button>`).join('')}
        </div>
        <h3 class="group out-t">Out</h3>
        <div class="plays outplays ${strikeoutsOn() ? '' : 'two'}">${OUTS.filter((o) => o.r !== 'K' || strikeoutsOn()).map((o) => `
          <button class="play out" data-action="bat" data-r="${o.r}"><span class="glyph-wrap"><span class="glyph">${ICON[o.icon] || o.glyph}</span></span><b>${o.label}</b><small>${o.hint}</small></button>`).join('')}
        </div>
      </section>`;
  }
  if (ph === 'confirm') {
    const color = safeColor(game.teams[bt].color, COLORS[bt]);
    const hasUnforced = pending.rows.some((w) => !w.batter && w.floor === w.from);
    const rows = pending.rows.map((w, i) => {
      const opts = [];
      if (w.floor === w.from) opts.push([w.from, 'Stayed']);
      for (let to = Math.max(w.floor, w.from + 1); to <= 4; to++) opts.push([to, to === 4 ? 'Home' : BASE[to]]);
      if (outBases(w).length) opts.push([OUT, 'Out']);
      const note = w.batter ? 'Batter' : `Was on ${BASE[w.from]}${w.floor > w.from ? ' · forced ahead' : ''}`;
      return `
        <div class="move ${unplaced(w) ? 'ask' : ''}">
          <div class="move-who"><span class="num-badge sm" style="--team:${color}">${w.p + 1}</span>
            <b>${esc(playerName(bt, w.p))}</b><small>${note}</small></div>
          <div class="opts">${opts.map(([to, l]) => `<button class="opt ${to === OUT ? 'out' : to === 4 ? 'home' : ''} ${w.dest === to ? 'on' : ''}" data-action="dest" data-i="${i}" data-to="${to}" aria-pressed="${w.dest === to}">${l}</button>`).join('')}</div>
          ${w.dest === OUT && outBases(w).length > 1 ? `
          <div class="out-at ${w.outAt ? '' : 'ask'}"><span>Out at</span>${outBases(w).map((b) => `<button class="opt out ${w.outAt === b ? 'on' : ''}" data-action="outAt" data-i="${i}" data-b="${b}" aria-pressed="${w.outAt === b}">${b === 4 ? 'Home' : BASE[b]}</button>`).join('')}</div>` : ''}
        </div>`;
    }).join('');
    const b = batterUp(bt);
    const head = typeof pending.r === 'number'
      ? `${esc(shortName(bt, b))} ${pending.r === 4 ? 'hit a home run' : `safe on ${BASE[pending.r]}`}`
      : `${esc(shortName(bt, b))} ${OUTS.find((o) => o.r === pending.r).label.toLowerCase()}`;
    return `
      <section class="panel">
        <div class="panel-head"><small>${head}</small><h2>Where did everyone end up?</h2></div>
        ${hasUnforced ? `<div class="moves-quick">
          <button class="btn small safe" data-action="quickRunners" data-mode="advance">${ICON.bolt} All runners +1 base</button>
          <button class="btn small ghost" data-action="quickRunners" data-mode="stay">Unforced stayed</button>
        </div>` : ''}
        ${coachTip(ph, bt)}
        <div class="moves">${rows}</div>
      </section>`;
  }
  if (ph === 'inningsOver') {
    const reason = halfDone(game, state);
    const lastHalf = state.half + 1 >= game.innings * 2;
    const nt = 1 - bt;
    return `
      <section class="panel alert">
        ${ICON.whistle}
        <div class="panel-head"><small>${esc(reason)}</small><h2>Innings over</h2></div>
        <p>Check with the umpire before you move on. ${esc(game.teams[bt].name)} scored <b>${state.teams[bt].runs[currentInning(state)] || 0}</b> this innings.</p>
        ${inningsSummary(bt)}
        <button class="btn primary big" data-action="endHalf">${lastHalf ? 'Finish the game' : `${esc(game.teams[nt].name)} bat next`} ${ICON.chevron}</button>
        ${canAllBat(game, state) ? `<button class="btn ghost wide" data-action="allBat">Keep going - everyone bats this innings</button>` : ''}
        <div class="alt-row">
          <button class="btn ghost grow" data-action="undo">${ICON.undo} Undo last play</button>
          ${lastHalf ? `<button class="btn ghost grow" data-action="extraInnings">Play another innings</button>` : ''}
        </div>
      </section>`;
  }
  const [a, b] = game.teams;
  const ra = total(state.teams[0].runs);
  const rb = total(state.teams[1].runs);
  return `
    <section class="panel done">
      <div class="panel-head"><small>Game over</small><h2>${ra === rb ? "It's a draw!" : `${esc((ra > rb ? a : b).name)} win!`}</h2></div>
      <button class="btn primary big" data-action="finish">${ICON.share} Sign &amp; share scoresheet</button>
      ${lastEvent()?.t === 'end' ? '<button class="btn ghost wide" data-action="extraInnings">Play another innings</button>' : ''}
    </section>`;
}

// Who scored and who was out this innings, for a check with the umpire.
ACTIONS.quickRunners = (el) => {
  if (!pending) return;
  const mode = el.dataset.mode;
  const shift = typeof pending.r === 'number' ? pending.r : 1;
  for (const w of pending.rows) {
    if (w.batter) continue;
    if (mode === 'stay') w.pick = w.floor;
    else w.pick = Math.max(w.floor, Math.min(4, w.from + shift));
  }
  settle();
  buzz(6);
  renderScore();
};

function inningsSummary(bt) {
  const inning = currentInning(state);
  const cells = Object.entries(state.teams[bt].cells)
    .filter(([k]) => +k.split(':')[0] === inning)
    .map(([k, c]) => ({ p: +k.split(':')[1], ...c }));
  const scored = cells.filter((c) => c.scored).sort((a, b) => a.p - b.p).map((c) => esc(shortName(bt, c.p)));
  const outs = cells.filter((c) => c.out).sort((a, b) => a.out - b.out).map((c) => esc(shortName(bt, c.p)));
  return `
    <dl class="inn-sum">
      <dt>Scored (${scored.length})</dt><dd>${scored.join(', ') || 'Nobody'}</dd>
      <dt>Out (${outs.length})</dt><dd>${outs.join(', ') || 'Nobody'}</dd>
    </dl>`;
}

// While placing runners the tabs give way to Back / Confirm, so Confirm is
// always on screen however many runners there are.
function confirmBar() {
  const missing = pending.rows.filter(unplaced).length;
  const problem = missing ? null : playProblem(pending.rows);
  const warning = missing || problem ? null : playWarning();
  return `
    <nav class="bottom-bar confirm-bar">
      ${problem ? `<p class="play-problem">${esc(problem)}</p>` : warning ? `<p class="play-warning">${esc(warning)}</p>` : ''}
      <div class="confirm-row">
        <button class="btn ghost" data-action="cancelPlay">Back</button>
        <button class="btn primary grow" data-action="confirmPlay" ${missing || problem ? 'disabled' : ''}>${missing ? `Place ${missing} more runner${missing > 1 ? 's' : ''}` : warning ? 'Yes, confirm' : `Confirm ${ICON.check}`}</button>
      </div>
    </nav>`;
}

function renderScore() {
  state = replay(game);
  const bt = battingTeam(state);
  const ph = phase();
  if (selected != null && !state.runners.includes(selected)) selected = null;

  app.innerHTML = `
    <div class="score-screen phase-${ph}">
      ${topBar({
        back: 'home',
        title: state.over ? 'Game over' : `Innings ${currentInning(state) + 1} of ${game.innings}`,
        sub: lastPlay(),
        right: `${redoStack.length ? `<button class="undo-btn" data-action="redo" aria-label="Redo play">${ICON.redo}<span>Redo</span></button>` : ''}<button class="undo-btn" data-action="undo" ${game.events.length || pending ? '' : 'disabled'} aria-label="Undo last play">${ICON.undo}<span>Undo</span></button><button class="icon-btn" data-action="menu" aria-label="More">${ICON.more}</button>`,
      })}
      ${hero(bt)}
      <main class="score">
        ${state.over || ph === 'inningsOver' ? '' : diamond(bt, ph)}
        ${panel(ph, bt)}
      </main>
      ${ph === 'confirm' ? confirmBar() : tabBar('score')}
    </div>`;
  fitField();
}

// Sizes the diamond to the space left above the batter panel, keeping the
// drawing's proportions so runner badges sit on their bases. Pop-up
// messages go over the diamond so they never hide the score.
function fitField() {
  const card = app.querySelector('.score-screen .field-card');
  const f = card?.querySelector('div.field');
  if (f) {
    f.style.width = f.style.height = '0px';
    const cs = getComputedStyle(card);
    const others = [...card.children]
      .filter((c) => c !== f && getComputedStyle(c).position !== 'absolute')
      .reduce((h, c) => h + c.offsetHeight, 0);
    const h = card.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - others - 2;
    const w = card.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const fw = Math.max(0, Math.min(w, (h * 300) / 245));
    f.style.width = `${fw}px`;
    f.style.height = `${(fw * 245) / 300}px`;
  }
  const anchor = card?.getBoundingClientRect().top ?? app.querySelector('.score-screen .scoreboard')?.getBoundingClientRect().bottom;
  document.documentElement.style.setProperty('--toast-top', anchor != null ? `${Math.round(anchor + 8)}px` : '');
}
window.addEventListener('resize', () => { if (current === 'score') fitField(); });

// ---------- scoresheet tab ----------
function renderSheetTab() {
  state = replay(game);
  const bt = battingTeam(state);
  app.innerHTML = `
    ${topBar({ back: 'home', title: 'Scoresheet', sub: state.over ? 'Final' : `Innings ${currentInning(state) + 1} of ${game.innings}`, right: helpBtn })}
    <main class="sheet-view">
      <div class="segmented">${game.teams.map((t, i) => `<button class="${i === gridTeam ? 'on' : ''}" data-action="gridTeam" data-t="${i}" style="--team:${safeColor(t.color, COLORS[i])}"><i></i><span class="seg-name">${esc(t.name)}</span><small>${total(state.teams[i].runs)}</small></button>`).join('')}</div>
      <button class="sheet-wrap zoomable" id="grid-wrap" data-action="zoomGrid" aria-label="Open sheet full screen"><canvas id="grid"></canvas></button>
      <p class="zoom-hint">${ICON.zoom} Tap the sheet to zoom</p>
      <button class="link-btn" data-action="help">What do the symbols mean?</button>
    </main>
    ${tabBar('sheet')}`;
  drawSheetTab(bt);
}

function drawSheetTab(bt = battingTeam(state)) {
  const wrap = document.getElementById('grid-wrap');
  if (!wrap) return;
  const hi = phase() === 'bat' && gridTeam === bt ? { inning: currentInning(state), player: batterUp(bt) } : null;
  renderGrid(document.getElementById('grid'), game, state, gridTeam, hi, wrap.clientWidth);
}
window.addEventListener('resize', () => { if (current === 'sheet') drawSheetTab(); });

ACTIONS.tabScore = () => go('score');
// Full-screen, zoomable copy of the live grid, drawn at full size.
ACTIONS.zoomGrid = () => {
  const bt = battingTeam(state);
  const hi = phase() === 'bat' && gridTeam === bt ? { inning: currentInning(state), player: batterUp(bt) } : null;
  const c = document.createElement('canvas');
  renderGrid(c, game, state, gridTeam, hi);
  viewer(c.toDataURL('image/png'), game.teams[gridTeam].name);
};
ACTIONS.zoomPreview = () => { if (sheetUrl) viewer(sheetUrl, 'Scoresheet'); };
ACTIONS.tabSheet = () => {
  state = replay(game);
  gridTeam = state.over ? 0 : battingTeam(state);
  go('sheet');
};

ACTIONS.home = () => go('home');
ACTIONS.bat = (el) => {
  if (tooSoon()) return;
  const r = /\d/.test(el.dataset.r) ? +el.dataset.r : el.dataset.r;
  const bt = battingTeam(state);
  const name = shortName(bt, batterUp(bt));
  const label = typeof r === 'number' ? (r === 4 ? 'home run' : `safe on ${BASE[r]}`) : OUTS.find((o) => o.r === r).label.toLowerCase();
  // Runners only need placing if the ball was in play, someone is on base,
  // and the play didn't make the last out.
  // A catch is in the list too: a runner caught off base can be put out.
  const lastOut = typeof r !== 'number' && game.maxOuts > 0 && state.outs + 1 >= game.maxOuts;
  if (r === 'K' || lastOut || !anyRunners()) return commit(batEvent(r), `${name} ${label}`);
  selected = null;
  startPlay(r);
  buzz(6);
  renderScore();
};
ACTIONS.dest = (el) => {
  pending.rows[+el.dataset.i].pick = +el.dataset.to;
  settle();
  buzz(6);
  keepMovesScroll(renderScore);
};
ACTIONS.outAt = (el) => {
  pending.rows[+el.dataset.i].outAt = +el.dataset.b;
  buzz(6);
  keepMovesScroll(renderScore);
};
// The runner list scrolls on its own when there are many runners; keep its
// place when a tap redraws the screen.
function keepMovesScroll(render) {
  const y = app.querySelector('.moves')?.scrollTop || 0;
  render();
  const m = app.querySelector('.moves');
  if (m) m.scrollTop = y;
}
ACTIONS.confirmPlay = () => { if (!tooSoon()) confirmPlay(); };
ACTIONS.cancelPlay = () => { pending = null; renderScore(); };
ACTIONS.pick = (el) => {
  const p = +el.dataset.p;
  outPick = false;
  selected = selected === p ? null : p;
  buzz(6);
  renderScore();
};
ACTIONS.moveTo = (el) => {
  const bt = battingTeam(state);
  const to = +el.dataset.to;
  const name = shortName(bt, selected);
  commit({ t: 'adv', p: selected, to }, to === 4 ? `${name} scored` : `${name} to ${BASE[to]}`);
};
ACTIONS.runnerOut = () => {
  const from = state.runners.indexOf(selected);
  if (from === 3) return commitRunnerOut(4);
  outPick = true;
  renderScore();
};
ACTIONS.runnerOutAt = (el) => commitRunnerOut(+el.dataset.b);
function commitRunnerOut(at) {
  const name = shortName(battingTeam(state), selected);
  commit({ t: 'rout', p: selected, at }, `${name} out at ${at === 4 ? 'home' : BASE[at]}`);
}
ACTIONS.undo = () => { undo(); buzz(6); };
ACTIONS.redo = () => { redo(); buzz(6); };
ACTIONS.endHalf = () => { if (!tooSoon()) commit({ t: 'end' }, 'innings ended'); };
// Lift the batter limit for this half only; outs still end it.
ACTIONS.allBat = () => { if (!tooSoon()) commit({ t: 'allbat' }, 'everyone bats this innings'); };
// Extra innings: raise the planned count, then carry on as normal.
ACTIONS.extraInnings = () => {
  if (tooSoon()) return;
  game.innings++;
  game.signature = null;
  if (phase() === 'inningsOver') return commit({ t: 'end' }, `innings ${game.innings} added`);
  save();
  renderScore();
  toast(`Innings ${game.innings} added`);
};

// ---------- lineup changes during the game ----------
// Edits a draft of one team's batting order, then saves it as one 'order'
// event (undoable). Players keep their number and sheet row for good, so a
// late arrival is a new row and a player who left keeps their past boxes.
function nextAfterChange(team, order) {
  const T = state.teams[team];
  // Before the team has batted the first in the order leads off; after that
  // whoever is up stays up (change it with Bat now) unless they left.
  if (!T.bats) return order[0];
  const cur = team === battingTeam(state) ? batterUp(team) : T.next;
  if (order.includes(cur)) return cur;
  const i = T.order.indexOf(cur);
  for (let k = 1; k <= T.order.length; k++) {
    const p = T.order[(i + k) % T.order.length];
    if (order.includes(p)) return p;
  }
  return order[0];
}

// Batting out of order is picked here too (Bat now on a row): only players
// who haven't batted this innings and aren't on base, since each gets one
// box per innings on the sheet. The order carries on after them.
ACTIONS.lineup = async () => {
  let team = state.over ? 0 : battingTeam(state);
  const drafts = game.teams.map((t, i) => ({
    names: [...t.players.slice(0, state.teams[i].rowCount ?? t.players.length)],
    order: [...state.teams[i].order],
  }));
  const base = drafts.map((d) => d.names.length); // names added in this sheet are late arrivals
  let picks = [];
  const bt = phase() === 'bat' ? battingTeam(state) : null;
  const inning = bt == null ? 0 : currentInning(state);
  const canBat = (p) => !state.teams[bt].cells[inning + ':' + p] && !state.runners.includes(p);
  let atBat = bt == null ? null : batterUp(bt);
  let help = false; // explanation behind the i button
  let el = null;
  const draw = () => {
    const d = drafts[team];
    const color = safeColor(game.teams[team].color, COLORS[team]);
    const batting = team === bt;
    const free = batting ? d.order.filter(canBat) : [];
    if (batting && !free.includes(atBat)) atBat = free.includes(nextAfterChange(team, d.order)) ? nextAfterChange(team, d.order) : free[0] ?? null;
    const next = batting ? atBat : d.order.length ? nextAfterChange(team, d.order) : null;
    // Squad players not in this game yet, for a one-tap late arrival.
    picks = isOwn(game.teams[team].name) ? (squadOf() || []).filter((n) => !d.names.some((x) => x.trim() === n)) : [];
    // Batting team: the batter up wears "Up to bat"; anyone else who can
    // bat now has a Bat now button; the rest say why they can't.
    const batCell = (p) => {
      if (!batting) return p === next ? '<em>Next</em>' : '';
      if (p === atBat) return `<button class="lu-bat on" data-lu="bat" data-p="${p}" aria-pressed="true">${ICON.ball}Up to bat</button>`;
      if (free.includes(p)) return `<button class="lu-bat" data-lu="bat" data-p="${p}" aria-pressed="false">Bat now</button>`;
      return `<span class="lu-note">${state.runners.includes(p) ? 'On base' : 'Batted'}</span>`;
    };
    const gone = d.names.map((_, p) => p).filter((p) => !d.order.includes(p));
    const row = (p, k) => `
      <li class="lu-row ${p === next ? 'next' : ''}">
        <span class="num-badge sm" style="--team:${color}">${p + 1}</span>
        <button class="btn small out" data-lu="left" data-k="${k}">Left</button>
        <input class="input bare" data-lu-name="${p}" value="${esc(d.names[p])}" placeholder="#${p + 1}" maxlength="24" enterkeyhint="${k < d.order.length - 1 ? 'next' : 'done'}" aria-label="Player ${p + 1} name">
        ${batCell(p)}
        <span class="grip" data-grip="${k}" role="button" tabindex="0" aria-label="Drag, or use arrow keys, to move ${esc(d.names[p] || `player ${p + 1}`)}">${ICON.grip}</span>
      </li>`;
    el.querySelector('.bsheet-body').innerHTML = `
      <div class="lu-top">
        <button class="icon-btn sm lu-info ${help ? 'on' : ''}" data-lu="info" aria-expanded="${help}" aria-label="How Lineup works">${ICON.info}</button>
        <div class="segmented thin">${game.teams.map((t, i) => `<button class="${i === team ? 'on' : ''}" data-lu="team" data-t="${i}" style="--team:${safeColor(t.color, COLORS[i])}"><i></i><span class="seg-name">${esc(t.name)}</span></button>`).join('')}</div>
      </div>
      <p class="muted lu-help" ${help ? '' : 'hidden'}>${batting ? 'Wrong child at the plate? Tap <b>Bat now</b> on who is really batting. ' : ''}Drag ${ICON.grip} to change the order; it applies from the next batter.</p>
      <ol class="lu-list" id="lu-order">${d.order.map(row).join('')}</ol>
      <div class="add-row"><input class="input" id="lu-new" placeholder="Late arrival: name (optional)" maxlength="24" enterkeyhint="done" autocomplete="off">
        <button class="btn primary" data-lu="add">${ICON.plus}<span class="sr">Add</span></button></div>
      ${picks.length ? `<div class="lu-picks"><span>From your squad</span>${picks.map((n, i) => `<button class="btn small ghost" data-lu="pick" data-n="${i}">${ICON.plus}${esc(n)}</button>`).join('')}</div>` : ''}
      ${gone.length ? `<h4 class="lu-h">Left the game</h4><ul class="lu-list">${gone.map((p) => `
        <li class="lu-row gone"><span class="num-badge sm" style="--team:${color}">${p + 1}</span><span class="lu-name">${esc(d.names[p] || `#${p + 1}`)}</span>
          <button class="btn small ghost" data-lu="back" data-p="${p}">Back in</button></li>`).join('')}</ul>` : ''}`;
    makeSortable(el.querySelector('#lu-order'), 0, (from, to) => {
      const o = drafts[team].order;
      o.splice(to, 0, o.splice(from, 1)[0]);
      draw();
    });
  };
  const v = await sheet({
    title: 'Lineup',
    actions: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Save lineup', kind: 'primary', value: 'save' }],
    onOpen(sh) {
      el = sh;
      draw();
      // Open on the batter who is up (or next), centred above the buttons.
      const row = sh.querySelector('#lu-order .lu-row.next');
      if (row) {
        const r = row.getBoundingClientRect();
        const box = sh.getBoundingClientRect();
        const acts = sh.querySelector('.bsheet-acts')?.offsetHeight || 0;
        sh.scrollTop += r.top - (box.top + (box.height - acts) / 2 - r.height / 2);
        row.querySelector('.lu-bat')?.focus({ preventScroll: true }); // not the name field: no keyboard pop-up
      }
      sh.addEventListener('input', (e) => {
        const k = e.target.dataset.luName;
        if (k != null) drafts[team].names[+k] = e.target.value;
      });

      sh.addEventListener('click', (e) => {
        const b = e.target.closest('[data-lu]');
        if (!b) return;
        const d = drafts[team];
        const k = +b.dataset.k;
        const a = b.dataset.lu;
        if (a === 'team') team = +b.dataset.t;
        if (a === 'bat') atBat = +b.dataset.p;
        if (a === 'info') help = !help;
        if (a === 'left') {
          if (d.order.length === 1) return toast('Keep at least one player in the lineup');
          d.order.splice(k, 1);
        }
        if (a === 'back') d.order.push(+b.dataset.p);
        if (a === 'add') {
          d.names.push(sh.querySelector('#lu-new').value.trim());
          d.order.push(d.names.length - 1);
        }
        if (a === 'pick') {
          d.names.push(picks[+b.dataset.n]);
          d.order.push(d.names.length - 1);
        }
        draw();
        if (a === 'add') sh.querySelector('#lu-new').focus();
      });
    },
  });
  if (v !== 'save') return;
  const evs = [];
  drafts.forEach((d, i) => {
    const t = game.teams[i];
    if (d.names.length > t.players.length) t.start ??= t.players.length;
    const cleaned = d.names.map((n) => n.trim().slice(0, 24));
    t.players = cleaned;
    if (d.order.join() !== state.teams[i].order.join()) {
      evs.push({ t: 'order', team: i, order: d.order, next: nextAfterChange(i, d.order), names: [...cleaned] });
    }
  });
  upNext = null;
  if (evs.length) commitPlay(evs, 'lineup changed');
  else save();
  // After the order is saved, whoever isn't next in it bats out of order.
  if (bt != null && atBat != null && atBat !== batterUp(bt)) upNext = atBat;
  renderScore();
  if (!evs.length) toast(upNext != null ? `${shortName(bt, upNext)} is at the plate` : 'Lineup saved');
  const mine = game.teams.findIndex((t) => isOwn(t.name));
  if (mine >= 0) offerSquadAdd(notInSquad(drafts[mine].names.slice(base[mine])));
};

ACTIONS.gridTeam = (el) => { gridTeam = +el.dataset.t; renderSheetTab(); };
ACTIONS.hideTips = () => { tips = false; store.set('tball.tips', false); renderScore(); };

ACTIONS.presetTeam = async () => {
  let pickedKey = myTeam;
  let pickedName = teamName(pickedKey);
  let pickedColor = getDeviceTeamData(pickedName, pickedKey).color || teamDefaultColor(pickedKey) || COLORS[0];
  let shEl = null;
  const squadFor = (key) => (key ? [...(squadOf(key) || getDeviceTeamData(teamName(key), key).players.filter(Boolean))] : []);
  let squad = squadFor(pickedKey);

  const renderBody = () => {
    pickedName = teamName(pickedKey);
    const info = getDeviceTeamData(pickedName, pickedKey);
    const checkDate = (current === 'score' && game?.date) ? game.date : new Date().toLocaleDateString('en-CA');
    const fxToday = pickedKey ? fixtureOn(pickedKey, checkDate) : null;
    const nx = pickedKey ? nextFixture(pickedKey, checkDate) : null;
    const match = fxToday?.type === 'game' ? fxToday : nx;
    const oppColor = match ? distinctColor(getDeviceTeamData(match.opponent, match.oppKey).color || match.oppColor || COLORS[1], pickedColor) : COLORS[1];

    shEl.querySelector('.bsheet-body').innerHTML = `
      <p class="sheet-text">Saved on this device only. When you start a game on a date your team plays, the opposition, team colours, saved players and venue are pre-populated automatically.</p>
      <label class="field"><span>Your team</span>
        <select class="input" id="preset-team-select">
          <option value="">Not set</option>
          ${teamOptions().map((g) => `<optgroup label="${esc(g.label)}">${g.teams.map((t) => `<option value="${esc(t.key)}" ${t.key === pickedKey ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</optgroup>`).join('')}
        </select>
      </label>
      ${pickedKey ? `
        <div class="field">
          <span>${esc(pickedName)} team colour</span>
          <div class="swatches" role="radiogroup" aria-label="Preset team colour">
            ${COLORS.map((c) => `<button type="button" class="swatch ${c === pickedColor ? 'on' : ''}" role="radio" aria-checked="${c === pickedColor}" style="--c:${c}" data-preset-color="${c}" aria-label="${COLOR_NAMES[c] || c}"></button>`).join('')}
          </div>
        </div>
        <div class="card" style="background:var(--surface-2);margin-top:12px;margin-bottom:4px">
          <div class="gc-row"><i style="background:${pickedColor}"></i><span>${esc(pickedName)}</span><small class="muted">${squad.length} in squad</small></div>
          ${match ? `
            <div class="gc-row" style="margin-top:4px"><i style="background:${oppColor}"></i><span>v ${esc(match.opponent)} (${match.home ? 'home' : 'away'})</span></div>
            <div class="gc-meta"><span><b>${esc(fmtDate(match.date))}</b> · ${esc(match.venue)}</span></div>
          ` : `<p class="muted" style="margin:6px 0 0">No upcoming fixture games found.</p>`}
        </div>
        <h4 class="lu-h">Squad <em>full list, in your usual batting order. Kept on this phone only.</em></h4>
        <ol class="lu-list" id="sq-list">${squad.map((n, k) => `
          <li class="lu-row">
            <input class="input bare" data-sq="${k}" value="${esc(n)}" placeholder="Name" maxlength="24" aria-label="Squad player ${k + 1}">
            <button type="button" class="icon-btn sm" data-sq-act="del" data-k="${k}" aria-label="Remove ${esc(n)} from squad">${ICON.x}</button>
            <span class="grip" data-grip="${k}" role="button" tabindex="0" aria-label="Drag, or use arrow keys, to move ${esc(n)}">${ICON.grip}</span></li>`).join('')}</ol>
        <div class="add-row"><input class="input" id="sq-new" placeholder="Add a player (or paste a list)" maxlength="300" autocomplete="off" enterkeyhint="done">
          <button type="button" class="btn primary" data-sq-act="add">${ICON.plus}<span class="sr">Add</span></button></div>
      ` : ''}`;

    shEl.querySelector('#preset-team-select')?.addEventListener('change', (e) => {
      pickedKey = e.target.value;
      pickedName = teamName(pickedKey);
      pickedColor = getDeviceTeamData(pickedName, pickedKey).color || teamDefaultColor(pickedKey) || COLORS[0];
      squad = squadFor(pickedKey);
      renderBody();
    });
    const sqList = shEl.querySelector('#sq-list');
    if (sqList) makeSortable(sqList, 0, (from, to) => { squad.splice(to, 0, squad.splice(from, 1)[0]); renderBody(); });
    shEl.querySelectorAll('[data-preset-color]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pickedColor = btn.dataset.presetColor;
        renderBody();
      });
    });
  };

  const res = await sheet({
    title: 'Preset my team',
    actions: [
      { label: 'Cancel', kind: 'ghost', value: null },
      { label: 'Save preset', kind: 'primary', value: 'save' },
    ],
    onOpen(sh) {
      shEl = sh;
      renderBody();
      sh.addEventListener('input', (e) => {
        const k = e.target.dataset.sq;
        if (k != null) squad[+k] = e.target.value;
      });
      sh.addEventListener('click', (e) => {
        const b = e.target.closest('[data-sq-act]');
        if (!b) return;
        const k = +b.dataset.k;
        const a = b.dataset.sqAct;
        if (a === 'del') squad.splice(k, 1);
        if (a === 'add') squad.push(...sh.querySelector('#sq-new').value.split(/[\n,]+/).map((n) => n.trim().slice(0, 24)).filter(Boolean));
        renderBody();
        if (a === 'add') sh.querySelector('#sq-new')?.focus();
      });
    },
  });

  if (res !== 'save') return;
  myTeam = pickedKey;
  store.set('tball.myTeam', myTeam);
  if (myTeam) setSquad(squad);
  if (myTeam) {
    const own = teamName(myTeam);
    const existingPlayers = getDeviceTeamData(own, myTeam).players;
    saveDeviceTeamData(own, myTeam, pickedColor, existingPlayers);
    // In an unstarted game that already has this team, fill in its players,
    // colour and the fixture opponent. Never guess which team is ours.
    const mineIdx = game ? game.teams.findIndex((t) => t.name === own) : -1;
    if (current === 'score' && game && game.events.length === 0 && mineIdx >= 0) {
      const fx = fixtureOn(myTeam, game.date);
      const oppIdx = 1 - mineIdx;
      game.teams[mineIdx].name = own;
      game.teams[mineIdx].color = pickedColor;
      if (existingPlayers.length) {
        game.teams[mineIdx].players = [...existingPlayers];
        game.teams[mineIdx].start = existingPlayers.length;
      }
      if (fx?.type === 'game') {
        const oppInfo = getDeviceTeamData(fx.opponent, fx.oppKey);
        game.teams[oppIdx].name = fx.opponent;
        game.teams[oppIdx].color = distinctColor(oppInfo.color || fx.oppColor || COLORS[1], pickedColor);
        if (oppInfo.players.length) {
          game.teams[oppIdx].players = [...oppInfo.players];
          game.teams[oppIdx].start = oppInfo.players.length;
        }
        game.venue = fx.venue;
      }
      save();
      renderScore();
      toast(`Preset saved: ${own}${fx?.type === 'game' ? ` v ${fx.opponent}` : ''}`);
      return;
    }
    if (current === 'setup' && draft && !draft.editing) {
      applyFixture();
      renderSetup();
    }
    toast(`Team preset saved: ${own}`);
  } else {
    toast('Team preset cleared');
  }
  if (current === 'home') renderHome();
};

ACTIONS.swapInGame = () => {
  if (game.events.length > 0) {
    return toast("Can't swap batting team after plays are recorded (Undo plays first)");
  }
  game.teams.reverse();
  upNext = null;
  selected = null;
  pending = null;
  save();
  buzz(10);
  renderScore();
  toast(`${game.teams[0].name} now batting first`);
};

ACTIONS.menu = async () => {
  const own = teamName(myTeam);
  const v = await sheet({
    title: 'Game options',
    body: '<div class="menu-list">' +
      `<button class="menu-item" data-i="6">${ICON.shield}<span><b>Preset my team</b><small>${own ? `${esc(own)} · auto-fills opponent, colours &amp; venue` : 'Set your team on this device'}</small></span></button>` +
      `<button class="menu-item" data-i="4">${ICON.help}<span><b>Help</b><small>Game day guide, rules and symbols</small></span></button>` +
      (state.over ? '' : `<button class="menu-item" data-i="5">${ICON.sheet}<span><b>Lineup</b><small>Who is batting, late arrival, player left, order</small></span></button>`) +
      `<button class="menu-item" data-i="0">${ICON.edit}<span><b>Edit game</b><small>Names, innings, rules</small></span></button>` +
      (state.over ? '' : `<button class="menu-item" data-i="1">${ICON.flag}<span><b>End innings now</b><small>Before the limit is reached</small></span></button>`) +
      (state.over ? '' : `<button class="menu-item" data-i="2">${ICON.whistle}<span><b>End game now</b><small>E.g. time ran out</small></span></button>`) +
      `<button class="menu-item danger" data-i="3">${ICON.trash}<span><b>Delete game</b></span></button></div>`,
    actions: [{ value: 'edit' }, { value: 'endHalf' }, { value: 'over' }, { value: 'delete' }, { value: 'help' }, { value: 'lineup' }, { value: 'presetTeam' }],
  });
  if (v === 'presetTeam') ACTIONS.presetTeam();
  if (v === 'help') ACTIONS.help();
  if (v === 'lineup') ACTIONS.lineup();
  if (v === 'edit') ACTIONS.editGame();
  if (v === 'endHalf' && await confirmSheet('End this innings?', "The limit hasn't been reached yet. The other team will bat next.", 'End innings'))
    ACTIONS.endHalf();
  if (v === 'over' && await confirmSheet('End the game?', 'Innings not played are left blank on the sheet.', 'End game'))
    commit({ t: 'over' }, 'game ended');
  if (v === 'delete' && await confirmSheet('Delete this game?', "This can't be undone.", 'Delete', 'danger')) {
    db.forget(game.id);
    games = games.filter((g) => g !== game);
    game = null;
    save();
    go('home');
  }
};

// ---------- help ----------
const LEGEND = [
  { cell: { segs: [{ from: 0, to: 1 }] }, text: 'Reached 1st base safely' },
  { cell: { segs: [{ from: 0, to: 1 }, { from: 1, to: 2 }] }, text: 'Moved on to 2nd (one dot per base)' },
  { cell: { segs: [{ from: 0, to: 2 }] }, text: 'Hit and ran straight to 2nd (arc)' },
  { cell: { segs: [{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }], scored: true }, text: 'Got home: filled circle = 1 run' },
  { cell: { segs: [{ from: 0, to: 4 }], scored: true }, text: 'Home run' },
  { cell: { segs: [], out: 1, how: 'K' }, text: 'Struck out, 1st out of the innings' },
  { cell: { segs: [{ from: 0, to: 1 }], out: 2, how: 'R' }, text: 'Reached 1st, then out at 2nd' },
  { cell: { segs: [], out: 3, how: 'C' }, text: 'Caught out, 3rd out' },
];

ACTIONS.help = () =>
  sheet({
    title: 'How it works',
    body: `
      <div class="help">
        <div class="guide">
          <h4>Game day guide</h4>
          <p class="guide-key">${ICON.bulb}<span>Watch the whole play. Tap only when the ball is dead and everyone has stopped running.</span></p>
          <h5>Before the game</h5>
          <ul>
            <li>Set up the game at home: teams in batting order and the innings rule.</li>
            <li>Set your team in <b>Preset my team</b> and add your full squad there. Each new game starts from it: tap <b>Not here</b> for anyone missing, then drag to set the batting order.</li>
            <li>Install the app so it works with no signal.</li>
          </ul>
          <h5>Each batter</h5>
          <ul>
            <li>Tap where the batter ended up, or how they got out.</li>
            <li>If anyone was on base, a list appears. Forced advances are pre-selected; tap any runner to adjust (<b>Stayed</b>, a base, <b>Home</b> or <b>Out</b>) and <b>Confirm</b>.</li>
            <li>Tapped <b>Out</b>? Also tap the base they were out at.</li>
            <li>Wrong child at the plate? Tap <b>Lineup</b>, then <b>Bat now</b> on who is really batting.</li>
            <li>Check the diamond preview, then <b>Confirm</b>. A banner repeats what was saved, with <b>Undo</b>.</li>
            <li>Late arrival, someone left, or the order was wrong? Tap <b>Lineup</b> next to the batter. Changes apply from the next batter and never alter plays already saved.</li>
            <li>Stand where you can see every base. A helper calling out plays makes it easy.</li>
          </ul>
          <h5>Fixing mistakes</h5>
          <ul>
            <li>Before Confirm: <b>Back</b>. After: <b>Undo</b> takes back the whole play (and <b>Redo</b> brings it back if tapped by mistake).</li>
            <li>Red message: the play can't happen (for example too many outs). Amber: allowed, but check it.</li>
            <li>A runner moved later (steal, overthrow)? Tap their badge on the diamond.</li>
            <li>Missed a play? Enter it straight away and check the <b>Sheet</b> tab between innings.</li>
          </ul>
          <h5>End of innings and game</h5>
          <ul>
            <li>At "Innings over", check who scored and who was out with the umpire, then swap teams.</li>
            <li>Game going longer? Tap <b>Play another innings</b> at the end.</li>
            <li>At the end, the umpire signs on the phone, then <b>Share</b> the sheet.</li>
          </ul>
        </div>
        <h4>Tee-ball in 30 seconds</h4>
        <ul>
          <li>Teams take turns to bat. Each turn is half an <b>innings</b>.</li>
          <li>The batter hits the ball off the tee and runs. If they reach a base before the ball, they're <b>safe</b>.</li>
          <li>A player who gets all the way round to home scores a <b>run</b>. Most runs wins.</li>
          <li>The batter is <b>out</b> if the ball is caught in the air, or a fielder beats them to the base. In leagues with strikeouts, also after 3 misses (turn this on or off in <b>Edit game</b>).</li>
          <li>The innings ends after the limit set for the game (often 3 outs or 9 batters). Tell the umpire when that happens.</li>
        </ul>
        <h4>Scoring in this app</h4>
        <ul>
          <li>Tap what the batter did, then check where everyone on base ended up and Confirm.</li>
          <li>Runners forced by the hit are pre-set to the base they had to reach. Change any who ran further or were put out. Bases they can't be on (because someone behind needs them) are hidden.</li>
          <li>Every play can be undone, and redone.</li>
        </ul>
        <h4>Symbols on the sheet</h4>
        <div class="legend">${LEGEND.map((l, i) => `<div><canvas data-legend="${i}" width="112" height="112"></canvas><span>${l.text}</span></div>`).join('')}</div>
        <p class="muted">A thick diagonal line marks who bats first in the next innings. The split box at the bottom shows the innings runs (top) and the running total (bottom).</p>
        <h4>Your data</h4>
        <p class="muted">Every tap is saved instantly on this phone, twice over. The app works with no signal${navigator.serviceWorker?.controller ? ' <b>(offline ready)</b>' : ''}. Use <b>Back up</b> on the home screen to keep a copy off the phone. Tip: add the app to your home screen so the phone keeps its data.</p>
        <label class="toggle"><input type="checkbox" id="tips-toggle" ${tips ? 'checked' : ''}><span></span>Show coach tips while scoring</label>
        ${standalone() ? '' : '<button class="btn ghost wide" id="install-help">Install as an app</button>'}
        <button class="btn ghost wide" id="replay-intro">Replay intro</button>
      </div>`,
    onOpen(el, close) {
      el.querySelectorAll('[data-legend]').forEach((c) => {
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, 112, 112);
        ctx.scale(2, 2);
        drawCell(ctx, 0, 0, 56, LEGEND[+c.dataset.legend].cell);
        ctx.strokeStyle = '#222';
        ctx.strokeRect(0.5, 0.5, 55, 55);
      });
      el.querySelector('#tips-toggle').addEventListener('change', (e) => {
        tips = e.target.checked;
        store.set('tball.tips', tips);
        if (current === 'score') renderScore();
      });
      el.querySelector('#install-help')?.addEventListener('click', () => { close(null); store.set('tball.installDismissed', false); ACTIONS.install(); });
      el.querySelector('#replay-intro').addEventListener('click', () => { close(null); go('intro'); });
    },
  });

// ---------- finish, sign and share ----------
let sheetFile = null;
let sheetUrl = null;
let sigCtx = null;

function fileName() {
  const safe = (s) => s.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '');
  return `teeball-${game.date}-${safe(game.teams[0].name)}-v-${safe(game.teams[1].name)}.png`;
}

function renderFinish() {
  state = replay(game);
  const [a, b] = game.teams;
  const ra = total(state.teams[0].runs);
  const rb = total(state.teams[1].runs);
  const headline = !state.over ? 'Game in progress' : ra === rb ? "It's a draw" : `${(ra > rb ? a : b).name} win`;
  app.innerHTML = `
    ${topBar({ back: 'home', title: 'Sign & share' })}
    <section class="scoreboard final">
      <small>${esc(headline)}</small>
      <div class="final-score">
        <div style="--team:${safeColor(a.color, COLORS[0])}"><i></i><span>${esc(a.name)}</span><b>${ra}</b></div>
        <em>–</em>
        <div style="--team:${safeColor(b.color, COLORS[1])}"><b>${rb}</b><span>${esc(b.name)}</span><i></i></div>
      </div>
    </section>
    <main class="finish">
      ${state.over ? '' : `<div class="tip warn">${ICON.whistle}<p>The game isn't finished yet. You can still share the sheet so far, or end the game now.</p>
        <button class="btn small" data-action="endGame">End game</button></div>`}
      <section class="card step">
        <div class="step-head"><span class="step-n">1</span><div><b>Umpire signs</b><small>Hand the phone to the umpire to sign with a finger</small></div></div>
        <div class="sig-wrap"><canvas id="sig"></canvas><span class="sig-hint" ${game.signature ? 'hidden' : ''}>Sign here</span></div>
        <div class="sig-actions">
          <button class="btn ghost small" data-action="sigClear">Clear signature</button>
          <label class="toggle" style="margin:0;font-size:13.5px"><input type="checkbox" data-action="privacyToggle" ${game.privacyMode ? 'checked' : ''}><span></span>Hide player surnames (e.g. Ava S.)</label>
        </div>
      </section>
      <section class="card step">
        <div class="step-head"><span class="step-n">2</span><div><b>Share the scoresheet</b><small>Sends a picture of the sheet to any app</small></div></div>
        <button class="btn primary big" id="share" data-action="share" disabled>${ICON.share} Share</button>
        <button class="btn ghost wide" data-action="download">${ICON.download} Save image</button>
      </section>
      <section class="card">
        <h2 class="section" style="margin-top:0">Preview</h2>
        <button class="sheet-wrap zoomable" data-action="zoomPreview" aria-label="Open preview full screen"><img id="preview" alt="Scoresheet preview"></button>
        <p class="zoom-hint">${ICON.zoom} Tap the preview to zoom</p>
      </section>
    </main>
    ${tabBar('share')}`;
  requestAnimationFrame(initSig);
  buildSheet();
}
ACTIONS.backToScore = () => go('score');
ACTIONS.finish = () => go('finish');
ACTIONS.privacyToggle = (el) => {
  game.privacyMode = el.checked;
  save();
  buildSheet();
  toast(game.privacyMode ? 'Surnames hidden on scoresheet' : 'Full names shown on scoresheet');
};
ACTIONS.endGame = async () => {
  if (!await confirmSheet('End the game?', 'Innings not played are left blank on the sheet.', 'End game')) return;
  game.events.push({ t: 'over', m: 'game ended' });
  save();
  renderFinish();
  toast('Game marked final', { label: 'Undo', run: () => { undo(); renderFinish(); } });
};

function initSig() {
  const sig = document.getElementById('sig');
  if (!sig) return;
  const r = sig.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  sig.width = r.width * dpr;
  sig.height = r.height * dpr;
  sigCtx = sig.getContext('2d');
  sigCtx.scale(dpr, dpr);
  Object.assign(sigCtx, { lineWidth: 2.4, lineCap: 'round', lineJoin: 'round', strokeStyle: '#0b1220' });
  if (game.signature) {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(r.width / img.width, r.height / img.height, 1 / dpr);
      const w = img.width * k;
      const h = img.height * k;
      sigCtx.drawImage(img, (r.width - w) / 2, (r.height - h) / 2, w, h);
    };
    img.src = game.signature;
  }
  let drawing = false;
  let dirty = false;
  sig.addEventListener('pointerdown', (e) => {
    drawing = true;
    sig.setPointerCapture(e.pointerId);
    sigCtx.beginPath();
    sigCtx.moveTo(e.offsetX, e.offsetY);
    document.querySelector('.sig-hint').hidden = true;
  });
  sig.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    sigCtx.lineTo(e.offsetX, e.offsetY);
    sigCtx.stroke();
    dirty = true;
  });
  const end = () => {
    if (!drawing) return;
    drawing = false;
    if (dirty) {
      game.signature = trimmedSignature(sig);
      save();
      buildSheet();
    }
  };
  sig.addEventListener('pointerup', end);
  sig.addEventListener('pointercancel', end);
}

// Crop the signature to its ink so it sits neatly on the sheet.
function trimmedSignature(sig) {
  const { width: w, height: h } = sig;
  const data = sigCtx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const c = document.createElement('canvas');
  c.width = x1 - x0 + 1;
  c.height = y1 - y0 + 1;
  c.getContext('2d').drawImage(sig, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

ACTIONS.sigClear = () => {
  game.signature = null;
  save();
  renderFinish();
};

function loadImage(src) {
  return new Promise((res) => {
    if (!src) return res(null);
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

// Built ahead of time so the share tap can call navigator.share straight
// away; iOS rejects share() if the tap's user activation has lapsed.
async function buildSheet() {
  sheetFile = null;
  const btn = document.getElementById('share');
  if (btn) btn.disabled = true;
  const canvas = renderSheet(game, replay(game), await loadImage(game.signature));
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  sheetFile = new File([blob], fileName(), { type: 'image/png' });
  if (sheetUrl) URL.revokeObjectURL(sheetUrl);
  sheetUrl = URL.createObjectURL(blob);
  const prev = document.getElementById('preview');
  if (prev) prev.src = sheetUrl;
  if (btn) btn.disabled = false;
}

const download = () => saveFile(sheetFile);

ACTIONS.share = async () => {
  if (!sheetFile) return;
  const s = replay(game);
  const data = {
    files: [sheetFile],
    title: 'Tee-ball scoresheet',
    text: `${game.teams[0].name} ${total(s.teams[0].runs)} – ${total(s.teams[1].runs)} ${game.teams[1].name}`,
  };
  if (navigator.canShare?.({ files: data.files })) {
    try {
      await navigator.share(data);
    } catch (e) {
      if (e.name !== 'AbortError') { toast('Sharing failed, saving the image instead'); download(); }
    }
  } else {
    toast("Sharing isn't supported here, saving the image");
    download();
  }
};
ACTIONS.download = () => sheetFile && download();

// ---------- boot ----------
// No OS text-selection / long-press callouts, except where typing.
// Universal Enter key handler: confirms the current field and advances to the
// next similar field in the group, or exits (blurs) when at the end.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing) return;
  const input = e.target.closest('input, select, textarea');
  if (!input) return;

  if (input.type === 'checkbox' || input.type === 'radio') {
    e.preventDefault();
    input.click();
    return;
  }

  // Setup Step 2: Add new player input
  if (input.id === 'new-player') {
    e.preventDefault();
    if (input.value.trim()) {
      ACTIONS.addPlayer();
    } else {
      const firstRow = app.querySelector('#players input[data-bind^="player:"]');
      if (firstRow) {
        firstRow.focus();
        try { firstRow.select?.(); } catch { /* ignore */ }
      } else {
        input.blur();
      }
    }
    return;
  }

  // Preset sheet: add to the squad
  if (input.id === 'sq-new') {
    e.preventDefault();
    if (input.value.trim()) input.closest('.bsheet')?.querySelector('[data-sq-act="add"]')?.click();
    else input.blur();
    return;
  }

  // Lineup sheet: Add late arrival input
  if (input.id === 'lu-new') {
    e.preventDefault();
    const sh = input.closest('.bsheet');
    if (input.value.trim() && sh) {
      sh.querySelector('[data-lu="add"]')?.click();
    } else {
      input.blur();
    }
    return;
  }

  e.preventDefault();
  if (input.type === 'text' || !input.type) {
    input.value = input.value.trim();
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  const scope = input.closest('.bsheet, main') || document;
  let selector = 'input:not([type="checkbox"]):not([type="radio"]):not([disabled])';
  if (input.matches('[data-lu-name]')) {
    selector = 'input[data-lu-name]';
  } else if (input.matches('[data-bind^="player:"]')) {
    selector = 'input[data-bind^="player:"]';
  } else if (input.matches('[data-bind^="team:"], [data-bind="date"], [data-bind="venue"]') || (input.id === 'my-team' || input.id === 'preset-team-select')) {
    selector = 'input[data-bind^="team:"], input[data-bind="venue"]';
  } else if (input.matches('[data-bind="maxOuts"], [data-bind="maxBatters"]')) {
    selector = 'input[data-bind="maxOuts"], input[data-bind="maxBatters"]';
  }

  const fields = [...scope.querySelectorAll(selector)].filter((el) => !el.disabled && el.offsetParent !== null);
  const idx = fields.indexOf(input);
  if (idx >= 0 && idx + 1 < fields.length) {
    const next = fields[idx + 1];
    next.focus();
    try { next.select?.(); } catch { /* date/number inputs */ }
  } else if ((input.id === 'my-team' || input.id === 'preset-team-select') && fields.length) {
    fields[0].focus();
    try { fields[0].select?.(); } catch { /* ignore */ }
  } else {
    input.blur();
  }
});

document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('input, textarea')) e.preventDefault();
});

function fmtDate(d) {
  try { return new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); }
  catch { return d; }
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

go(store.get('tball.onboarded', false) ? 'home' : 'intro');

// Recover anything only the IndexedDB copy has (e.g. localStorage cleared).
db.loadDeep(games).then((merged) => {
  const changed = merged.length !== games.length ||
    merged.some((g) => (g.updated || 0) > (games.find((x) => x.id === g.id)?.updated || 0));
  if (!changed) return;
  games = merged;
  if (game) game = games.find((g) => g.id === game.id) || game;
  db.saveAll(games);
  if (current === 'home') renderHome();
});
if (games.length) db.persist();
