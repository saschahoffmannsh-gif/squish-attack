// Endlos-Werkzeuge (App-Hülle): eigener Vorrat, getrennt vom Abenteuer-Vorrat.
// Gefüllt nur durch das Endlos-Werbeangebot (reihum Rakete/Zauberstab), nutzbar nur in Endlos-Runden.
// Lokal zuerst (localStorage), Cloud-Abgleich über /progress (Feld einv/einvAt, progress-merge.mjs).
// Im Browser ohne Werbe-Adapter bleibt der Vorrat leer und die Knöpfe unsichtbar.
import { TOOL_ICONS } from './tool-icons.mjs?v=launch-21';

export const ENDLESS_TOOLS = Object.freeze(['rocket', 'wand']);
const NAMES = { rocket: 'Rakete', wand: 'Zauberstab' };
export const endlessToolName = t => NAMES[t] || t;
const KEY = 'squish-endless-tools-v1';
const MAX = 99;
const clamp = n => (Number.isInteger(n) && n > 0 ? Math.min(n, MAX) : 0);

/** {rocket, wand, at} – at = Zeitpunkt der letzten Änderung (ms), für den Cloud-Abgleich. */
export function loadEndlessInv(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage?.getItem(KEY) || '{}') || {};
    return { rocket: clamp(raw.rocket), wand: clamp(raw.wand), at: Number.isSafeInteger(raw.at) && raw.at > 0 ? raw.at : 0 };
  } catch { return { rocket: 0, wand: 0, at: 0 }; }
}
export function saveEndlessInv(inv, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify({ rocket: clamp(inv.rocket), wand: clamp(inv.wand), at: inv.at || 0 })); } catch {}
}
/** Neue Kopie mit geändertem Bestand (touch = Zeitstempel setzen). */
export function changeEndlessInv(inv, tool, delta, now = Date.now()) {
  if (!ENDLESS_TOOLS.includes(tool)) return inv;
  const next = { ...inv, [tool]: Math.max(0, Math.min(MAX, (inv[tool] | 0) + delta)) };
  next.at = Math.max(now, (inv.at || 0) + 1);
  return next;
}
export const endlessTotal = inv => ENDLESS_TOOLS.reduce((n, t) => n + (inv?.[t] | 0), 0);

const CSS = `
.endless-tools{position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(14px,calc(env(safe-area-inset-bottom) + 6px));z-index:40;display:flex;gap:10px}
.endless-tools[hidden],.endless-tool[hidden]{display:none}
.endless-tool{position:relative;width:58px;height:58px;border-radius:50%;border:3px solid #0b0a16;background:#ffe36a;box-shadow:0 4px 0 #0b0a16,0 8px 18px #0008;
  display:grid;place-items:center;padding:0;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform .12s}
.endless-tool svg{width:36px;height:36px}
.endless-tool:active{transform:translateY(2px)}
.endless-tool.is-armed{background:#ff7a5c;animation:endless-tool-pulse .9s ease-in-out infinite}
.endless-tool b{position:absolute;right:-6px;top:-6px;min-width:24px;height:24px;border-radius:12px;border:2px solid #0b0a16;background:#fff;color:#0b0a16;
  font:700 14px/20px var(--aw-comic,system-ui);text-align:center;padding:0 4px;box-sizing:border-box}
@keyframes endless-tool-pulse{50%{transform:scale(1.08)}}
@media (prefers-reduced-motion:reduce){.endless-tool.is-armed{animation:none}}`;

export function createEndlessToolBar({ page = document, onClick } = {}) {
  const style = page.createElement('style'); style.textContent = CSS; page.head.append(style);
  const bar = page.createElement('div'); bar.className = 'endless-tools'; bar.id = 'endless-tools'; bar.hidden = true;
  const buttons = {};
  for (const t of ENDLESS_TOOLS) {
    const b = page.createElement('button');
    b.type = 'button'; b.className = 'endless-tool'; b.dataset.tool = t; b.hidden = true;
    b.innerHTML = (TOOL_ICONS[t] || '') + '<b></b>';
    b.addEventListener('click', ev => { ev.stopPropagation(); onClick?.(t); });
    b.addEventListener('pointerdown', ev => ev.stopPropagation());
    bar.append(b); buttons[t] = b;
  }
  page.body.append(bar);
  return {
    el: bar,
    button: t => buttons[t],
    render({ inv, visible = false, armed = null } = {}) {
      bar.hidden = !(visible && endlessTotal(inv) > 0);
      for (const t of ENDLESS_TOOLS) {
        const b = buttons[t], n = inv?.[t] | 0;
        b.hidden = n <= 0;
        b.classList.toggle('is-armed', armed === t);
        b.querySelector('b').textContent = String(n);
        b.setAttribute('aria-label', armed === t ? `${endlessToolName(t)} abbrechen` : `${endlessToolName(t)} einsetzen (${n} übrig)`);
        b.setAttribute('aria-pressed', armed === t ? 'true' : 'false');
      }
    },
  };
}
