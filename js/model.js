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
//   {t:'order', team, order, next}  batting order changed mid-game (late
//                               arrival, player left, new order). `order` is
//                               player indices; past plays are untouched.
//   {t:'rule', bats, outs}      in-game rule change, kept until changed again:
//                               bats/outs false switch off the batter/out
//                               limit (older builds: allBat, noOuts)
//   {t:'allbat'}                older builds: whole lineup bats this half only
//   {t:'end'}                   end of the half innings
//   {t:'over'}                  game ended early

export const OUT_LABEL = { K: 'Strikeout', C: 'Caught out', T: 'Out (thrown/tagged)', R: 'Out running' };

export function newGame(opts) {
  const uid = typeof crypto !== 'undefined' && crypto.randomUUID
    ? 'g-' + crypto.randomUUID().slice(0, 8)
    : 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  return {
    id: uid,
    created: Date.now(),
    updated: Date.now(),
    date: opts.date,
    venue: opts.venue || '',
    innings: opts.innings,
    maxOuts: opts.maxOuts,
    maxBatters: opts.maxBatters,
    strikeouts: opts.strikeouts !== false,
    privacyMode: Boolean(opts.privacyMode),
    teams: opts.teams.map((t) => ({
      name: t.name,
      color: t.color,
      players: [...t.players],
      start: t.start ?? t.players.length,
    })),
    // Players are sheet rows and never change index. `start` is the lineup
    // size before any mid-game additions, so replay starts from it.
    events: [],
    signature: null,
  };
}

// Batters allowed per half. 0 means "whole lineup"; never more than the
// lineup so a batter cannot need two boxes in one innings column.
export function batterLimit(game, team, s) {
  const n = s ? s.teams[team].order.length : game.teams[team].players.length;
  if (s && (!s.batsOn || s.halfAllBat)) return n;
  return game.maxBatters > 0 ? Math.min(game.maxBatters, n) : n;
}

export function replay(game) {
  const teams = game.teams.map((t) => {
    const startCount = t.start ?? t.players.length;
    return {
      order: Array.from({ length: startCount }, (_, i) => i), // batting order
      rowCount: startCount, // active sheet rows (grows only if a mid-game order event is active)
      cells: {}, // key "inning:player" -> cell
      runs: [], // runs per innings
      next: 0, // next batter index
      bats: 0, // plate appearances so far
      breaks: [], // {inning, player}: diagonal marking first batter of next innings
      last: null, // last batter
      order1: null, // batting order at the end of the 1st innings; kept after that
    };
  });
  const s = {
    teams,
    half: 0,
    outs: 0,
    batters: 0,
    batsOn: true, // batter limit applies (switched in game)
    outsOn: true, // out limit applies (switched in game)
    halfAllBat: false, // older builds: batter limit lifted for this half
    runners: [null, null, null, null], // index 1..3 -> player index
    over: false,
  };
  for (const ev of game.events) apply(game, s, ev);
  if (s.half >= game.innings * 2) s.over = true;
  return s;
}

// Sheet rows in batting order: the order kept from the 1st innings (or the
// current one until then), then anyone not in it. A player's number is
// their place here, so numbers follow the order and stay put once it's kept.
export function sheetRows(s, team) {
  const T = s.teams[team];
  const base = (T.order1 || T.order).filter((p) => p < T.rowCount);
  const rest = [];
  for (let p = 0; p < T.rowCount; p++) if (!base.includes(p)) rest.push(p);
  return [...base, ...rest];
}
export const playerNum = (s, team, p) => sheetRows(s, team).indexOf(p) + 1 || p + 1;

export const battingTeam = (s) => s.half % 2;
export const currentInning = (s) => Math.floor(s.half / 2);

function cellOf(s, team, inning, p) {
  const key = inning + ':' + p;
  if (p + 1 > s.teams[team].rowCount) s.teams[team].rowCount = p + 1;
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
    T.bats++;
    T.next = T.order.length ? T.order[(T.order.indexOf(p) + 1) % T.order.length] : p;
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
  } else if (ev.t === 'order') {
    const O = s.teams[ev.team];
    O.order = [...ev.order];
    for (const idx of ev.order) {
      if (idx + 1 > O.rowCount) O.rowCount = idx + 1;
    }
    if (ev.next != null) O.next = ev.next;
  } else if (ev.t === 'rule') {
    if ('allBat' in ev) { // older builds
      s.batsOn = !ev.allBat;
      s.outsOn = !(ev.allBat && ev.noOuts);
    } else {
      s.batsOn = ev.bats !== false;
      s.outsOn = ev.outs !== false;
    }
  } else if (ev.t === 'allbat') {
    s.halfAllBat = true;
  } else if (ev.t === 'end') {
    T.runs[inning] ||= 0;
    T.breaks.push({ inning, player: T.next });
    s.half++;
    s.outs = 0;
    s.batters = 0;
    s.halfAllBat = false;
    s.runners = [null, null, null, null];
    if (s.half === 2) for (const O of s.teams) O.order1 ||= [...O.order];
    if (s.half >= game.innings * 2) s.over = true;
  } else if (ev.t === 'over') {
    T.runs[inning] ||= 0;
    s.over = true;
  }
}

// Outs that end a half; 0 means no limit.
export const outLimit = (game, s) => (s && !s.outsOn ? 0 : game.maxOuts);

// Why the current half should end, or null.
export function halfDone(game, s) {
  const max = outLimit(game, s);
  if (max > 0 && s.outs >= max) return max + (max === 1 ? ' out' : ' outs');
  if (s.batters >= batterLimit(game, battingTeam(s), s)) return s.batters + ' players have batted';
  return null;
}

// Limits stopping the half while lineup is still to bat, as {outs, bats},
// so switching them off lets play carry on; null if none would help.
export function keepGoing(game, s) {
  if (s.over || s.batters >= s.teams[battingTeam(s)].order.length) return null;
  const max = outLimit(game, s);
  const outs = max > 0 && s.outs >= max;
  const bats = s.batters >= batterLimit(game, battingTeam(s), s);
  return outs || bats ? { outs, bats } : null;
}

export const canBat = (game, s) => !s.over && !halfDone(game, s);
export const canRun = (game, s) => !s.over && !(outLimit(game, s) > 0 && s.outs >= outLimit(game, s));

// A runner may advance to `to` only if every base on the way is empty.
export function pathClear(s, from, to) {
  for (let b = from + 1; b <= Math.min(to, 3); b++) if (s.runners[b] != null) return false;
  return true;
}

export const total = (runs) => runs.reduce((a, b) => a + (b || 0), 0);
