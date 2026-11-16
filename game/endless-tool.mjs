// Endlos-Werkzeug (App-Hülle): die Rakete aus dem Werbe-Angebot, nur im Endlos-Modus nutzbar.
// Vorrat getrennt vom Abenteuer (localStorage), ein runder Knopf unten links über der sicheren Fläche.
// Im Browser ohne Werbe-Adapter gibt es kein Angebot, der Vorrat bleibt 0 und der Knopf unsichtbar.
import { TOOL_ICONS } from './tool-icons.mjs?v=launch-19';

export const ENDLESS_TOOL = 'rocket';
const KEY = 'squish-endless-tools-v1';

export function loadEndlessStock(storage = globalThis.localStorage) {
  try { const n = JSON.parse(storage?.getItem(KEY) || '{}')[ENDLESS_TOOL]; return Number.isInteger(n) && n > 0 ? Math.min(n, 99) : 0; } catch { return 0; }
}
export function saveEndlessStock(n, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify({ [ENDLESS_TOOL]: Math.max(0, Math.min(99, n | 0)) })); } catch {}
}

const CSS = `
.endless-tool{position:fixed;left:max(14px,env(safe-area-inset-left));bottom:max(16px,calc(env(safe-area-inset-bottom) + 8px));z-index:40;
  width:62px;height:62px;border-radius:50%;border:3px solid #0b0a16;background:#ffe36a;box-shadow:0 4px 0 #0b0a16,0 8px 18px #0008;
  display:grid;place-items:center;padding:0;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform .12s}
.endless-tool[hidden]{display:none}
.endless-tool svg{width:38px;height:38px}
.endless-tool:active{transform:translateY(2px)}
.endless-tool.is-armed{background:#ff7a5c;animation:endless-tool-pulse .9s ease-in-out infinite}
.endless-tool b{position:absolute;right:-6px;top:-6px;min-width:24px;height:24px;border-radius:12px;border:2px solid #0b0a16;background:#fff;color:#0b0a16;
  font:700 14px/20px var(--aw-comic,system-ui);text-align:center;padding:0 4px;box-sizing:border-box}
@keyframes endless-tool-pulse{50%{transform:scale(1.08)}}
@media (prefers-reduced-motion:reduce){.endless-tool.is-armed{animation:none}}`;

export function createEndlessToolButton({ page = document, onClick } = {}) {
  const style = page.createElement('style'); style.textContent = CSS; page.head.append(style);
  const btn = page.createElement('button');
  btn.type = 'button'; btn.className = 'endless-tool'; btn.id = 'endless-tool'; btn.hidden = true;
  btn.innerHTML = (TOOL_ICONS[ENDLESS_TOOL] || '') + '<b></b>';
  btn.addEventListener('click', ev => { ev.stopPropagation(); onClick?.(); });
  btn.addEventListener('pointerdown', ev => ev.stopPropagation());
  page.body.append(btn);
  return {
    el: btn,
    render({ count = 0, visible = false, armed = false } = {}) {
      btn.hidden = !(visible && count > 0);
      btn.classList.toggle('is-armed', !!armed);
      btn.querySelector('b').textContent = String(count);
      btn.setAttribute('aria-label', armed ? 'Rakete abbrechen' : `Rakete einsetzen (${count} übrig)`);
      btn.setAttribute('aria-pressed', armed ? 'true' : 'false');
    },
  };
}
