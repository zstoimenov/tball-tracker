// Game model. A game is its setup plus an append-only event log; the full
// state is rebuilt by replaying the log, which makes undo a simple pop.
//
// Bases: 0 = home plate (batting), 1 = 1st, 2 = 2nd, 3 = 3rd, 4 = scored.
// Events:
//   {t:'bat', r:1|2|3|4}        batter reaches base r (4 = home run)
//   {t:'bat', r:'K'|'C'|'T'}    batter out: strikeout, caught, thrown/tagged
//   {t:'adv', p, to}            runner (player index p) advances to base `to`
//   {t:'rout', p}               runner p put out on the bases
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
    teams: opts.teams, // [{name, players:[names]}], teams[0] bats first
    events: [],
    signature: null,
  };
}

// Batters allowed per half. 0 means "whole lineup"; never more than the
// lineup so a batter cannot need two boxes in one innings column.
export function batterLimit(game, team) {
  const n = game.teams[team].players.length;
  return game.maxBatters > 0 ? Math.min(game.maxBatters, n) : n;
}

export function replay(game) {
  const teams = game.teams.map((t) => ({
    cells: {}, // key "inning:player" -> cell
    runs: [], // runs per innings
    next: 0, // next batter index
    breaks: [], // {inning, player}: diagonal marking first batter of next innings
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

function apply(game, s, ev) {
  if (s.over) return;
  const team = battingTeam(s);
  const inning = currentInning(s);
  const T = s.teams[team];

  if (ev.t === 'bat') {
    const p = T.next;
    T.next = (T.next + 1) % game.teams[team].players.length;
    s.batters++;
    cellOf(s, team, inning, p);
    if (typeof ev.r === 'number') {
      // Runners the batter passes or lands on are forced ahead of them.
      // Targets are worked out trailing runner first, then applied lead
      // runner first so nobody lands on a base that is still occupied.
      const forced = [];
      let need = ev.r;
      for (let b = 1; b <= 3; b++) {
        const r = s.runners[b];
        if (r == null) continue;
        if (b <= need) {
          need = Math.min(need + 1, 4);
          forced.push([r, b, need]);
        } else {
          need = b;
        }
      }
      for (const [r, from, to] of forced.reverse()) move(s, team, inning, r, from, to);
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
      recordOut(s, team, inning, ev.p, 'R');
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
  if (s.batters >= batterLimit(game, battingTeam(s))) return s.batters + ' players have batted';
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
