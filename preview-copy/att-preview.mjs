// Nur in der Text-Vorschau: die ATT-Vorfrage mit neuem Ton, ohne System-Dialog.
export const ATT_TEXT = Object.freeze({
  de: Object.freeze({
    title: 'Kurze Frage von Apple',
    line: 'Dein iPhone fragt gleich, ob Werbung zu dir passen darf. So bleibt Squish umsonst.',
    ok: 'Weiter',
  }),
  en: Object.freeze({
    title: 'A quick question from Apple',
    line: 'Your iPhone will ask if ads may be tailored to you. That’s what keeps Squish free.',
    ok: 'Continue',
  }),
});
const HEART = '<svg viewBox="0 0 48 44" aria-hidden="true"><defs><linearGradient id="atth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a0"/><stop offset=".55" stop-color="#ffc21f"/><stop offset="1" stop-color="#e08a00"/></linearGradient></defs><path d="M24 41C10 31 3 24 3 14.5 3 8 8 3 14 3c4.4 0 7.7 2.4 10 6 2.3-3.6 5.6-6 10-6 6 0 11 5 11 11.5C45 24 38 31 24 41z" fill="url(#atth)" stroke="#6a3304" stroke-width="3" stroke-linejoin="round"/><ellipse cx="14" cy="12" rx="4" ry="2.4" fill="#fff" opacity=".85" transform="rotate(-30 14 12)"/></svg>';
const PALETTE = [['#5cc2ff', '#1f7ff0', '#0d3f9e'], ['#ff7a66', '#e8291f', '#a3101a'], ['#9df25a', '#38b81c', '#1b7a10']];

function tile(doc, v) {
  const s = doc.createElement('span'); s.className = 'ex-tile att-tile';
  const [hi, mid, lo] = PALETTE[(v - 1) % 3];
  s.style.setProperty('--hi', hi); s.style.setProperty('--mid', mid); s.style.setProperty('--lo', lo);
  const b = doc.createElement('b'); b.textContent = String(v); s.append(b); return s;
}

export function showAttPrePrompt({ doc = globalThis.document, lang = 'de' } = {}) {
  const T = ATT_TEXT[lang] || ATT_TEXT.en;
  return new Promise(resolve => {
    const veil = doc.createElement('div'); veil.className = 'ex-veil att-veil'; veil.id = 'att-preprompt';
    const panel = doc.createElement('div'); panel.className = 'ex-panel att-panel';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'att-title'); panel.setAttribute('aria-describedby', 'att-line');
    const pic = doc.createElement('div'); pic.className = 'att-pic'; pic.setAttribute('aria-hidden', 'true');
    const heart = doc.createElement('span'); heart.className = 'att-heart'; heart.innerHTML = HEART;
    pic.append(tile(doc, 1), heart, tile(doc, 3));
    const h = doc.createElement('h2'); h.className = 'att-title'; h.id = 'att-title'; h.textContent = T.title;
    const p = doc.createElement('p'); p.className = 'att-line'; p.id = 'att-line'; p.textContent = T.line;
    const ok = doc.createElement('button'); ok.type = 'button'; ok.className = 'ex-ok att-ok'; ok.id = 'att-ok'; ok.textContent = T.ok;
    const done = () => { veil.remove(); resolve(true); };
    ok.addEventListener('click', done);
    panel.append(pic, h, p, ok); veil.append(panel); doc.body.append(veil);
    globalThis.requestAnimationFrame?.(() => ok.focus({ preventScroll: true }));
  });
}
