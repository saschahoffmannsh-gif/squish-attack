// Geschenk öffnen (launch-12): Paket springt auf, der Inhalt steigt in einer Comic-Seifenblase
// hoch, Antippen lässt sie platzen (Plopp, Vibration) und die Hilfsmittel fliegen in die Leiste.
// prefers-reduced-motion: nur Ein-/Ausblenden, kein Schweben/Flug. Ton aus wird von sound.mjs beachtet.
import { TOOL_ICONS, GIFT_LID_SVG, GIFT_BOX_SVG } from './tool-icons.mjs?v=launch-30';
import { toolName } from './campaign.mjs?v=launch-30';
import { t } from './i18n.mjs?v=launch-30';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const wait = ms => new Promise(r => setTimeout(r, ms));

export function createGiftFx({ reduceMotion, sound, haptics } = {}) {
  const stats = { opens: 0, pops: 0, flights: 0 };
  let active = null;
  const reduced = () => !!reduceMotion?.matches;

  /**
   * items: [{type, count}], onPop(): wird beim Platzen aufgerufen (Gutschrift),
   * targetFor(type) → Element, zu dem die Symbole fliegen (z. B. Werkzeug-Knopf), optional.
   * Promise löst nach dem Platzen + Flug auf.
   */
  function open({ items, onPop, targetFor, gold = false, label = t('gift.label') } = {}) {
    if (active) return active.promise;
    stats.opens++;
    const rm = reduced();
    const layer = el('div', 'gift-fx' + (rm ? ' is-reduced' : '') + (gold ? ' is-gold' : '')); layer.id = 'gift-fx';
    layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-modal', 'true'); layer.setAttribute('aria-label', t('gift.openAria', { label }));
    const stage = el('div', 'gfx-stage');
    const box = el('div', 'gfx-box');
    const lid = el('div', 'gfx-lid'); lid.innerHTML = GIFT_LID_SVG;
    const base = el('div', 'gfx-base'); base.innerHTML = GIFT_BOX_SVG;
    box.append(lid, base);
    const bubble = el('button', 'gfx-bubble'); bubble.type = 'button';
    const name = type => gold ? t('gift.goldName', { tool: toolName(type) }) : toolName(type);   // launch-28: Gold-Geschenke
    const text = items.map(i => `${i.count > 1 ? i.count + '× ' : '+1 '}${name(i.type)}`).join(', ');
    bubble.setAttribute('aria-label', t('gift.bubbleAria', { text }));
    const icons = el('span', 'gfx-items');
    for (const i of items) { const s = el('i', 'gfx-item'); s.dataset.type = i.type; s.innerHTML = TOOL_ICONS[i.type] || ''; icons.append(s); }
    bubble.append(icons, el('b', 'gfx-label', text));
    const hint = el('p', 'gfx-hint', t('gift.hint'));
    if (gold) { const rays = el('i', 'gfx-rays'); rays.setAttribute('aria-hidden', 'true'); stage.append(rays); hint.textContent = t('gift.goldHint'); }
    stage.append(box, bubble, hint);
    layer.append(stage);
    document.body.append(layer);
    let resolve; const promise = new Promise(r => { resolve = r; });
    let popped = false;
    const state = { promise, layer, get phase() { return layer.dataset.phase; } };
    active = state;
    layer.dataset.phase = 'opening';
    sound?.play?.('gift'); haptics?.pulse?.('tap');
    // Ablauf: Paket hüpft → Deckel fliegt → Blase steigt (CSS-Animationen, Zeiten in store.css)
    const show = async () => {
      if (!rm) { await wait(520); }
      if (popped) return;
      layer.classList.add('is-open');
      await wait(rm ? 60 : 380);
      if (popped) return;
      layer.dataset.phase = 'bubble'; layer.classList.add('is-bubble');
      bubble.focus({ preventScroll: true });
    };
    void show();
    async function pop(ev) {
      ev?.preventDefault?.(); ev?.stopPropagation?.();
      if (popped) return; popped = true;
      if (layer.dataset.phase !== 'bubble') { layer.classList.add('is-open', 'is-bubble'); }
      layer.dataset.phase = 'popping'; stats.pops++;
      sound?.play?.('bubble'); haptics?.pulse?.('merge');
      const r = bubble.getBoundingClientRect();
      const from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      try { onPop?.(); } catch {}
      bubble.classList.add('is-popping'); hint.remove();
      if (!rm) {
        for (let k = 0; k < 12; k++) {
          const d = el('i', 'gfx-drop'); const a = k / 12 * Math.PI * 2, dist = r.width * (.62 + (k % 3) * .12);
          d.style.left = `${from.x}px`; d.style.top = `${from.y}px`;
          d.style.setProperty('--dx', `${Math.cos(a) * dist}px`); d.style.setProperty('--dy', `${Math.sin(a) * dist}px`);
          layer.append(d);
        }
        const plopp = el('span', 'gfx-plopp', t('gift.plopp')); plopp.style.left = `${from.x}px`; plopp.style.top = `${from.y}px`; layer.append(plopp);
        await wait(140);
        // Symbole fliegen zum Ziel
        const flights = items.map((it, k) => {
          const target = targetFor?.(it.type); const tr = target?.getBoundingClientRect?.();
          if (!tr || !tr.width) return null;
          const f = el('i', 'gfx-fly' + (gold ? ' is-gold' : '')); f.innerHTML = TOOL_ICONS[it.type] || '';
          const size = Math.min(64, r.width * .42);
          f.style.width = f.style.height = `${size}px`;
          f.style.left = `${from.x - size / 2 + (k - (items.length - 1) / 2) * size * .6}px`; f.style.top = `${from.y - size / 2}px`;
          layer.append(f); stats.flights++;
          const to = { x: tr.left + tr.width / 2 - size / 2, y: tr.top + tr.height / 2 - size / 2 };
          const fx = parseFloat(f.style.left), fy = parseFloat(f.style.top);
          return f.animate([
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: `translate(${(to.x - fx) * .45}px,${(to.y - fy) * .45 - 60}px) scale(1.1)`, opacity: 1, offset: .45 },
            { transform: `translate(${to.x - fx}px,${to.y - fy}px) scale(.45)`, opacity: .9 },
          ], { duration: 620, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards' }).finished.then(() => {
            target.classList.remove('is-got'); void target.offsetWidth; target.classList.add('is-got');
            setTimeout(() => target.classList.remove('is-got'), 600);
          }).catch(() => {});
        }).filter(Boolean);
        layer.classList.add('is-leaving');
        await Promise.all([wait(420), ...flights]);
      } else {
        layer.classList.add('is-leaving');
        await wait(180);
      }
      layer.remove(); active = null; resolve(true);
    }
    bubble.addEventListener('click', pop);
    box.addEventListener('click', () => { if (layer.dataset.phase === 'opening') { layer.classList.add('is-open', 'is-bubble'); layer.dataset.phase = 'bubble'; } });
    layer.addEventListener('keydown', ev => { if (ev.key === 'Escape' || ev.key === 'Enter' || ev.key === ' ') { if (layer.dataset.phase === 'bubble') void pop(ev); } });
    state.pop = () => pop();
    return promise;
  }
  return { open, stats, get active() { return !!active; }, get phase() { return active?.phase || null; } };
}
