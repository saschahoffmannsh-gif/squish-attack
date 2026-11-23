// launch-24: Geisterfinger für die Tutorial-Level. Reines DOM + CSS-Transform,
// damit die 3D-Szene in Ruhe bei 0 fps bleiben kann. Koordinaten = Client-Pixel.
// Silhouette in Navy/Gold, Wisch über die ganze Reihe/Spalte, Druck + Abheben + Spur.
const FINGER_SVG = `<svg viewBox="0 0 80 96" aria-hidden="true">
  <defs>
    <filter id="gf24-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="2.4" result="blur"/>
      <feFlood flood-color="#ffffff" flood-opacity="0.9" result="glow"/>
      <feComposite in="glow" in2="blur" operator="in" result="soft"/>
      <feMerge><feMergeNode in="soft"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g filter="url(#gf24-glow)" stroke-linejoin="round" stroke-linecap="round">
    <path d="M38 6.5c6 0 10.2 4.4 10.2 10.4v26.2c1.7-2.4 4.6-3.8 7.8-3.8 5.2 0 9 4 9 9v4.6c1.5-1.7 4-2.8 6.8-2.8 5 0 8.6 3.8 8.6 8.6V76c0 12.6-9.2 21.5-23.2 21.5H33.2C20.4 97.5 12 89 12 76.4V50.6c0-5.2 3.8-9.2 9-9.2 2.6 0 4.9 1.1 6.5 2.8V16.9c0-6 4.2-10.4 10.5-10.4z" fill="none" stroke="#14163e" stroke-width="6.2"/>
    <path d="M38 6.5c6 0 10.2 4.4 10.2 10.4v26.2c1.7-2.4 4.6-3.8 7.8-3.8 5.2 0 9 4 9 9v4.6c1.5-1.7 4-2.8 6.8-2.8 5 0 8.6 3.8 8.6 8.6V76c0 12.6-9.2 21.5-23.2 21.5H33.2C20.4 97.5 12 89 12 76.4V50.6c0-5.2 3.8-9.2 9-9.2 2.6 0 4.9 1.1 6.5 2.8V16.9c0-6 4.2-10.4 10.5-10.4z" fill="#1a1548" fill-opacity=".7" stroke="#ffd25a" stroke-width="2.3"/>
    <path d="M35.5 15c2.4-3.2 6.4-4.6 9.4-3.8" fill="none" stroke="#ffffff" stroke-opacity=".6" stroke-width="2"/>
    <path d="M31 56.5c3.4 6.2 8.6 9.6 15.6 10.2" fill="none" stroke="#ffd25a" stroke-opacity=".45" stroke-width="1.6"/>
  </g>
</svg>`;

const ARROW_SVG = `<svg viewBox="0 0 160 28" aria-hidden="true">
  <path d="M8 14 H118" fill="none" stroke="#ffd25a" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M110 5 L152 14 L110 23 Z" fill="#ffd25a" stroke="#14163e" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M8 14 H118" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width="1.2" stroke-linecap="round"/>
</svg>`;

export function createGhostFinger({ page = document, reduceMotion } = {}) {
  const el = page.createElement('div');
  el.className = 'ghost-hint';
  el.hidden = true;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="ghost-lane"></div>
    <span class="ghost-trail"></span>
    <span class="ghost-trail"></span>
    <span class="ghost-trail"></span>
    <div class="ghost-hand">${FINGER_SVG}</div>
    <div class="ghost-arrow">${ARROW_SVG}</div>`;
  page.body.append(el);
  const laneEl = el.querySelector('.ghost-lane');
  const hand = el.querySelector('.ghost-hand');
  const arrow = el.querySelector('.ghost-arrow');
  const trails = [...el.querySelectorAll('.ghost-trail')];
  let shown = null, resizeTimer = 0;

  function place(lane, reduced) {
    if (!lane?.length) { hide(); return; }
    const a = lane[0], z = lane[lane.length - 1] || a;
    const size = a.size || 48;
    const dx = z.x - a.x, dy = z.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist, uy = dy / dist;
    const rot = Math.atan2(uy, ux) * 180 / Math.PI;
    const midX = (a.x + z.x) / 2, midY = (a.y + z.y) / 2;
    const laneLen = dist + size * 1.08;
    const laneH = Math.max(28, size * 0.9);
    laneEl.style.width = `${laneLen}px`;
    laneEl.style.height = `${laneH}px`;
    laneEl.style.left = `${midX}px`;
    laneEl.style.top = `${midY}px`;
    laneEl.style.transform = `translate(-50%,-50%) rotate(${rot}deg)`;

    arrow.style.width = `${Math.max(96, dist * 0.72)}px`;
    arrow.style.left = `${midX}px`;
    arrow.style.top = `${midY}px`;
    arrow.style.transform = `translate(-50%,-50%) rotate(${rot}deg)`;

    const w = Math.max(66, size * 1.28);
    const tip = w * 0.36;
    const startX = reduced ? midX : a.x;
    const startY = reduced ? midY : a.y;
    // Fingerspitze liegt auf dem Startpunkt, der Rest der Hand folgt der Wischrichtung.
    const hx = startX - w / 2 - ux * tip;
    const hy = startY - w / 2 - uy * tip;
    hand.style.width = `${w}px`;
    hand.style.height = `${w}px`;
    hand.style.left = `${hx}px`;
    hand.style.top = `${hy}px`;
    el.style.setProperty('--dx', reduced ? '0px' : `${z.x - a.x}px`);
    el.style.setProperty('--dy', reduced ? '0px' : `${z.y - a.y}px`);
    el.style.setProperty('--rot', `${rot + 90}deg`);

    for (const tr of trails) {
      tr.style.left = `${startX - 10}px`;
      tr.style.top = `${startY - 10}px`;
    }

    el.classList.toggle('is-static', !!reduced);
    el.hidden = false;
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
    shown = { lane, reduced: !!reduced };
  }

  function show(lane, { reduced } = {}) {
    place(lane, reduced ?? !!reduceMotion?.matches);
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
