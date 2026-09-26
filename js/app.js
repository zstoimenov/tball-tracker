import {
  newGame, replay, battingTeam, currentInning, halfDone, canBat, canRun,
  pathClear, batterLimit, total,
} from './model.js';
import { renderGrid, renderSheet } from './draw.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const BASE = ['Home', '1st', '2nd', '3rd', 'Home'];
const KEY = 'tball.games.v1';

// ---------- storage ----------
let games = [];
try { games = JSON.parse(localStorage.getItem(KEY)) || []; } catch { games = []; }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(games)); }
  catch { toast('Could not save on this device'); }
}

let game = null; // active game
let state = null;
let gridTeam = 0;
let gridTeamPinned = false;
let editing = false;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2600);
}

// ---------- routing ----------
const VIEWS = { home: '#home', setup: '#setup', score: '#score', finish: '#finish-view' };
function show(name) {
  for (const [k, sel] of Object.entries(VIEWS)) $(sel).hidden = k !== name;
  window.scrollTo(0, 0);
  if (name === 'home') renderHome();
  if (name === 'score') renderScore();
  if (name === 'finish') openFinish();
}
$$('[data-go]').forEach((b) => b.addEventListener('click', () => show(b.dataset.go)));

// ---------- home ----------
function renderHome() {
  const ul = $('#game-list');
  ul.innerHTML = '';
  $('#no-games').hidden = games.length > 0;
  for (const g of [...games].sort((a, b) => b.created - a.created)) {
    const s = replay(g);
    const li = document.createElement('li');
    li.innerHTML = `<div class="g-main"><div class="g-title"></div><div class="muted"></div></div><div class="g-score"></div>`;
    li.querySelector('.g-title').textContent = `${g.teams[0].name} v ${g.teams[1].name}`;
    li.querySelector('.muted').textContent = `${g.date}${g.venue ? ' · ' + g.venue : ''} · ${s.over ? 'Final' : 'In progress'}`;
    li.querySelector('.g-score').textContent = `${total(s.teams[0].runs)}–${total(s.teams[1].runs)}`;
    li.addEventListener('click', () => openGame(g.id));
    ul.appendChild(li);
  }
}

function openGame(id) {
  game = games.find((g) => g.id === id);
  gridTeamPinned = false;
  show('score');
}

// ---------- setup ----------
const form = $('#setup-form');
const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);

function syncPreset() {
  const custom = form.preset.value === 'custom';
  $('#custom-rule').hidden = !custom;
  if (!custom) {
    const [o, b] = form.preset.value.split(':');
    form.maxOuts.value = o;
    form.maxBatters.value = b;
  }
}
form.preset.addEventListener('change', syncPreset);

$('#new-game').addEventListener('click', () => {
  editing = false;
  form.reset();
  form.date.value = new Date().toLocaleDateString('en-CA');
  // Reuse the most recent lineups to save typing each week.
  const last = [...games].sort((a, b) => b.created - a.created)[0];
  if (last) {
    form.t0.value = last.teams[0].name;
    form.p0.value = last.teams[0].players.join('\n');
    form.innings.value = last.innings;
    const key = `${last.maxOuts}:${last.maxBatters}`;
    form.preset.value = [...form.preset.options].some((o) => o.value === key) ? key : 'custom';
    form.maxOuts.value = last.maxOuts;
    form.maxBatters.value = last.maxBatters;
  }
  $('#setup-title').textContent = 'New game';
  form.querySelector('[type=submit]').textContent = 'Start scoring';
  $('#delete-game').hidden = true;
  $('#setup-error').hidden = true;
  syncPreset();
  if (!last) $('#custom-rule').hidden = true;
  show('setup');
});

$('#edit-game').addEventListener('click', () => {
  editing = true;
  form.date.value = game.date;
  form.venue.value = game.venue;
  form.innings.value = game.innings;
  form.t0.value = game.teams[0].name;
  form.t1.value = game.teams[1].name;
  form.p0.value = game.teams[0].players.join('\n');
  form.p1.value = game.teams[1].players.join('\n');
  const key = `${game.maxOuts}:${game.maxBatters}`;
  form.preset.value = [...form.preset.options].some((o) => o.value === key) ? key : 'custom';
  form.maxOuts.value = game.maxOuts;
  form.maxBatters.value = game.maxBatters;
  $('#custom-rule').hidden = form.preset.value !== 'custom';
  $('#setup-title').textContent = 'Edit game';
  form.querySelector('[type=submit]').textContent = 'Save';
  $('#delete-game').hidden = false;
  $('#setup-error').hidden = true;
  show('setup');
});

$('#delete-game').addEventListener('click', () => {
  if (!confirm('Delete this game? This cannot be undone.')) return;
  games = games.filter((g) => g !== game);
  save();
  game = null;
  show('home');
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const err = (m) => { const el = $('#setup-error'); el.textContent = m; el.hidden = false; };
  const p0 = lines(form.p0.value);
  const p1 = lines(form.p1.value);
  const innings = +form.innings.value;
  if (!p0.length || !p1.length) return err('Each team needs at least one player.');
  const opts = {
    date: form.date.value,
    venue: form.venue.value.trim(),
    innings,
    maxOuts: +form.maxOuts.value,
    maxBatters: +form.maxBatters.value,
    teams: [
      { name: form.t0.value.trim(), players: p0 },
      { name: form.t1.value.trim(), players: p1 },
    ],
  };
  if (editing) {
    // Events refer to players by batting position, so an in-progress
    // lineup can be renamed or extended but not shortened.
    const s = replay(game);
    if (game.events.length && (p0.length < game.teams[0].players.length || p1.length < game.teams[1].players.length))
      return err('Players can be added or renamed once scoring has started, but not removed.');
    if (innings < Math.ceil(s.half / 2)) return err(`${Math.ceil(s.half / 2)} innings have already been played.`);
    Object.assign(game, opts);
  } else {
    game = newGame(opts);
    games.push(game);
  }
  save();
  gridTeamPinned = false;
  show('score');
});

// ---------- scoring ----------
function commit(ev) {
  game.events.push(ev);
  save();
  renderScore();
}

function playerLabel(team, p) {
  const name = game.teams[team].players[p];
  return `#${p + 1} ${name}`;
}

function renderScore() {
  state = replay(game);
  const bt = battingTeam(state);
  const inn = currentInning(state);
  if (!gridTeamPinned) gridTeam = state.over ? 0 : bt;

  $('#score-title').textContent = state.over
    ? 'Game over'
    : `Innings ${inn + 1} · ${game.teams[bt].name} batting`;

  // Scoreboard
  const sb = $('#scoreboard');
  sb.innerHTML = '';
  game.teams.forEach((t, i) => {
    const n = document.createElement('div');
    n.className = 't' + (!state.over && i === bt ? ' bat' : '');
    n.textContent = t.name;
    const r = document.createElement('div');
    r.className = 'r';
    r.textContent = total(state.teams[i].runs);
    sb.append(n, r);
  });

  // Status line
  const limit = batterLimit(game, bt);
  $('#status').innerHTML = state.over ? '' :
    `<span>Outs <b>${state.outs}${game.maxOuts ? ' / ' + game.maxOuts : ''}</b></span>` +
    `<span>Batted <b>${state.batters} / ${limit}</b></span>` +
    `<span>Runs this innings <b>${state.teams[bt].runs[inn] || 0}</b></span>`;

  // Umpire banner
  const done = halfDone(game, state);
  const banner = $('#umpire');
  if (state.over) {
    banner.hidden = false;
    banner.textContent = 'Game over - get the umpire to sign, then share the sheet.';
  } else if (done) {
    banner.hidden = false;
    banner.textContent = `${done} - tell the umpire. Move any runners, then end the innings.`;
  } else {
    banner.hidden = true;
  }

  // Batting panel
  const batOk = canBat(game, state);
  $('#batting-panel').hidden = state.over;
  $('#batter-name').textContent = playerLabel(bt, state.teams[bt].next);
  $$('[data-bat]').forEach((b) => (b.disabled = !batOk));

  renderRunners(bt);

  $('#undo').disabled = game.events.length === 0;
  const endBtn = $('#end-half');
  endBtn.disabled = state.over;
  endBtn.classList.toggle('hot', !!done);
  $('#finish').classList.toggle('hot', state.over);

  // Grid
  const tabs = $('#grid-tabs');
  tabs.innerHTML = '';
  game.teams.forEach((t, i) => {
    const b = document.createElement('button');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(i === gridTeam));
    b.textContent = t.name;
    b.addEventListener('click', () => { gridTeam = i; gridTeamPinned = true; renderScore(); });
    tabs.appendChild(b);
  });
  const hi = !state.over && gridTeam === bt && batOk
    ? { inning: inn, player: state.teams[bt].next } : null;
  renderGrid($('#grid'), game, state, gridTeam, hi);
}

function renderRunners(bt) {
  const box = $('#runners');
  box.innerHTML = '';
  if (state.over) return;
  const runOk = canRun(game, state);
  for (let base = 3; base >= 1; base--) {
    const p = state.runners[base];
    if (p == null) continue;
    const row = document.createElement('div');
    row.className = 'runner';
    const who = document.createElement('div');
    who.className = 'who';
    who.innerHTML = `On <b>${BASE[base]}</b>: `;
    who.append(playerLabel(bt, p));
    row.appendChild(who);
    for (let to = base + 1; to <= 4; to++) {
      const b = document.createElement('button');
      b.className = 'btn safe';
      b.textContent = to === 4 ? 'Home ✓' : `→ ${BASE[to]}`;
      b.disabled = !runOk || !pathClear(state, base, to);
      b.addEventListener('click', () => commit({ t: 'adv', p, to }));
      row.appendChild(b);
    }
    const o = document.createElement('button');
    o.className = 'btn out';
    o.textContent = 'Out';
    o.disabled = !runOk;
    o.addEventListener('click', () => commit({ t: 'rout', p }));
    row.appendChild(o);
    box.appendChild(row);
  }
}

$$('[data-bat]').forEach((b) =>
  b.addEventListener('click', () => {
    const r = b.dataset.bat;
    commit({ t: 'bat', r: /\d/.test(r) ? +r : r });
  }),
);

$('#undo').addEventListener('click', () => {
  game.events.pop();
  save();
  renderScore();
  toast('Undone');
});

$('#end-half').addEventListener('click', () => {
  if (!halfDone(game, state) && !confirm('The innings limit has not been reached. End this innings anyway?')) return;
  gridTeamPinned = false;
  commit({ t: 'end' });
  if (state.over) toast('Game over');
  else toast(`Innings ${currentInning(state) + 1}: ${game.teams[battingTeam(state)].name} batting`);
});

$('#finish').addEventListener('click', () => show('finish'));

// ---------- finish, sign and share ----------
const sig = $('#sig');
let sigCtx = null;
let sheetFile = null;
let sheetUrl = null;

function fileName() {
  const safe = (s) => s.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '');
  return `teeball-${game.date}-${safe(game.teams[0].name)}-v-${safe(game.teams[1].name)}.png`;
}

function sizeSig() {
  const r = sig.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  sig.width = r.width * dpr;
  sig.height = r.height * dpr;
  sigCtx = sig.getContext('2d');
  sigCtx.scale(dpr, dpr);
  sigCtx.lineWidth = 2.2;
  sigCtx.lineCap = 'round';
  sigCtx.lineJoin = 'round';
  sigCtx.strokeStyle = '#111';
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
}

let drawing = false;
let sigDirty = false;
sig.addEventListener('pointerdown', (e) => {
  drawing = true;
  sig.setPointerCapture(e.pointerId);
  sigCtx.beginPath();
  sigCtx.moveTo(e.offsetX, e.offsetY);
});
sig.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  sigCtx.lineTo(e.offsetX, e.offsetY);
  sigCtx.stroke();
  sigDirty = true;
});
const endStroke = () => {
  if (!drawing) return;
  drawing = false;
  if (sigDirty) {
    game.signature = trimmedSignature();
    save();
    buildSheet();
  }
};
sig.addEventListener('pointerup', endStroke);
sig.addEventListener('pointercancel', endStroke);

// Crop the signature to its ink so it sits neatly on the sheet.
function trimmedSignature() {
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

$('#sig-clear').addEventListener('click', () => {
  game.signature = null;
  sigDirty = false;
  save();
  sizeSig();
  buildSheet();
});

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
  $('#share').disabled = true;
  const s = replay(game);
  const canvas = renderSheet(game, s, await loadImage(game.signature));
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  sheetFile = new File([blob], fileName(), { type: 'image/png' });
  if (sheetUrl) URL.revokeObjectURL(sheetUrl);
  sheetUrl = URL.createObjectURL(blob);
  $('#preview').src = sheetUrl;
  $('#share').disabled = false;
}

function openFinish() {
  const s = replay(game);
  const [a, b] = game.teams;
  $('#final-score').textContent = `${a.name} ${total(s.teams[0].runs)} – ${total(s.teams[1].runs)} ${b.name}`;
  $('#not-over').hidden = s.over;
  sigDirty = false;
  requestAnimationFrame(sizeSig);
  buildSheet();
}

$('#end-game').addEventListener('click', () => {
  if (!confirm('End the game now? Innings not played will be left blank.')) return;
  game.events.push({ t: 'over' });
  save();
  openFinish();
});

function download() {
  const a = document.createElement('a');
  a.href = sheetUrl;
  a.download = sheetFile.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

$('#share').addEventListener('click', async () => {
  if (!sheetFile) return;
  const data = {
    files: [sheetFile],
    title: 'Tee-ball scoresheet',
    text: $('#final-score').textContent,
  };
  if (navigator.canShare && navigator.canShare({ files: data.files })) {
    try {
      await navigator.share(data);
    } catch (e) {
      if (e.name !== 'AbortError') toast('Sharing failed - saving the image instead');
      if (e.name !== 'AbortError') download();
    }
  } else {
    toast('Sharing is not supported here - saving the image');
    download();
  }
});

$('#download').addEventListener('click', () => sheetFile && download());

// ---------- boot ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
show('home');
