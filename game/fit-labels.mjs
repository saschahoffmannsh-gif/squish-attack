// launch-24: Knopftexte ohne Ellipsis auf die verfügbare Breite einpassen
// (Schrift verkleinern, bis scrollWidth in clientWidth passt).
export function fitLabels(root, { minBtn = 11, minTile = 8 } = {}) {
  if (!root) return;
  const win = root.ownerDocument?.defaultView ?? globalThis;
  const shrink = (el, min) => {
    if (!el) return;
    el.style.fontSize = '';
    if (el.clientWidth <= 0) return;
    let fs = parseFloat(win.getComputedStyle(el).fontSize);
    if (!Number.isFinite(fs)) return;
    let guard = 48;
    while (el.scrollWidth > el.clientWidth + 0.5 && fs > min && guard--) {
      fs = Math.max(min, fs - 0.5);
      el.style.fontSize = `${fs}px`;
    }
  };
  for (const b of root.querySelectorAll('.aw-btn')) {
    shrink(b.querySelector('.aw-label>span'), minBtn);
    shrink(b.querySelector('.aw-label small'), 9);
  }
  for (const t of root.querySelectorAll('.aw-tile-label, .ts-tile small')) shrink(t, minTile);
}

export function fitLabelsSoon(root, opts) {
  if (!root) return;
  const run = () => fitLabels(root, opts);
  run();
  const win = root.ownerDocument?.defaultView;
  win?.requestAnimationFrame(() => {
    run();
    win.requestAnimationFrame(run);
  });
  const fonts = root.ownerDocument?.fonts;
  if (fonts?.ready) fonts.ready.then(run).catch(() => {});
}
