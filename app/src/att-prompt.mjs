// launch-32: App-Tracking-Transparenz (ATT) erst nach dem ersten gelösten Level, nicht beim Start.
// Reihenfolge: UMP-Einwilligung beim App-Start (setupConsent mit askTracking:false) → erstes gelöstes Level
// (Spiel-Signal `squish:level-won`) → kurze, freundliche Vorfrage im Comic-Stil → Apples ATT-Dialog.
// Die Vorfrage hat nur „Weiter“ (keine eigene Ablehnen-Taste: die echte Wahl trifft man im System-Dialog).
// Gefragt wird nur, solange iOS „notDetermined“ meldet; danach nie wieder (Merker ATT_ASKED_KEY).
export const ATT_ASKED_KEY = 'squish-att-asked-v1';
export const ATT_TEXT = Object.freeze({
  de: Object.freeze({ title: 'Hilf uns, das Spiel kostenlos zu halten', line: 'Gleich fragt dein iPhone, ob wir passende Werbung zeigen dürfen – so bleibt Squish Attack gratis.', ok: 'Weiter' }),
  en: Object.freeze({ title: 'Help us keep the game free', line: 'Your iPhone will ask next if we may show relevant ads – that keeps Squish Attack free.', ok: 'Continue' }),
});
const HEART = '<svg viewBox="0 0 48 44" aria-hidden="true"><defs><linearGradient id="atth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a0"/><stop offset=".55" stop-color="#ffc21f"/><stop offset="1" stop-color="#e08a00"/></linearGradient></defs><path d="M24 41C10 31 3 24 3 14.5 3 8 8 3 14 3c4.4 0 7.7 2.4 10 6 2.3-3.6 5.6-6 10-6 6 0 11 5 11 11.5C45 24 38 31 24 41z" fill="url(#atth)" stroke="#6a3304" stroke-width="3" stroke-linejoin="round"/><ellipse cx="14" cy="12" rx="4" ry="2.4" fill="#fff" opacity=".85" transform="rotate(-30 14 12)"/></svg>';
const PALETTE = [['#5cc2ff', '#1f7ff0', '#0d3f9e'], ['#ff7a66', '#e8291f', '#a3101a'], ['#9df25a', '#38b81c', '#1b7a10']];

function tile(doc, v) {
  const s = doc.createElement('span'); s.className = 'ex-tile att-tile';
  const [hi, mid, lo] = PALETTE[(v - 1) % 3];
  s.style.setProperty('--hi', hi); s.style.setProperty('--mid', mid); s.style.setProperty('--lo', lo);
  const b = doc.createElement('b'); b.textContent = String(v); s.append(b); return s;
}

/** Vorfrage zeigen; Promise löst beim Tippen auf „Weiter“ (oder Schließen) auf. */
export function showAttPrePrompt({ doc = globalThis.document, lang = 'de' } = {}) {
  const T = ATT_TEXT[lang] || ATT_TEXT.en;
  return new Promise(resolve => {
    const veil = doc.createElement('div'); veil.className = 'ex-veil att-veil'; veil.id = 'att-preprompt';
    const panel = doc.createElement('div'); panel.className = 'ex-panel att-panel';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'att-title'); panel.setAttribute('aria-describedby', 'att-line');
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

const within = (p, ms) => Promise.race([Promise.resolve(p), new Promise(r => setTimeout(() => r(null), ms))]);

/**
 * ATT-Ablauf an das Spiel hängen.
 * @param ready  Promise aus setupConsent (UMP zuerst). Ist die Einwilligung nach readyMs nicht durch, wird beim
 *               nächsten gelösten Level erneut versucht.
 */
export function createAttFlow({ AdMob, ready = Promise.resolve({}), doc = globalThis.document, storage = globalThis.localStorage,
  target = globalThis, lang = () => 'de', delayMs = 2400, readyMs = 4000, prompt = showAttPrePrompt, log = () => {} } = {}) {
  const stats = { wins: 0, shown: 0, asked: 0, status: null, skipped: null };
  let busy = false;
  const asked = () => { try { return !!storage?.getItem(ATT_ASKED_KEY); } catch { return false; } };
  const remember = v => { try { storage?.setItem(ATT_ASKED_KEY, String(v || 'asked')); } catch {} };
  async function maybeAsk() {
    if (busy || asked()) return { skipped: 'done' };
    busy = true;
    try {
      const consent = await within(ready, readyMs);
      if (!consent) { stats.skipped = 'consent-pending'; return stats; }
      const st = (await AdMob.trackingAuthorizationStatus())?.status ?? null;
      if (st !== 'notDetermined') { stats.status = st; stats.skipped = 'decided'; remember(st); return stats; }
      stats.shown++;
      await prompt({ doc, lang: lang() });
      stats.asked++;
      await AdMob.requestTrackingAuthorization();
      stats.status = (await AdMob.trackingAuthorizationStatus())?.status ?? null;
      remember(stats.status);
    } catch (e) { log('att', e); }
    finally { busy = false; }
    return stats;
  }
  const onWin = () => { stats.wins++; if (!asked()) setTimeout(() => void maybeAsk(), delayMs); };
  target.addEventListener?.('squish:level-won', onWin);
  return { stats, maybeAsk, stop: () => target.removeEventListener?.('squish:level-won', onWin) };
}
