// Canvas renderer for the paper-style scoresheet. Used for the live grid and
// for the exported PNG, so both always match.

import { total } from './model.js';

const INK = '#111';
const GRID = '#222';
const FAINT = '#9a9a9a';
const FONT = 'Helvetica, Arial, sans-serif';

export const L = { S: 56, num: 34, name: 116, title: 30, head: 22 };

export function gridSize(game, team) {
  const rows = game.teams[team].players.length;
  return {
    w: L.num + L.name + game.innings * L.S + 14, // room for break-line overhang
    h: L.title + L.head * 2 + rows * L.S + L.S,
  };
}

// Base positions on the cell's inner circle track. Angle decreases as the
// runner goes home -> 1st (right) -> 2nd (top) -> 3rd (left) -> home.
const angle = (base) => Math.PI / 2 - base * (Math.PI / 2);

function drawCell(ctx, x, y, S, cell, hi) {
  const cx = x + S / 2;
  const cy = y + S / 2;
  const r = S * 0.3;
  const cr = S * 0.12;

  if (hi) {
    ctx.fillStyle = '#fff4b8';
    ctx.fillRect(x, y, S, S);
  }
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = FAINT;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + S, y + S);
  ctx.moveTo(x + S, y); ctx.lineTo(x, y + S);
  ctx.stroke();

  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 1.6;

  for (const seg of cell?.segs || []) {
    if (seg.to - seg.from === 1) {
      const a = angle(seg.to);
      ctx.beginPath();
      ctx.arc(cx + r * Math.cos(a), cy + r * Math.sin(a), S * 0.045, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const a0 = angle(seg.from);
      const a1 = angle(seg.to);
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0, a1, true);
      ctx.stroke();
      // Arrowhead pointing along the direction of travel at the end.
      const px = cx + r * Math.cos(a1);
      const py = cy + r * Math.sin(a1);
      const dx = Math.sin(a1);
      const dy = -Math.cos(a1);
      const h = S * 0.1;
      ctx.beginPath();
      ctx.moveTo(px + dx * h * 0.6, py + dy * h * 0.6);
      ctx.lineTo(px - dx * h * 0.6 - dy * h * 0.5, py - dy * h * 0.6 + dx * h * 0.5);
      ctx.lineTo(px - dx * h * 0.6 + dy * h * 0.5, py - dy * h * 0.6 - dx * h * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Centre circle: filled when the player scored, out number when out.
  ctx.beginPath();
  ctx.arc(cx, cy, cr, 0, Math.PI * 2);
  ctx.fillStyle = cell?.scored ? INK : hi ? '#fff4b8' : '#fff';
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.stroke();

  if (cell?.out) {
    ctx.fillStyle = INK;
    ctx.font = `bold ${Math.round(S * 0.17)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(cell.out), cx, cy + 1);
  }
  if (cell?.how === 'K') {
    // Three strike marks with a line through them.
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    const bx = x + S * 0.62;
    const by = y + S * 0.72;
    for (let i = 0; i < 3; i++) {
      ctx.moveTo(bx + i * S * 0.07, by + S * 0.08);
      ctx.lineTo(bx + i * S * 0.07 + S * 0.05, by - S * 0.08);
    }
    ctx.moveTo(bx - S * 0.03, by + S * 0.02);
    ctx.lineTo(bx + S * 0.22, by - S * 0.04);
    ctx.stroke();
  }
}

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
  return text + '…';
}

// Draws one team's batting grid at (x, y). `hi` = {inning, player} to highlight.
export function drawGrid(ctx, x, y, game, state, team, hi) {
  const { S } = L;
  const T = game.teams[team];
  const TS = state.teams[team];
  const n = T.players.length;
  const gx = x + L.num + L.name; // first innings column
  const top = y + L.title;
  const rowsTop = top + L.head * 2;
  const W = L.num + L.name + game.innings * S;

  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.font = `bold 17px ${FONT}`;
  ctx.fillText(fitText(ctx, T.name, W - 60), x, y + L.title / 2 - 2);
  ctx.textAlign = 'right';
  ctx.fillText(String(total(TS.runs)), x + W, y + L.title / 2 - 2);

  // Header
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.font = `12px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.strokeRect(gx, top, game.innings * S, L.head);
  ctx.fillText('INNING', gx + (game.innings * S) / 2, top + L.head / 2);
  ctx.strokeRect(x, top + L.head, L.num, L.head);
  ctx.fillText('#', x + L.num / 2, top + L.head * 1.5);
  ctx.strokeRect(x + L.num, top + L.head, L.name, L.head);
  ctx.fillText('Batter', x + L.num + L.name / 2, top + L.head * 1.5);
  for (let i = 0; i < game.innings; i++) {
    ctx.strokeRect(gx + i * S, top + L.head, S, L.head);
    ctx.fillText(String(i + 1), gx + i * S + S / 2, top + L.head * 1.5);
  }

  // Batter rows
  for (let p = 0; p < n; p++) {
    const ry = rowsTop + p * S;
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, ry, L.num, S);
    ctx.strokeRect(x + L.num, ry, L.name, S);
    ctx.fillStyle = INK;
    ctx.font = `13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(p + 1), x + L.num / 2, ry + S / 2);
    ctx.textAlign = 'left';
    ctx.fillText(fitText(ctx, T.players[p] || '', L.name - 10), x + L.num + 6, ry + S / 2);
    for (let i = 0; i < game.innings; i++) {
      const cx = gx + i * S;
      const on = hi && hi.inning === i && hi.player === p;
      drawCell(ctx, cx, ry, S, TS.cells[i + ':' + p], on);
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx, ry, S, S);
    }
  }

  // Lines marking who bats first in the next innings.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  for (const b of TS.breaks) {
    if (b.inning >= game.innings) continue;
    const bx = gx + b.inning * S;
    const by = rowsTop + b.player * S;
    ctx.beginPath();
    if (!TS.cells[b.inning + ':' + b.player]) {
      ctx.moveTo(bx, by + S);
      ctx.lineTo(bx + S + 12, by - 4);
    } else {
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + S + 12, by);
    }
    ctx.stroke();
  }

  // Totals: innings runs top-left, running total bottom-right.
  const ty = rowsTop + n * S;
  let run = 0;
  ctx.lineWidth = 1;
  for (let i = 0; i < game.innings; i++) {
    const bx = gx + i * S;
    ctx.strokeStyle = GRID;
    ctx.strokeRect(bx, ty, S, S);
    ctx.beginPath();
    ctx.moveTo(bx, ty + S);
    ctx.lineTo(bx + S, ty);
    ctx.stroke();
    if (TS.runs[i] != null) {
      run += TS.runs[i];
      ctx.fillStyle = INK;
      ctx.font = `bold 16px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(String(TS.runs[i]), bx + S * 0.28, ty + S * 0.3);
      ctx.fillText(String(run), bx + S * 0.7, ty + S * 0.72);
    }
  }
  ctx.fillStyle = INK;
  ctx.font = `12px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('Runs / Total', gx - 8, ty + S / 2);
}

// Renders the canvas for the live grid of one team at device resolution.
export function renderGrid(canvas, game, state, team, hi) {
  const { w, h } = gridSize(game, team);
  const dpr = Math.max(2, window.devicePixelRatio || 1);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.aspectRatio = `${w} / ${h}`;
  canvas.dataset.w = w;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  drawGrid(ctx, 0, 0, game, state, team, hi);
}

function fmtDate(d) {
  try {
    return new Date(d + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return d;
  }
}

// Full exported sheet: header, both grids side by side, umpire signature.
export function renderSheet(game, state, sigImg) {
  const M = 32;
  const gap = 44;
  const a = gridSize(game, 0);
  const b = gridSize(game, 1);
  const headH = 96;
  const footH = 120;
  const W = M * 2 + a.w + gap + b.w;
  const H = M + headH + Math.max(a.h, b.h) + footH + M;
  const scale = 2;
  const c = document.createElement('canvas');
  c.width = W * scale;
  c.height = H * scale;
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  const t0 = game.teams[0].name;
  const t1 = game.teams[1].name;
  const r0 = total(state.teams[0].runs);
  const r1 = total(state.teams[1].runs);

  ctx.fillStyle = INK;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `bold 24px ${FONT}`;
  ctx.fillText('Tee-ball scoresheet', M, M + 24);
  ctx.font = `15px ${FONT}`;
  ctx.fillText([fmtDate(game.date), game.venue].filter(Boolean).join('  ·  '), M, M + 48);
  ctx.font = `bold 20px ${FONT}`;
  ctx.fillText(`${t0} ${r0}  –  ${r1} ${t1}`, M, M + 78);
  ctx.textAlign = 'right';
  ctx.font = `13px ${FONT}`;
  const played = Math.ceil(Math.min(state.half, game.innings * 2) / 2) || 1;
  ctx.fillText(state.over ? `Final · ${played} innings` : 'In progress', W - M, M + 24);

  const gy = M + headH;
  drawGrid(ctx, M, gy, game, state, 0);
  drawGrid(ctx, M + a.w + gap, gy, game, state, 1);

  const fy = gy + Math.max(a.h, b.h) + 24;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  ctx.font = `14px ${FONT}`;
  ctx.fillText('Umpire signature:', M, fy + 60);
  const sx = M + 130;
  if (sigImg) {
    const ratio = sigImg.width / sigImg.height;
    const sh = 80;
    ctx.drawImage(sigImg, sx, fy, Math.min(sh * ratio, 320), sh);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx, fy + 64);
  ctx.lineTo(sx + 320, fy + 64);
  ctx.stroke();
  ctx.textAlign = 'right';
  ctx.fillStyle = '#666';
  ctx.font = `11px ${FONT}`;
  ctx.fillText('Dot: reached base · Arc: ran several bases · Filled circle: scored · Number: out · Strike marks: strikeout', W - M, fy + 100);
  return c;
}
