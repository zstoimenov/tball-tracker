import {
  newGame, replay, battingTeam, currentInning, halfDone, canBat, canRun,
  pathClear, batterLimit, total,
} from './model.js';
import { renderGrid, renderSheet, drawCell } from './draw.js';
import { ICON, esc, sheet, confirmSheet, toast, buzz } from './ui.js';
import * as db from './storage.js';

const app = document.getElementById('app');
const BASE = ['Home', '1st', '2nd', '3rd', 'Home'];
const COLORS = ['#3b82f6', '#e5484d', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899', '#0ea5e9', '#f97316', '#334155'];

const HITS = [
  { r: 1, label: '1st' },
  { r: 2, label: '2nd' },
  { r: 3, label: '3rd' },
  { r: 4, label: 'Home run' },
];
const OUTS = [
  { r: 'K', label: 'Struck out', hint: '3 strikes', glyph: 'K' },
  { r: 'C', label: 'Caught', hint: 'In the air', glyph: 'C' },
  { r: 'T', label: 'Tagged out', hint: 'Beaten to base', glyph: 'T' },
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

// ---------- app state ----------
let game = null;
let state = null;
let draft = null; // setup wizard
let selected = null; // selected runner (player index)
let sheetOpen = store.get('tball.sheetOpen', false);
let gridTeam = 0;
let gridPinned = false;
let current = 'home';

function go(view, arg) {
  current = view;
  selected = null;
  ({ home: renderHome, intro: renderIntro, setup: renderSetup, score: renderScore, finish: renderFinish })[view](arg);
  window.scrollTo(0, 0);
}

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
  { art: ART.diamond, title: 'Runners on the diamond', text: 'Players on base appear on the diamond. Tap one to move them when they run further, or to mark them out.' },
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
function gameCard(g) {
  const s = replay(g);
  const [a, b] = g.teams;
  const ra = total(s.teams[0].runs);
  const rb = total(s.teams[1].runs);
  const status = s.over ? 'Final' : `Innings ${Math.min(currentInning(s) + 1, g.innings)}`;
  return `
    <button class="game-card" data-action="open" data-id="${g.id}">
      <div class="gc-teams">
        <div class="gc-row"><i style="background:${a.color || COLORS[0]}"></i><span>${esc(a.name)}</span><b>${ra}</b></div>
        <div class="gc-row"><i style="background:${b.color || COLORS[1]}"></i><span>${esc(b.name)}</span><b>${rb}</b></div>
      </div>
      <div class="gc-meta"><span class="pill ${s.over ? '' : 'live'}">${status}</span>
        <span>${esc(fmtDate(g.date))}${g.venue ? ' · ' + esc(g.venue) : ''}</span></div>
    </button>`;
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
      ${live.length ? `<h2 class="section">In progress</h2>${live.map(gameCard).join('')}` : ''}
      ${done.length ? `<h2 class="section">Finished</h2>${done.map(gameCard).join('')}` : ''}
      ${games.length ? '' : `<div class="empty">${ART.diamond}<p>No games yet. Tap <b>New game</b> to start scoring.</p></div>`}
    </main>`;
}
// ---------- install as an app (PWA) ----------
let installPrompt = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const showInstall = () => !standalone() && !store.get('tball.installDismissed', false) && (installPrompt || isIOS());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // show our own button instead of the mini-infobar
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
  return games.some((g) => (g.updated || g.created) > since && replay(g).over);
}

ACTIONS.homeMenu = async () => {
  const when = db.lastBackup();
  const v = await sheet({
    title: 'Your data',
    body: `<p class="sheet-text">Games are saved on this phone after every tap and work fully offline.
      ${when ? `Last backup: <b>${esc(new Date(when).toLocaleString())}</b>.` : 'No backup made yet.'}</p>
      <div class="menu-list">
        <button class="menu-item" data-i="0">${ICON.download}<span><b>Back up all games</b><small>Save or send a backup file (e.g. to Files, Drive or email)</small></span></button>
        <button class="menu-item" data-i="1">${ICON.upload}<span><b>Restore from backup</b><small>Adds games from a backup file; nothing is overwritten with older data</small></span></button>
      </div>`,
    actions: [{ value: 'backup' }, { value: 'restore' }],
  });
  if (v === 'backup') ACTIONS.backup();
  if (v === 'restore') restore();
};

ACTIONS.backup = async () => {
  if (!games.length) return toast('No games to back up yet');
  const file = db.backupFile(games);
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
      const incoming = await db.readBackup(inp.files[0]);
      const before = games.length;
      games = db.merge(games, incoming);
      db.saveAll(games);
      toast(`Restored. ${games.length - before} new game${games.length - before === 1 ? '' : 's'} added.`);
      renderHome();
    } catch {
      toast("That file isn't a Tee-ball backup");
    }
  };
  inp.click();
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
  gridPinned = false;
  go('score');
};

// ---------- setup wizard ----------
const STEPS = ['Teams', 'Players', 'Rules'];

ACTIONS.new = () => {
  const last = [...games].sort((a, b) => b.created - a.created)[0];
  draft = {
    editing: false,
    step: 0,
    tab: 0,
    date: new Date().toLocaleDateString('en-CA'),
    venue: '',
    innings: last?.innings || 4,
    maxOuts: last?.maxOuts ?? 3,
    maxBatters: last?.maxBatters ?? 9,
    // Start from last game's own team to save typing each week.
    teams: [
      { name: last?.teams[0].name || '', color: last?.teams[0].color || COLORS[0], players: last ? [...last.teams[0].players] : [] },
      { name: '', color: COLORS[1], players: [] },
    ],
    locked: [0, 0],
  };
  draft.preset = presetOf(draft);
  go('setup');
};

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
    teams: game.teams.map((t, i) => ({ name: t.name, color: t.color || COLORS[i], players: [...t.players] })),
    // Events refer to batting positions, so existing players can be renamed but not removed.
    locked: game.events.length ? game.teams.map((t) => t.players.length) : [0, 0],
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
  return `
    <div class="card team-card" style="--team:${t.color}">
      <div class="team-card-head"><span class="order">${i ? 'Bats second' : 'Bats first'}</span></div>
      <input class="input big" data-bind="team:${i}:name" value="${esc(t.name)}" placeholder="${i ? 'Opponent name' : 'Your team name'}" autocomplete="off" maxlength="30">
      <div class="swatches" role="radiogroup" aria-label="Team colour">
        ${COLORS.map((c) => `<button class="swatch ${c === t.color ? 'on' : ''}" style="--c:${c}" data-action="color" data-t="${i}" data-c="${c}" aria-label="Colour ${c}"></button>`).join('')}
      </div>
    </div>`;
}

function setupTeams() {
  return `
    <p class="lead">Who's playing? The team that bats first goes on top.</p>
    ${teamFields(0)}
    <button class="swap-btn" data-action="swapTeams">${ICON.swap} Swap batting order</button>
    ${teamFields(1)}
    <div class="card">
      <label class="field"><span>Date</span><input class="input" type="date" data-bind="date" value="${esc(draft.date)}"></label>
      <label class="field"><span>Venue <em>optional</em></span><input class="input" data-bind="venue" value="${esc(draft.venue)}" placeholder="e.g. Riverside Park" autocomplete="off"></label>
    </div>`;
}

function setupPlayers() {
  const i = draft.tab;
  const t = draft.teams[i];
  const locked = draft.locked[i];
  return `
    <p class="lead">Add players in batting order. Names are optional: leave them blank and players are shown by number (#1, #2…).</p>
    <div class="segmented">${draft.teams.map((tm, k) => `
      <button class="${k === i ? 'on' : ''}" data-action="tab" data-t="${k}" style="--team:${tm.color}">
        <i></i>${esc(tm.name || (k ? 'Team 2' : 'Team 1'))} <small>${tm.players.length}</small></button>`).join('')}
    </div>
    <div class="add-row">
      <input class="input" id="new-player" placeholder="Name (optional)" autocomplete="off" enterkeyhint="done" maxlength="24">
      <button class="btn primary" data-action="addPlayer">${ICON.plus}<span class="sr">Add</span></button>
    </div>
    <ol class="players">
      ${t.players.map((p, k) => `
        <li>
          <span class="num">${k + 1}</span>
          <input class="input bare" data-bind="player:${i}:${k}" value="${esc(p)}" placeholder="#${k + 1}" aria-label="Player ${k + 1} name" maxlength="24">
          <button class="icon-btn sm" data-action="movePlayer" data-k="${k}" data-d="-1" ${k === 0 || k < locked ? 'disabled' : ''} aria-label="Move up">${ICON.up}</button>
          <button class="icon-btn sm" data-action="movePlayer" data-k="${k}" data-d="1" ${k === t.players.length - 1 || k < locked ? 'disabled' : ''} aria-label="Move down">${ICON.down}</button>
          <button class="icon-btn sm" data-action="removePlayer" data-k="${k}" ${k < locked ? 'disabled' : ''} aria-label="Remove">${ICON.x}</button>
        </li>`).join('')}
    </ol>
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
        <label class="field"><span>Outs <em>0 = no limit</em></span><input class="input" type="number" min="0" max="9" inputmode="numeric" data-bind="maxOuts" value="${d.maxOuts}"></label>
        <label class="field"><span>Batters <em>0 = whole team</em></span><input class="input" type="number" min="0" max="30" inputmode="numeric" data-bind="maxBatters" value="${d.maxBatters}"></label>
      </div>` : ''}`;
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
  const np = document.getElementById('new-player');
  np?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ACTIONS.addPlayer(); } });
}

const setupError = (msg) => {
  const el = document.getElementById('setup-error');
  el.textContent = msg;
  el.hidden = false;
  buzz(30);
};

ACTIONS.color = (el) => { draft.teams[+el.dataset.t].color = el.dataset.c; renderSetup(); };
ACTIONS.swapTeams = () => {
  if (draft.locked[0]) return toast("Batting order can't change once the game has started");
  draft.teams.reverse();
  renderSetup();
};
ACTIONS.tab = (el) => { draft.tab = +el.dataset.t; renderSetup(); };
ACTIONS.addPlayer = () => {
  const inp = document.getElementById('new-player');
  const t = draft.teams[draft.tab];
  t.players.push(inp.value.trim());
  renderSetup();
  document.getElementById('new-player').focus();
};
ACTIONS.quickFill = () => {
  const t = draft.teams[draft.tab];
  for (let k = 1; k <= 9; k++) t.players.push('');
  renderSetup();
};
ACTIONS.movePlayer = (el) => {
  const ps = draft.teams[draft.tab].players;
  const k = +el.dataset.k;
  const j = k + +el.dataset.d;
  [ps[k], ps[j]] = [ps[j], ps[k]];
  renderSetup();
};
ACTIONS.removePlayer = (el) => { draft.teams[draft.tab].players.splice(+el.dataset.k, 1); renderSetup(); };
ACTIONS.innings = (el) => { draft.innings += +el.dataset.d; renderSetup(); };
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
    if (empty.length) toast(`${empty.map((t) => t.name).join(' and ')}: using 9 numbered players`);
  }
  if (d.step < 2) { d.step++; return renderSetup(); }

  const opts = {
    date: d.date,
    venue: d.venue.trim(),
    innings: d.innings,
    maxOuts: d.maxOuts,
    maxBatters: d.maxBatters,
    teams: d.teams.map((t) => ({ name: t.name, color: t.color, players: t.players })),
  };
  if (d.editing) Object.assign(game, opts);
  else { game = newGame(opts); games.push(game); db.persist(); }
  save();
  gridPinned = false;
  go('score');
};

// ---------- scoring ----------
const lastEvent = () => game.events[game.events.length - 1];
const anyRunners = () => state.runners.some((r) => r != null);
// Players without a name go by their batting number.
const playerName = (team, p) => game.teams[team].players[p] || `Batter #${p + 1}`;
const shortName = (team, p) => game.teams[team].players[p]?.split(' ')[0] || `#${p + 1}`;

// Phase is derived from the log so undo always lands in the right place.
function phase() {
  if (state.over) return 'over';
  const ev = lastEvent();
  // Runners can't advance on a strikeout or a catch, so skip the question.
  const inPlay = ev && (ev.t === 'adv' || ev.t === 'rout' || (ev.t === 'bat' && ev.r !== 'K' && ev.r !== 'C'));
  if (inPlay && anyRunners() && canRun(game, state)) return 'runners';
  if (halfDone(game, state)) return 'inningsOver';
  return 'bat';
}

function commit(ev, msg) {
  game.events.push(ev);
  save();
  selected = null;
  buzz();
  renderScore();
  if (msg) toast(msg, { label: 'Undo', run: undo });
}

function undo() {
  if (!game.events.length) return;
  game.events.pop();
  save();
  selected = null;
  renderScore();
}

function coachTip(ph, bt) {
  if (!tips || state.half >= 2) return '';
  const name = esc(playerName(bt, state.teams[bt].next));
  const text = {
    bat: game.events.length === 0
      ? 'Tap where the batter got to, or how they got out.'
      : `Tap where <b>${name}</b> got to, or how they got out.`,
    runners: 'Tap a runner on the diamond if they ran further or got out.',
    inningsOver: 'Tell the umpire, then swap: the other team bats now.',
    over: 'Get the umpire to check and sign the scoresheet, then share it.',
  }[ph];
  return `<div class="coach">${ICON.bulb}<p>${text}</p><button class="icon-btn sm" data-action="hideTips" aria-label="Hide tips">${ICON.x}</button></div>`;
}

function hero(bt) {
  const limit = batterLimit(game, bt);
  const dots = game.maxOuts
    ? Array.from({ length: game.maxOuts }, (_, k) => `<i class="${k < state.outs ? 'on' : ''}"></i>`).join('')
    : `<b>${state.outs}</b>`;
  const team = (i) => {
    const t = game.teams[i];
    const on = !state.over && i === bt;
    return `<div class="sb-team ${on ? 'batting' : ''}" style="--team:${t.color || COLORS[i]}">
      <span class="sb-name">${esc(t.name)}</span>${on ? '<small>Batting</small>' : ''}<b class="sb-runs">${total(state.teams[i].runs)}</b></div>`;
  };
  return `
    <section class="scoreboard">
      <div class="sb-teams">${team(0)}${team(1)}</div>
      ${state.over ? '' : `
      <div class="sb-strip">
        <span>Innings <b>${currentInning(state) + 1}</b>/${game.innings}</span>
        <span class="sb-outs">Outs <span class="out-dots">${dots}</span></span>
        <span>Batted <b>${state.batters}</b>/${limit}</span>
      </div>`}
    </section>`;
}

// Diamond positions (percent of the field box) for bases 0..3.
const POS = [[50, 88], [85, 52], [50, 16], [15, 52]];

function diamond(bt, ph) {
  const color = game.teams[bt].color || COLORS[bt];
  const runOk = canRun(game, state);
  const targets = new Set();
  if (selected != null) {
    const from = state.runners.indexOf(selected);
    for (let to = from + 1; to <= 4; to++) if (pathClear(state, from, to)) targets.add(to % 4);
  }
  const ev = lastEvent();
  const moved = ev?.t === 'adv' ? ev.p : ev?.t === 'bat' ? (state.teams[bt].next - 1 + game.teams[bt].players.length) % game.teams[bt].players.length : null;
  const chips = [];
  for (let b = 1; b <= 3; b++) {
    const p = state.runners[b];
    if (p == null) continue;
    chips.push(`<button class="chip ${game.teams[bt].players[p] ? '' : 'num-only'} ${selected === p ? 'sel' : ''} ${p === moved ? 'pop' : ''}" style="left:${POS[b][0]}%;top:${POS[b][1]}%;--team:${color}"
      data-action="pick" data-p="${p}" ${runOk ? '' : 'disabled'}><span>${p + 1}</span>${esc(game.teams[bt].players[p] ? shortName(bt, p) : '')}</button>`);
  }
  if (ph === 'bat') {
    const p = state.teams[bt].next;
    chips.push(`<div class="chip batter ${game.teams[bt].players[p] ? '' : 'num-only'}" style="left:${POS[0][0]}%;top:${POS[0][1]}%;--team:${color}"><span>${p + 1}</span>${esc(game.teams[bt].players[p] ? shortName(bt, p) : '')}</div>`);
  }
  const base = (b, x, y) => `<g class="base ${targets.has(b) ? 'target' : ''}" ${targets.has(b) ? `data-action="moveTo" data-to="${b || 4}"` : ''}>
      <circle cx="${x}" cy="${y}" r="26" class="hit"/>
      ${b ? `<rect x="${x - 8}" y="${y - 8}" width="16" height="16" rx="2" transform="rotate(45 ${x} ${y})"/>` : `<path d="M${x - 9} ${y - 7}h18v7l-9 8-9-8z"/>`}
    </g>`;

  let actionRow = '';
  if (selected != null) {
    const from = state.runners.indexOf(selected);
    const opts = [];
    for (let to = from + 1; to <= 4; to++) {
      if (!pathClear(state, from, to)) continue;
      opts.push(`<button class="btn safe" data-action="moveTo" data-to="${to}">${to === 4 ? 'Scored' : BASE[to]}</button>`);
    }
    actionRow = `
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
        <svg viewBox="0 0 300 250" aria-hidden="true">
          <path d="M150 242L12 104A196 196 0 0 1 288 104Z" class="grass"/>
          <path d="M150 220L255 130 150 40 45 130Z" class="dirt"/>
          <path d="M150 220L255 130 150 40 45 130Z" class="lines"/>
          <circle cx="150" cy="140" r="11" class="mound"/>
          ${base(1, 255, 130)}${base(2, 150, 40)}${base(3, 45, 130)}${base(0, 150, 220)}
        </svg>
        ${chips.join('')}
      </div>
      ${actionRow}
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
    const p = state.teams[bt].next;
    return `
      <section class="panel">
        <div class="batter-row"><span class="num-badge" style="--team:${game.teams[bt].color || COLORS[bt]}">${p + 1}</span>
          <div><small>Up to bat</small><h2>${esc(playerName(bt, p))}</h2></div></div>
        ${coachTip(ph, bt)}
        <h3 class="group safe-t">Safe on</h3>
        <div class="plays hits">${HITS.map((h) => `
          <button class="play safe" data-action="bat" data-r="${h.r}">${miniDiamond(h.r)}<b>${h.label}</b></button>`).join('')}
        </div>
        <h3 class="group out-t">Out</h3>
        <div class="plays outplays">${OUTS.map((o) => `
          <button class="play out" data-action="bat" data-r="${o.r}"><span class="glyph">${o.glyph}</span><b>${o.label}</b><small>${o.hint}</small></button>`).join('')}
        </div>
      </section>`;
  }
  if (ph === 'runners') {
    const reason = halfDone(game, state);
    const next = state.teams[bt].next;
    return `
      <section class="panel">
        <div class="panel-head"><small>After the play</small><h2>Any runners go further?</h2></div>
        ${coachTip(ph, bt)}
        <button class="btn primary big" data-action="next">${reason ? 'Done: end of innings' : `Next batter: ${esc(shortName(bt, next))}`} ${ICON.chevron}</button>
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
        <p>Tell the umpire. ${esc(game.teams[bt].name)} scored <b>${state.teams[bt].runs[currentInning(state)] || 0}</b> this innings.</p>
        <button class="btn primary big" data-action="endHalf">${lastHalf ? 'Finish the game' : `${esc(game.teams[nt].name)} bat next`} ${ICON.chevron}</button>
      </section>`;
  }
  const [a, b] = game.teams;
  const ra = total(state.teams[0].runs);
  const rb = total(state.teams[1].runs);
  return `
    <section class="panel done">
      <div class="panel-head"><small>Game over</small><h2>${ra === rb ? "It's a draw!" : `${esc((ra > rb ? a : b).name)} win!`}</h2></div>
      <button class="btn primary big" data-action="finish">${ICON.share} Sign &amp; share scoresheet</button>
    </section>`;
}

function renderScore() {
  state = replay(game);
  const bt = battingTeam(state);
  const ph = phase();
  if (!gridPinned) gridTeam = state.over ? 0 : bt;
  if (selected != null && !state.runners.includes(selected)) selected = null;
  const sub = state.over ? 'Final' : `${esc(game.teams[bt].name)} batting`;

  app.innerHTML = `
    ${topBar({ back: 'home', title: state.over ? 'Game over' : `Innings ${currentInning(state) + 1} of ${game.innings}`, sub,
      right: `${helpBtn}<button class="icon-btn" data-action="menu" aria-label="More">${ICON.more}</button>` })}
    ${hero(bt)}
    <main class="score">
      ${state.over ? '' : diamond(bt, ph)}
      ${panel(ph, bt)}
      <section class="card sheet-card ${sheetOpen ? 'open' : ''}" id="sheet-card">
        <button class="sheet-toggle" data-action="toggleSheet">${ICON.sheet}<span><b>Scoresheet</b><small>The paper sheet, filled in as you go</small></span>${ICON.down}</button>
        ${sheetOpen ? `
          <div class="segmented">${game.teams.map((t, i) => `<button class="${i === gridTeam ? 'on' : ''}" data-action="gridTeam" data-t="${i}" style="--team:${t.color || COLORS[i]}"><i></i>${esc(t.name)}</button>`).join('')}</div>
          <div class="sheet-wrap"><canvas id="grid"></canvas></div>` : ''}
      </section>
    </main>
    <nav class="bottom-bar">
      <button data-action="undo" ${game.events.length ? '' : 'disabled'}>${ICON.undo}<span>Undo</span></button>
      <button data-action="toggleSheet" data-scroll="1">${ICON.sheet}<span>Sheet</span></button>
      <button data-action="finish" class="${state.over ? 'hot' : ''}">${ICON.share}<span>Share</span></button>
    </nav>`;

  if (sheetOpen) {
    const hi = ph === 'bat' && gridTeam === bt ? { inning: currentInning(state), player: state.teams[bt].next } : null;
    renderGrid(document.getElementById('grid'), game, state, gridTeam, hi);
  }
}

ACTIONS.home = () => go('home');
ACTIONS.bat = (el) => {
  const r = /\d/.test(el.dataset.r) ? +el.dataset.r : el.dataset.r;
  const bt = battingTeam(state);
  const name = shortName(bt, state.teams[bt].next);
  const label = typeof r === 'number' ? (r === 4 ? 'home run!' : `safe on ${BASE[r]}`) : OUTS.find((o) => o.r === r).label.toLowerCase();
  commit({ t: 'bat', r }, `${name}: ${label}`);
};
ACTIONS.pick = (el) => {
  const p = +el.dataset.p;
  selected = selected === p ? null : p;
  buzz(6);
  renderScore();
};
ACTIONS.moveTo = (el) => {
  const bt = battingTeam(state);
  const to = +el.dataset.to;
  const name = shortName(bt, selected);
  commit({ t: 'adv', p: selected, to }, to === 4 ? `${name} scored!` : `${name} to ${BASE[to]}`);
};
ACTIONS.runnerOut = () => {
  const name = shortName(battingTeam(state), selected);
  commit({ t: 'rout', p: selected }, `${name} out`);
};
ACTIONS.next = () => commit({ t: 'next' });
ACTIONS.undo = () => { undo(); toast('Undone'); };
ACTIONS.endHalf = () => {
  gridPinned = false;
  commit({ t: 'end' });
  if (state.over) toast('Game over');
};
ACTIONS.toggleSheet = (el) => {
  sheetOpen = el.dataset.scroll ? true : !sheetOpen;
  store.set('tball.sheetOpen', sheetOpen);
  renderScore();
  if (sheetOpen) document.getElementById('sheet-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
};
ACTIONS.gridTeam = (el) => { gridTeam = +el.dataset.t; gridPinned = true; renderScore(); };
ACTIONS.hideTips = () => { tips = false; store.set('tball.tips', false); renderScore(); toast('Tips hidden. Turn them back on in Help.'); };

ACTIONS.menu = async () => {
  const v = await sheet({
    title: 'Game options',
    body: '<div class="menu-list">' +
      `<button class="menu-item" data-i="0">${ICON.edit}<span><b>Edit game</b><small>Names, players, innings, rules</small></span></button>` +
      (state.over ? '' : `<button class="menu-item" data-i="1">${ICON.flag}<span><b>End innings now</b><small>Before the limit is reached</small></span></button>`) +
      (state.over ? '' : `<button class="menu-item" data-i="2">${ICON.whistle}<span><b>End game now</b><small>E.g. time ran out</small></span></button>`) +
      `<button class="menu-item danger" data-i="3">${ICON.trash}<span><b>Delete game</b></span></button></div>`,
    actions: [{ value: 'edit' }, { value: 'endHalf' }, { value: 'over' }, { value: 'delete' }],
  });
  if (v === 'edit') ACTIONS.editGame();
  if (v === 'endHalf' && await confirmSheet('End this innings?', "The limit hasn't been reached yet. The other team will bat next.", 'End innings'))
    ACTIONS.endHalf();
  if (v === 'over' && await confirmSheet('End the game?', 'Innings not played are left blank on the sheet.', 'End game'))
    commit({ t: 'over' });
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
        <h4>Tee-ball in 30 seconds</h4>
        <ul>
          <li>Teams take turns to bat. Each turn is half an <b>innings</b>.</li>
          <li>The batter hits the ball off the tee and runs. If they reach a base before the ball, they're <b>safe</b>.</li>
          <li>A player who gets all the way round to home scores a <b>run</b>. Most runs wins.</li>
          <li>The batter is <b>out</b> if they miss 3 times, the ball is caught in the air, or a fielder beats them to the base.</li>
          <li>The innings ends after the limit set for the game (often 3 outs or 9 batters). Tell the umpire when that happens.</li>
        </ul>
        <h4>Scoring in this app</h4>
        <ul>
          <li>Tap what the batter did. Runners who <em>have</em> to move (because the batter needs their base) move automatically.</li>
          <li>If a runner goes further or gets out, tap them on the diamond.</li>
          <li>Every tap can be undone.</li>
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
    ${topBar({ back: 'backToScore', title: 'Sign & share' })}
    <section class="scoreboard final">
      <small>${esc(headline)}</small>
      <div class="final-score">
        <div style="--team:${a.color || COLORS[0]}"><i></i><span>${esc(a.name)}</span><b>${ra}</b></div>
        <em>–</em>
        <div style="--team:${b.color || COLORS[1]}"><b>${rb}</b><span>${esc(b.name)}</span><i></i></div>
      </div>
    </section>
    <main class="finish">
      ${state.over ? '' : `<div class="tip warn">${ICON.whistle}<p>The game isn't finished yet. You can still share the sheet so far, or end the game now.</p>
        <button class="btn small" data-action="endGame">End game</button></div>`}
      <section class="card step">
        <div class="step-head"><span class="step-n">1</span><div><b>Umpire signs</b><small>Hand the phone to the umpire to sign with a finger</small></div></div>
        <div class="sig-wrap"><canvas id="sig"></canvas><span class="sig-hint" ${game.signature ? 'hidden' : ''}>Sign here</span></div>
        <button class="btn ghost small" data-action="sigClear">Clear signature</button>
      </section>
      <section class="card step">
        <div class="step-head"><span class="step-n">2</span><div><b>Share the scoresheet</b><small>Sends a picture of the sheet to any app</small></div></div>
        <button class="btn primary big" id="share" data-action="share" disabled>${ICON.share} Share</button>
        <button class="btn ghost wide" data-action="download">${ICON.download} Save image</button>
      </section>
      <section class="card">
        <h2 class="section">Preview</h2>
        <div class="sheet-wrap"><img id="preview" alt="Scoresheet preview"></div>
      </section>
    </main>`;
  requestAnimationFrame(initSig);
  buildSheet();
}
ACTIONS.backToScore = () => go('score');
ACTIONS.finish = () => go('finish');
ACTIONS.endGame = async () => {
  if (!await confirmSheet('End the game?', 'Innings not played are left blank on the sheet.', 'End game')) return;
  game.events.push({ t: 'over' });
  save();
  renderFinish();
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
