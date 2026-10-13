// Game model. A game is its setup plus an append-only event log; the full
// state is rebuilt by replaying the log, which makes undo a simple pop.
//
// Bases: 0 = home plate (batting), 1 = 1st, 2 = 2nd, 3 = 3rd, 4 = scored.
// Events:
//   {t:'bat', r:1|2|3|4, p?}    batter reaches base r (4 = home run). `p` names
//                               the batter when not the next in order
//                               (batting out of order); order goes on after them.
//   {t:'bat', r:'K'|'C'|'T'}    batter out: strikeout, caught, thrown/tagged
//   {t:'adv', p, to}            runner (player index p) advances to base `to`
//   {t:'rout', p, at?}          runner p put out on the bases, at base `at`
//                               (bases before it count as reached)
//   {t:'lineup'}                live lineup complete: #1 is up again
//   {t:'end'}                   end of the half innings
//   {t:'over'}                  game ended early

export const OUT_LABEL = { K: 'Strikeout', C: 'Caught out', T: 'Out (thrown/tagged)', R: 'Out running' };

export function newGame(opts) {
  return {
    id: 'g' + Date.now().toString(36),
    created: Date.now(),
    date: opts.date,
    venue: opts.venue || '',
    innings: opts.innings,
    maxOuts: opts.maxOuts,
    maxBatters: opts.maxBatters,
    strikeouts: opts.strikeouts !== false,
    teams: opts.teams, // [{name, players:[names], live?}], teams[0] bats first
    // live: the batting order is built as players come up to bat for the
    // first time, until a {t:'lineup'} event says #1 is up again.
    events: [],
    signature: null,
  };
}

// Players in the lineup, or null while a live lineup is still being built.
export function lineupSize(game, s, team) {
  return game.teams[team].live ? s.teams[team].size : game.teams[team].players.length;
}
export const lineupOpen = (game, s, team) => lineupSize(game, s, team) == null;

// Batters allowed per half. 0 means "whole lineup"; never more than the
// lineup so a batter cannot need two boxes in one innings column. An open
// live lineup has no known size yet.
export function batterLimit(game, team, s) {
  const n = (s ? lineupSize(game, s, team) : game.teams[team].players.length) ?? Infinity;
  return game.maxBatters > 0 ? Math.min(game.maxBatters, n) : n;
}

export function replay(game) {
  const teams = game.teams.map((t) => ({
    cells: {}, // key "inning:player" -> cell
    runs: [], // runs per innings
    next: 0, // next batter index
    bats: 0, // plate appearances so far
    breaks: [], // {inning, player}: diagonal marking first batter of next innings
    seen: 0, // batting positions used so far (highest + 1)
    size: null, // live lineup size once complete
    last: null, // last batter
  }));
  const s = {
    teams,
    half: 0,
    outs: 0,
    batters: 0,
    runners: [null, null, null, null], // index 1..3 -> player index
    over: false,
  };
  for (const ev of game.events) apply(game, s, ev);
  if (s.half >= game.innings * 2) s.over = true;
  return s;
}

export const battingTeam = (s) => s.half % 2;
export const currentInning = (s) => Math.floor(s.half / 2);

function cellOf(s, team, inning, p) {
  const key = inning + ':' + p;
  return (s.teams[team].cells[key] ||= { segs: [], scored: false, out: 0, how: null });
}

function addRun(s, team, inning) {
  const runs = s.teams[team].runs;
  runs[inning] = (runs[inning] || 0) + 1;
}

function move(s, team, inning, p, from, to) {
  const c = cellOf(s, team, inning, p);
  c.segs.push({ from, to });
  if (from > 0) s.runners[from] = null;
  if (to >= 4) {
    c.scored = true;
    addRun(s, team, inning);
  } else {
    s.runners[to] = p;
  }
}

function recordOut(s, team, inning, p, how) {
  s.outs++;
  const c = cellOf(s, team, inning, p);
  c.out = s.outs;
  c.how = how;
}

// Runners pushed ahead when the batter reaches base `r`, as [player, from, to],
// trailing runner first.
export function forcedMoves(s, r) {
  const forced = [];
  let need = r;
  for (let b = 1; b <= 3; b++) {
    const p = s.runners[b];
    if (p == null) continue;
    if (b <= need) {
      need = Math.min(need + 1, 4);
      forced.push([p, b, need]);
    } else {
      need = b;
    }
  }
  return forced;
}

function apply(game, s, ev) {
  if (s.over) return;
  const team = battingTeam(s);
  const inning = currentInning(s);
  const T = s.teams[team];

  if (ev.t === 'bat') {
    const p = ev.p ?? T.next;
    const n = lineupSize(game, s, team);
    T.bats++;
    T.next = n ? (p + 1) % n : p + 1;
    T.seen = Math.max(T.seen, p + 1);
    T.last = p;
    s.batters++;
    cellOf(s, team, inning, p);
    if (typeof ev.r === 'number') {
      // Runners the batter passes or lands on are forced ahead of them.
      // Targets are worked out trailing runner first, then applied lead
      // runner first so nobody lands on a base that is still occupied.
      for (const [r, from, to] of forcedMoves(s, ev.r).reverse()) move(s, team, inning, r, from, to);
      move(s, team, inning, p, 0, ev.r);
    } else {
      recordOut(s, team, inning, p, ev.r);
    }
  } else if (ev.t === 'adv') {
    const from = s.runners.indexOf(ev.p);
    if (from > 0) move(s, team, inning, ev.p, from, ev.to);
  } else if (ev.t === 'rout') {
    const from = s.runners.indexOf(ev.p);
    if (from > 0) {
      s.runners[from] = null;
      // Bases passed safely before the out are dots on the sheet. They are
      // drawn straight onto the cell; the runner is off the field already.
      const c = cellOf(s, team, inning, ev.p);
      for (let b = from; b < Math.min(ev.at || 0, 4) - 1; b++) c.segs.push({ from: b, to: b + 1 });
      recordOut(s, team, inning, ev.p, 'R');
    }
  } else if (ev.t === 'lineup') {
    if (game.teams[team].live && T.size == null) {
      T.size = T.seen;
      T.next = 0;
    }
  } else if (ev.t === 'end') {
    T.runs[inning] ||= 0;
    T.breaks.push({ inning, player: T.next });
    s.half++;
    s.outs = 0;
    s.batters = 0;
    s.runners = [null, null, null, null];
    if (s.half >= game.innings * 2) s.over = true;
  } else if (ev.t === 'over') {
    T.runs[inning] ||= 0;
    s.over = true;
  }
}

// Why the current half should end, or null.
export function halfDone(game, s) {
  if (game.maxOuts > 0 && s.outs >= game.maxOuts) return game.maxOuts + (game.maxOuts === 1 ? ' out' : ' outs');
  if (s.batters >= batterLimit(game, battingTeam(s), s)) return s.batters + ' players have batted';
  return null;
}

export const canBat = (game, s) => !s.over && !halfDone(game, s);
export const canRun = (game, s) => !s.over && !(game.maxOuts > 0 && s.outs >= game.maxOuts);

// A runner may advance to `to` only if every base on the way is empty.
export function pathClear(s, from, to) {
  for (let b = from + 1; b <= Math.min(to, 3); b++) if (s.runners[b] != null) return false;
  return true;
}

export const total = (runs) => runs.reduce((a, b) => a + (b || 0), 0);
