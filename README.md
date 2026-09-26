# Tee-ball Tracker

A phone-friendly web app for scoring tee-ball games with the classic paper
scoresheet method, then sharing the finished sheet as a PNG through the
phone's share sheet.

## Features
- Both teams' batting grids, drawn like the paper sheet: dots for bases
  reached, arcs with arrows for several bases on one hit, a filled circle
  for a run, the out number in the centre circle, strike marks for strikeouts.
- Innings end rule set per game (3 outs or 9 batters, 3 outs only, whole team, or custom),
  with a "tell the umpire" alert.
- Forced runners advance automatically; other runner moves are one tap.
- Diagonal line marking who bats first next innings, and per-innings runs with a running total.
- Undo, games saved on the device, works offline, can be installed to the home screen.
- Umpire signature pad and PNG export through the Web Share API (falls back to download).

## Run locally
Any static server, e.g. `npx serve .` then open http://localhost:3000.

## Deploy
`.github/workflows/pages.yml` publishes the site to GitHub Pages on each push
to `main` (and the development branch). Set **Settings > Pages > Source** to
**GitHub Actions**.
