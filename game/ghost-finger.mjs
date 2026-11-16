// launch-22: Geisterfinger für die Tutorial-Level. Reines DOM + CSS-Transform,
// damit die 3D-Szene in Ruhe bei 0 fps bleiben kann. Koordinaten = Client-Pixel.
const FINGER_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <defs>
    <linearGradient id="gf-skin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe0c2"/>
      <stop offset=".55" stop-color="#f0b58a"/>
      <stop offset="1" stop-color="#d48958"/>
    </linearGradient>
    <filter id="gf-glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="1.6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g filter="url(#gf-glow)" fill="url(#gf-skin)" stroke="#1a1440" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
    <path d="M28.5 8.5c2.4 0 4.2 2 4.2 4.6V28l.2 1.2c.6-1.4 2-2.3 3.6-2.3 2.3 0 4 1.8 4 4.1v6.2c.5-1 1.6-1.8 3-1.8 2.2 0 3.8 1.8 3.8 4v7.4c.5-.8 1.6-1.4 2.9-1.4 2.1 0 3.6 1.7 3.6 3.8V50c0 6.4-4.6 11-11.4 11H29.2C20.4 61 15 55.2 15 47.2V33.6c0-2.6 1.8-4.6 4.2-4.6 1.4 0 2.6.6 3.3 1.6V13.1c0-2.6 1.9-4.6 4.3-4.6z"/>
  </g>
  <path d="M23.8 16.5c1.2-2.4 3.2-3.6 5.2-3.4" fill="none" stroke="#fff4e4" stroke-width="2" stroke-linecap="round" opacity=".85"/>
</svg>`;

export function createGhostFinger({ page = document, reduceMotion } = {}) {
  const el = page.createElement('div');
  el.className = 'ghost-finger';
  el.hidden = true;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = FINGER_SVG;
  // Over the board, under dialogs (campaign-result is z-index 40).
  page.body.append(el);
  let shown = null, resizeTimer = 0;

  function place(lane, reduced) {
    if (!lane?.length) { hide(); return; }
    const a = lane[0], b = lane[1] || a;
    const size = a.size || 48;
    const stepx = b.x - a.x, stepy = b.y - a.y;
    const len = Math.hypot(stepx, stepy) || 1;
    const ux = stepx / len, uy = stepy / len;
    // Start just off the entry edge, swipe a bit more than one cell in.
    const x0 = a.x - ux * size * 1.15, y0 = a.y - uy * size * 1.15;
    const x1 = a.x + ux * size * 1.05, y1 = a.y + uy * size * 1.05;
    const rot = Math.atan2(uy, ux) * 180 / Math.PI + 90; // fingertip leads the swipe
    const w = Math.max(56, size * 1.15);
    el.style.width = `${w}px`;
    el.style.height = `${w}px`;
    el.style.setProperty('--rot', `${rot}deg`);
    el.style.setProperty('--dx', `${x1 - x0}px`);
    el.style.setProperty('--dy', `${y1 - y0}px`);
    if (reduced) {
      el.style.left = `${(x0 + x1) / 2 - w / 2}px`;
      el.style.top = `${(y0 + y1) / 2 - w / 2}px`;
    } else {
      el.style.left = `${x0 - w / 2}px`;
      el.style.top = `${y0 - w / 2}px`;
    }
    el.classList.toggle('is-static', !!reduced);
    el.hidden = false;
    // Restart the CSS loop if we re-show after a wrong move.
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
    shown = { lane, reduced: !!reduced };
  }

  function show(lane, { reduced } = {}) {
    const red = reduced ?? !!reduceMotion?.matches;
    place(lane, red);
  }
  function hide() {
    shown = null;
    el.classList.remove('is-on');
    el.hidden = true;
  }
  function relayout() {
    if (!shown) return;
    place(shown.lane, shown.reduced);
  }
  page.defaultView?.addEventListener('resize', () => {
    if (!shown) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(relayout, 80);
  });

  return { show, hide, relayout, element: el, get visible() { return !el.hidden; } };
}
