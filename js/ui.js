// Small UI toolkit: icons, escaping, bottom sheets, toasts, haptics.

const svg = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const ICON = {
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>'),
  more: svg('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  sheet: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>'),
  flag: svg('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
  share: svg('<path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M20 14v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5"/>'),
  download: svg('<path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M4 19h16"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  up: svg('<path d="M6 15l6-6 6 6"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
  chevron: svg('<path d="M9 6l6 6-6 6"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  swap: svg('<path d="M7 4v16M3 8l4-4 4 4M17 20V4M21 16l-4 4-4-4"/>'),
  whistle: svg('<circle cx="9" cy="14" r="5"/><path d="M13 11l8-3v4l-6 2"/>'),
  check: svg('<path d="M5 12l5 5 9-10"/>'),
  bulb: svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>'),
  phone: svg('<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>'),
  shield: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
  upload: svg('<path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M4 19h16"/>'),
  grip: svg('<circle cx="9" cy="6" r="1.3" fill="currentColor"/><circle cx="15" cy="6" r="1.3" fill="currentColor"/><circle cx="9" cy="12" r="1.3" fill="currentColor"/><circle cx="15" cy="12" r="1.3" fill="currentColor"/><circle cx="9" cy="18" r="1.3" fill="currentColor"/><circle cx="15" cy="18" r="1.3" fill="currentColor"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  zoom: svg('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M11 8v6M8 11h6"/>'),
  ball: svg('<circle cx="12" cy="12" r="9"/><path d="M6 5.5c2 2 2.5 4 2.5 6.5S8 16.5 6 18.5M18 5.5c-2 2-2.5 4-2.5 6.5s.5 4.5 2.5 6.5"/>'),
};

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const buzz = (ms = 12) => { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } };

// Bottom sheet. Resolves with the chosen action's value, or null if dismissed.
export function sheet({ title, body = '', actions = [], onOpen }) {
  return new Promise((resolve) => {
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.innerHTML = `
      <div class="bsheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="grab"></div>
        <div class="bsheet-head"><h3>${esc(title)}</h3>
          <button class="icon-btn" data-close aria-label="Close">${ICON.x}</button></div>
        <div class="bsheet-body">${body}</div>
        ${actions.some((a) => a.label) ? `<div class="bsheet-acts">${actions
          .map((a, i) => (a.label ? `<button class="btn ${a.kind || ''}" data-i="${i}">${esc(a.label)}</button>` : ''))
          .join('')}</div>` : ''}
      </div>`;
    const close = (v) => {
      scrim.classList.add('closing');
      setTimeout(() => scrim.remove(), 180);
      resolve(v);
    };
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim || e.target.closest('[data-close]')) return close(null);
      const b = e.target.closest('[data-i]');
      if (b) close(actions[+b.dataset.i].value);
    });
    document.body.appendChild(scrim);
    onOpen?.(scrim.querySelector('.bsheet'), close);
  });
}

export const confirmSheet = (title, text, ok, kind = 'primary') =>
  sheet({
    title,
    body: `<p class="sheet-text">${esc(text)}</p>`,
    actions: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: ok, value: true, kind }],
  }).then(Boolean);

let toastTimer;
export function toast(msg, action) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { t.classList.remove('show'); action.run(); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 4000 : 2400);
}

// Full-screen image viewer with pinch, double-tap, wheel and button zoom.
export function viewer(src, label = 'Scoresheet') {
  const el = document.createElement('div');
  el.className = 'viewer';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', label);
  el.innerHTML = `
    <div class="viewer-stage"><img alt="${esc(label)}" draggable="false"></div>
    <div class="viewer-bar">
      <button class="icon-btn" data-v="close" aria-label="Close">${ICON.x}</button>
      <span>${esc(label)}</span>
      <button class="icon-btn" data-v="out" aria-label="Zoom out">−</button>
      <button class="icon-btn" data-v="in" aria-label="Zoom in">+</button>
    </div>
    <p class="viewer-hint">Pinch or double-tap to zoom</p>`;
  const stage = el.querySelector('.viewer-stage');
  const img = el.querySelector('img');
  const MAX = 5;
  let W, H, bw, bh; // stage size and image size at scale 1 (fit whole)
  let s = 1, x = 0, y = 0;

  const clamp = () => {
    const w = bw * s, h = bh * s;
    x = w <= W ? (W - w) / 2 : Math.min(0, Math.max(W - w, x));
    y = h <= H ? (H - h) / 2 : Math.min(0, Math.max(H - h, y));
  };
  const apply = () => { clamp(); img.style.transform = `translate(${x}px, ${y}px) scale(${s})`; };
  // Zoom to scale n keeping the stage point (cx, cy) fixed.
  const zoomAt = (n, cx, cy) => {
    n = Math.max(1, Math.min(MAX, n));
    x = cx - ((cx - x) * n) / s;
    y = cy - ((cy - y) * n) / s;
    s = n;
    apply();
  };
  const layout = () => {
    W = stage.clientWidth;
    H = stage.clientHeight;
    const k = Math.min(W / img.naturalWidth, H / img.naturalHeight);
    bw = img.naturalWidth * k;
    bh = img.naturalHeight * k;
    img.style.width = bw + 'px';
    img.style.height = bh + 'px';
    apply();
  };
  img.onload = layout;
  img.src = src;

  const pts = new Map();
  let start = null;
  let lastTap = 0;
  const pos = (e) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const begin = () => {
    const p = [...pts.values()];
    if (p.length >= 2) {
      start = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), m: { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }, s, x, y };
    } else if (p.length === 1) {
      start = { p: p[0], x, y, moved: false };
    } else start = null;
  };
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, pos(e));
    begin();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !start) return;
    pts.set(e.pointerId, pos(e));
    const p = [...pts.values()];
    if (p.length >= 2 && start.d) {
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const m = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
      const n = Math.max(1, Math.min(MAX, (start.s * d) / start.d));
      x = m.x - ((start.m.x - start.x) * n) / start.s;
      y = m.y - ((start.m.y - start.y) * n) / start.s;
      s = n;
      apply();
    } else if (p.length === 1 && start.p) {
      const dx = p[0].x - start.p.x, dy = p[0].y - start.p.y;
      if (Math.hypot(dx, dy) > 6) start.moved = true;
      x = start.x + dx;
      y = start.y + dy;
      apply();
    }
  });
  const end = (e) => {
    const wasTap = pts.size === 1 && start?.p && !start.moved;
    const at = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (wasTap && at) {
      const now = Date.now();
      if (now - lastTap < 320) { zoomAt(s > 1.2 ? 1 : 2.5, at.x, at.y); lastTap = 0; }
      else lastTap = now;
    }
    begin();
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = pos(e);
    zoomAt(s * Math.exp(-e.deltaY / 300), p.x, p.y);
  }, { passive: false });

  const close = () => {
    el.classList.add('closing');
    window.removeEventListener('resize', layout);
    document.removeEventListener('keydown', onKey);
    setTimeout(() => el.remove(), 160);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  el.querySelector('.viewer-bar').addEventListener('click', (e) => {
    const v = e.target.closest('[data-v]')?.dataset.v;
    if (v === 'close') close();
    if (v === 'in') zoomAt(s * 1.6, W / 2, H / 2);
    if (v === 'out') zoomAt(s / 1.6, W / 2, H / 2);
  });
  window.addEventListener('resize', layout);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(el);
  return el;
}
