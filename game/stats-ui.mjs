// Werkzeug-Statistik (launch-13, Testphase): Übersicht aus dem lokalen Protokoll, Export, Zurücksetzen.
import { TOOL_ICONS } from './tool-icons.mjs?v=launch-15';
import { toolName } from './campaign.mjs?v=launch-15';
import { summarize, exportLog } from './tool-log.mjs?v=launch-15';

const TYPES = ['extraMoves', 'hint', 'rocket', 'wand'];
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const CLOSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>';
const ico = type => { const s = el('i', 'ts-ico'); s.innerHTML = TOOL_ICONS[type] || ''; s.title = toolName(type); return s; };
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);

export function createStatsUI({ getLog, onReset, build = '', sound } = {}) {
  let veil = null, lastFocus = null, toastTimer = 0, armedReset = false;
  const stats = { opens: 0, exports: 0, resets: 0, lastExport: null, lastExportMode: null };

  function cells(row, s) {
    for (const t of TYPES) {
      const td = el('td', 'ts-num');
      const u = s.use[t], a = s.ads[t], g = s.gifts?.[t] | 0;
      td.textContent = u || a || g ? `${u}` : '–';
      if (a) td.append(el('sup', 'ts-ad', `${a}▶`));
      if (g) td.append(el('sup', 'ts-gift', `${g}🎁`));
      td.setAttribute('aria-label', `${toolName(t)}: ${u} eingesetzt, ${a} per Werbung, ${g} geschenkt`);
      row.append(td);
    }
  }
  function render() {
    const log = getLog(), sm = summarize(log);
    veil = el('div', 'ad-veil ts-veil'); veil.id = 'tool-stats';
    const panel = el('div', 'ad-panel ts-panel');
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'ts-title'); panel.tabIndex = -1;
    const close = el('button', 'ad-close'); close.type = 'button'; close.setAttribute('aria-label', 'Statistik schließen'); close.innerHTML = CLOSE_SVG;
    close.addEventListener('click', () => api.close());
    const title = el('h2', 'ad-title', 'Werkzeug-Statistik'); title.id = 'ts-title';
    const t = sm.total;
    const tiles = el('div', 'ts-totals');
    for (const [v, l] of [[t.attempts, 'Versuche'], [t.wins, 'Siege'], [sum(t.use), 'Einsätze'], [sum(t.ads), 'Werbung'], [sum(t.gifts), 'Geschenke']]) {
      const d = el('div', 'ts-tile'); d.append(el('b', '', String(v)), el('small', '', l)); tiles.append(d);
    }
    const perType = el('div', 'ts-types');
    for (const ty of TYPES) {
      const d = el('div', 'ts-type'); d.append(ico(ty), el('b', '', String(t.use[ty])), el('small', '', `${t.ads[ty]}▶`), el('small', 'ts-gift', `${t.gifts[ty]}🎁`));
      d.setAttribute('aria-label', `${toolName(ty)}: ${t.use[ty]} eingesetzt, ${t.ads[ty]} per Werbung, ${t.gifts[ty]} geschenkt`); perType.append(d);
    }
    const wrap = el('div', 'ts-table-wrap');
    if (sm.levels.length) {
      const table = el('table', 'ts-table');
      const head = el('tr');
      head.append(el('th', '', 'Lvl'), el('th', '', 'Vers.'), el('th', '', 'Sieg'));
      for (const ty of TYPES) { const th = el('th'); th.append(ico(ty)); head.append(th); }
      const thead = el('thead'); thead.append(head);
      const tbody = el('tbody');
      for (const s of sm.levels) {
        const tr = el('tr'); tr.dataset.level = String(s.level);
        tr.append(el('td', 'ts-lvl', String(s.level)), el('td', 'ts-num', String(s.attempts)), el('td', 'ts-num' + (s.wins ? ' is-win' : ''), String(s.wins)));
        cells(tr, s); tbody.append(tr);
      }
      table.append(thead, tbody); wrap.append(table);
    } else wrap.append(el('p', 'ts-empty', 'Noch keine Level gespielt. Spiel ein paar Level – hier siehst du dann, wo du welche Hilfe gebraucht hast.'));
    const legend = el('p', 'ts-legend', 'Zahl = eingesetzt · ▶ = per Werbung · 🎁 = Geschenk');
    const acts = el('div', 'ts-actions');
    const exp = el('button', 'ad-watch ts-export', 'Exportieren'); exp.type = 'button'; exp.id = 'ts-export';
    exp.addEventListener('click', () => void doExport());
    const reset = el('button', 'ad-later ts-reset', 'Zurücksetzen'); reset.type = 'button'; reset.id = 'ts-reset';
    reset.addEventListener('click', () => doReset(reset));
    acts.append(exp, reset);
    const toast = el('p', 'shop-toast ts-toast'); toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite');
    panel.append(close, title, tiles, perType, wrap, legend, acts, toast, el('p', 'ad-foot', 'Nur auf diesem Gerät gespeichert. Testphase.'));
    veil.append(panel);
    veil.addEventListener('pointerdown', ev => { if (ev.target === veil) { ev.preventDefault(); api.close(); } });
    return veil;
  }
  function showToast(text) {
    const t = veil?.querySelector('.ts-toast'); if (!t) return;
    t.textContent = text; t.classList.add('is-on'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), 2800);
  }
  async function doExport() {
    const text = exportLog(getLog(), { build });
    const name = `squish-werkzeug-log-${new Date().toISOString().slice(0, 10)}.json`;
    stats.exports++; stats.lastExport = text;
    let copied = false;
    try { await navigator.clipboard?.writeText(text); copied = !!navigator.clipboard; } catch {}
    // Teilen (iPhone: Teilen-Blatt mit Datei) – sonst Datei herunterladen.
    let mode = copied ? 'copy' : 'none';
    try {
      const file = typeof File === 'function' ? new File([text], name, { type: 'application/json' }) : null;
      if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Squish Werkzeug-Log' }); mode = copied ? 'copy+share' : 'share'; }
      else download(text, name), mode = copied ? 'copy+download' : 'download';
    } catch (e) { if (e?.name !== 'AbortError' && !copied) { download(text, name); mode = 'download'; } }
    stats.lastExportMode = mode;
    sound?.play?.('tap');
    showToast(copied ? 'Log kopiert – zum Senden einfach einfügen' : 'Log als Datei gespeichert');
  }
  function download(text, name) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = el('a'); a.href = url; a.download = name; a.style.display = 'none';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function doReset(btn) {
    if (!armedReset) {   // erster Tipp: nachfragen
      armedReset = true; btn.textContent = 'Wirklich löschen?'; btn.classList.add('is-armed');
      showToast('Nochmal tippen löscht das ganze Protokoll');
      return;
    }
    armedReset = false; stats.resets++;
    onReset?.();
    api.refresh();
    showToast('Protokoll gelöscht');
  }
  function key(ev) {
    if (!veil) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); api.close(); }
    if (ev.key === 'Tab') {
      const items = [...veil.querySelectorAll('button')];
      const i = items.indexOf(document.activeElement);
      ev.preventDefault(); ev.stopPropagation();
      items[(i + (ev.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
    }
  }
  const api = {
    get isOpen() { return !!veil; },
    get element() { return veil; },
    stats,
    open() {
      if (veil) api.close({ silent: true });
      lastFocus = document.activeElement; armedReset = false;
      stats.opens++;
      document.body.append(render());
      document.addEventListener('keydown', key, true);
      requestAnimationFrame(() => veil?.querySelector('.ts-export')?.focus({ preventScroll: true }));
      return true;
    },
    refresh() { if (!veil) return; const lf = lastFocus, t = veil.querySelector('.ts-toast')?.textContent; api.close({ keepFocus: true }); api.open(); lastFocus = lf; stats.opens--; if (t) showToast(t); },
    close({ keepFocus = false } = {}) {
      if (!veil) return;
      document.removeEventListener('keydown', key, true);
      veil.remove(); veil = null; clearTimeout(toastTimer);
      if (!keepFocus) lastFocus?.focus?.({ preventScroll: true });
    },
  };
  return api;
}
