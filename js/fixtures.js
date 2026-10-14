// Published district fixtures. The app never assumes a team: each user picks
// theirs in the app and the choice is kept on their own phone only.

const CLUBS = {
  yangebup: { name: 'Yangebup Knights', ground: 'Aubin Grove Res', address: 'Camden Boul, Aubin Grove' },
  willetton: { name: 'Willetton Wildcats', ground: 'Willetton Res', address: 'Donald St, Willetton' },
  melville: { name: 'Melville Mariners', ground: 'Marmion Res', address: 'Marmion St, Myaree' },
  canning: { name: 'Canning Cougars', ground: 'Centenary Pk', address: 'Centenary Ave, Wilson', start: '8:15am' },
  kardinya: { name: 'Kardinya Red Sox', ground: 'Morris Buzacott Res', address: 'Williamson Rd, Kardinya' },
};

// rounds: [date, [[home, away, diamond], ...], bye]. Diamond null = not yet set.
export const DIVISIONS = [
  {
    id: 'u10-2026',
    label: 'U10s 2026/27',
    start: '8:30am',
    teams: {
      1: { name: 'Ninjas', club: 'yangebup' },
      2: { name: 'Dodgers', club: 'yangebup' },
      4: { name: 'Willetton', club: 'willetton' },
      5: { name: 'Heat', club: 'melville' },
      6: { name: 'Aces', club: 'melville' },
      // Canning's team names change weekly (Bandits, Knights, Phoenixes,
      // Blue Jays, Rockets, Thunderbolts).
      7: { name: 'Canning', club: 'canning' },
      8: { name: 'Canning', club: 'canning' },
    },
    rounds: [
      ['2026-10-17', [[4, 5, null], [6, 7, 1], [8, 1, 3]], 2],
      ['2026-10-24', [[5, 2, 2], [6, 8, 1], [7, 4, 2]], 1],
      ['2026-10-31', [[8, 5, 2], [2, 7, 1], [1, 4, 4]], 6],
      ['2026-11-07', [[4, 6, null], [2, 8, 1], [5, 1, 2]], 7],
      ['2026-11-14', [[6, 2, 1], [4, 8, null], [1, 7, 1]], 5],
      ['2026-11-21', [[2, 4, 1], [1, 6, 4], [7, 5, 3]], 8],
      ['2026-11-28', [[2, 1, 1], [6, 5, 1], [8, 7, 2]], 4],
      ['2026-12-05', [[5, 4, 2], [7, 6, 2], [1, 8, 1]], 2],
      ['2026-12-12', [[2, 5, 1], [8, 6, 3], [4, 7, null]], 1],
      ['2026-12-19', [], null, 'Christmas Round'],
      ['2027-01-29', [[6, 4, 1], [2, 8, 4], [1, 5, 1]], 7],
      ['2027-02-06', [[5, 8, 1], [7, 2, 2], [4, 1, null]], 6],
      ['2027-02-13', [[2, 6, 1], [8, 4, 8], [7, 1, 2]], 5],
      ['2027-02-20', [[4, 2, null], [6, 1, 2], [5, 7, 1]], 8],
    ],
  },
];

// Every team a user can pick, as { key, label }.
export function teamOptions() {
  return DIVISIONS.map((dv) => ({
    label: dv.label,
    teams: Object.entries(dv.teams).map(([n, t]) => ({
      key: `${dv.id}:${n}`,
      label: `${n} · ${t.name}${t.name === CLUBS[t.club].name.split(' ')[0] ? '' : ` (${CLUBS[t.club].name.split(' ')[0]})`}`,
    })),
  }));
}

function find(key) {
  const [id, n] = String(key || '').split(':');
  const dv = DIVISIONS.find((d) => d.id === id);
  return dv && dv.teams[n] ? { dv, n: +n } : null;
}

export const teamName = (key) => { const f = find(key); return f ? f.dv.teams[f.n].name : ''; };

// What the picked team has on a date: a game, a bye, a note, or null.
export function fixtureOn(key, date) {
  const f = find(key);
  if (!f) return null;
  const r = f.dv.rounds.find((x) => x[0] === date);
  if (!r) return null;
  const [, games, bye, note] = r;
  if (bye === f.n) return { date, type: 'bye' };
  const g = games.find(([h, a]) => h === f.n || a === f.n);
  if (!g) return { date, type: 'note', text: note || 'No game' };
  const [h, a, d] = g;
  const home = h === f.n;
  const opp = home ? a : h;
  const club = CLUBS[f.dv.teams[h].club];
  let opponent = f.dv.teams[opp].name;
  if (opponent === f.dv.teams[f.n].name) opponent += ` ${opp}`;
  const time = club.start || f.dv.start;
  return {
    date,
    type: 'game',
    home,
    opponent,
    ground: club.ground,
    diamond: d,
    time,
    venue: `${club.ground} · ${d ? `Diamond ${d}` : 'diamond TBC'} · ${time}`,
  };
}

// First date from `date` on with a game for the picked team.
export function nextFixture(key, date) {
  const f = find(key);
  if (!f) return null;
  for (const [d] of f.dv.rounds) {
    if (d < date) continue;
    const x = fixtureOn(key, d);
    if (x?.type === 'game') return x;
  }
  return null;
}
