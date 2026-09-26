# Tee-ball Tracker

A phone-first web app (installable PWA) for scoring tee-ball games with the
classic paper scoresheet method, then sharing the finished sheet as a PNG
through the phone's share sheet.

## For first-time scorers
- 3-card intro on first launch, a Help sheet with a 30-second rules explainer
  and a key to every symbol on the sheet, plus coach tips while scoring.
- 3-step setup: teams (with colours), players (names optional, unnamed players
  are shown by number), rules (innings count and when an innings ends).
- Guided scoring: tap what the batter did, then move any runners by tapping them
  on the diamond. Forced runners move automatically. Every tap can be undone.
- "Innings over, tell the umpire" prompts at the configured limit.

## Scoresheet
Both teams' grids drawn like the paper sheet: dots for bases reached, arcs
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
