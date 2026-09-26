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
