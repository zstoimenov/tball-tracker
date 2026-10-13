# Tee-ball Tracker

A phone-first web app (installable PWA) for scoring tee-ball games with the
classic paper scoresheet method, then sharing the finished sheet as a PNG
through the phone's share sheet.

## For first-time scorers
- 3-card intro on first launch, a Help sheet with a 30-second rules explainer
  and a key to every symbol on the sheet, plus coach tips while scoring.
- 3-step setup: teams (with colours), players (names optional, unnamed players
  are shown by number), rules (innings count and when an innings ends).
- Guided scoring: tap what the batter did, then a list shows everyone on base.
  Tap where each one ended up (Stayed, a base, Home or Out) and Confirm. Nothing
  is guessed: impossible bases are hidden, Confirm waits until every runner is
  placed, the diamond previews the moves, and Undo takes back the whole play. Later moves (steals, overthrows) by tapping a runner on the diamond.
- Runs this innings shown live on the scoreboard.
- Catches mistakes on the spot: impossible plays are blocked with the reason
  (too many outs, two runners on a base), doubtful ones get an amber check
  (runs on the play that makes the last out), every saved play is repeated in
  a banner with Undo, and double taps are ignored.
- "Not Sam?" picks the real batter when a child bats out of order.
- Lineup (Score screen): add a late arrival, mark a player who left, or fix the
  order from the next batter on. Saved as one undoable step; recorded plays keep
  their players, and nobody is called twice in an innings.
- Innings over shows who scored and who was out, to check with the umpire.
- "Play another innings" at the end, so the length needn't be fixed up front.
- Three tabs: Score, Sheet (the paper sheet, fitted to the phone width) and Share.
- "Innings over, tell the umpire" prompts at the configured limit.

## Scoresheet
Both teams' grids (stacked, portrait) drawn like the paper sheet: dots for bases reached, arcs
for several bases on one hit, filled circle for a run, out number in the
centre circle, strike marks for strikeouts, diagonal line for who bats first
next innings, and innings runs with a running total. The umpire signs on the
phone and the sheet is shared as a PNG (falls back to download).

## Data safety and offline
- Saved after every tap to localStorage and IndexedDB, with a rolling previous
  copy; either store can rebuild the other.
- Asks the browser for persistent storage.
- Back up all games to a JSON file and restore from it (home screen > ⋯).
- Service worker caches the whole app, so it works with no signal.

## Install
Android / desktop Chrome: tap **Install** on the home screen card.
iPhone: Safari > Share > **Add to Home Screen** (the app shows these steps).

## Run locally
Any static server, e.g. `npx serve .` then open http://localhost:3000.

## Deploy
`.github/workflows/pages.yml` publishes to GitHub Pages on every push to
`main`. Set **Settings > Pages > Source** to **GitHub Actions**.
