// Sprungparameter nur in /preview-copy/. Live-Spiel unberührt.
import { setLang, getLang } from './i18n.mjs?v=launch-40';
import { emptyProgress, recordResult, saveProgress } from './campaign.mjs?v=launch-40';
import { renderGoalItem } from './campaign-ui.mjs?v=launch-40';
import { showPopup, closePopup } from './streak-ui.mjs?v=launch-40';
import { checkIn, emptyState, saveState, localDateISO, addDaysISO, loadState } from './streak.mjs?v=launch-40';
import { showAttPrePrompt } from './att-preview.mjs?v=launch-40';

const wait = ms => new Promise(r => setTimeout(r, ms));

function params() { return new URLSearchParams(location.search); }

function emptyBoard() { return Array.from({ length: 5 }, () => Array(5).fill(null)); }
function mockRun(goals, extra = {}) {
  return {
    level: { goals, moves: 8, stars: { three: 3, two: 5 } },
    board: emptyBoard(),
    created: {}, score: 0, cleared: 0, streets: 0, bestCombo: 0, longStreets: 0,
    purged: {}, fuseMarks: [], status: 'playing', ...extra,
  };
}

const GALLERY = [
  { title: { de: '3 Gleiche', en: '3 of a kind' }, goals: [{ type: 'fuse', size: 3 }] },
  { title: { de: '4 Gleiche', en: '4 of a kind' }, goals: [{ type: 'fuse', size: 4, shape: 'line' }] },
  { title: { de: 'T-Form', en: 'T shape' }, goals: [{ type: 'fuse', size: 4, shape: 't' }] },
  { title: { de: '5 Gleiche', en: '5 of a kind' }, goals: [{ type: 'fuse', size: 5 }] },
  { title: { de: 'Straße', en: 'Straight' }, goals: [{ type: 'street', count: 1 }] },
  { title: { de: 'Langer Weg', en: 'Long straight' }, goals: [{ type: 'long', count: 1, n: 5 }] },
  { title: { de: 'Einen 5er', en: 'Make a 5' }, goals: [{ type: 'tile', value: 5 }] },
  { title: { de: '2× 3 oder höher', en: '2× 3 or higher' }, goals: [{ type: 'make', value: 3, count: 2 }] },
  { title: { de: 'Punkte', en: 'Score' }, goals: [{ type: 'score', points: 1200 }], extra: { score: 240 } },
  { title: { de: 'Steine weg', en: 'Clear tiles' }, goals: [{ type: 'clear', tiles: 8 }] },
  { title: { de: 'Kette', en: 'Chain' }, goals: [{ type: 'combo', chain: 3 }] },
  { title: { de: 'Wenig übrig', en: 'Few left' }, goals: [{ type: 'empty', max: 2 }] },
  { title: { de: 'Wert weg', en: 'Clear a value' }, goals: [{ type: 'purge', value: 2, tiles: 3 }] },
  { title: { de: 'Drei Ziele', en: 'Three goals' }, goals: [{ type: 'fuse', size: 3 }, { type: 'street', count: 1 }, { type: 'tile', value: 4 }] },
];

function openGallery(lang = 'de') {
  const old = document.getElementById('goal-gallery');
  old?.remove();
  const root = document.createElement('section');
  root.id = 'goal-gallery'; root.className = 'goal-gallery';
  root.setAttribute('role', 'dialog');
  const h = document.createElement('h1');
  h.textContent = lang === 'en' ? 'Goals, pictures first' : 'Ziele, zuerst als Bild';
  const lede = document.createElement('p'); lede.className = 'lede';
  lede.textContent = lang === 'en'
    ? 'Same comic HUD as in the game. The counter is the progress. Live game is unchanged.'
    : 'Gleicher Comic-HUD wie im Spiel. Die Zahl ist der Fortschritt. Das Live-Spiel bleibt unverändert.';
  root.append(h, lede);
  for (const item of GALLERY) {
    const card = document.createElement('article'); card.className = 'mock-card';
    const title = document.createElement('h2'); title.textContent = item.title[lang] || item.title.de;
    const host = document.createElement('div');
    host.className = 'campaign-goal'; host.style.position = 'relative';
    host.style.left = 'auto'; host.style.top = 'auto'; host.style.width = '100%';
    const ul = document.createElement('ul');
    ul.classList.add('is-pictorial');
    if (item.goals.length >= 3) ul.classList.add('is-three');
    const run = mockRun(item.goals, item.extra);
    ul.append(...item.goals.map(g => renderGoalItem(g, run)));
    host.append(ul); card.append(title, host); root.append(card);
  }
  document.body.append(root);
}

function seedProgress(throughExclusive) {
  let p = emptyProgress();
  for (let i = 1; i < throughExclusive; i++) p = recordResult(p, i, { stars: 3, moves: 1, now: Date.now() });
  saveProgress(p);
  return p;
}

async function waitHome(worldMenu, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (worldMenu?.active && !worldMenu.stats?.busy && document.getElementById('home-screen') && !document.getElementById('home-screen').hidden) return true;
    if (window.SquishGame && !window.SquishGame.state?.booting && worldMenu?.active) return true;
    await wait(80);
  }
  return false;
}

function click(sel) {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  el?.click?.();
  return !!el;
}

export async function installPreviewJumps(api = {}) {
  const q = params();
  const lang = q.get('lang') === 'en' ? 'en' : q.get('lang') === 'de' ? 'de' : getLang();
  if (q.get('lang') === 'en' || q.get('lang') === 'de') setLang(lang);

  if (q.has('gallery') || q.get('screen') === 'goals' || q.get('goals') === '1') {
    openGallery(lang);
    // Gallery can stand alone; still let the game boot underneath.
  }

  const { worldMenu, play, explainer, campaignUI, shopUI, setProgress, streak, openShop, openSelect } = api;

  const screen = (q.get('screen') || '').toLowerCase();
  const level = Number(q.get('level') || 0);
  const explain = q.get('explain');
  const streakDay = Number(q.get('streak') || q.get('day') || 0);

  if (!screen && !level && !explain && !streakDay && !q.has('att')) return;

  await waitHome(worldMenu);
  await wait(200);

  if (level >= 1) {
    const p = seedProgress(level);
    setProgress?.(p);
    // skip auto-explainer only when explicitly asked
    if (q.get('explain') === '0' && explainer) {
      for (const k of ['merge', 'merge5', 'street', 'tools', 'gifts', 'gates', 'ads']) explainer.mark?.(k);
    }
    await (play?.({ campaign: level }) ?? Promise.resolve());
    if (explain && explain !== '0') {
      await wait(400);
      explainer?.show?.(explain);
    }
    return;
  }

  if (explain) {
    await explainer?.show?.(explain);
  }

  if (screen === 'settings') click('#home-settings, [data-open-settings]');
  if (screen === 'rules') click('#home-screen [data-nav="rules"]');
  if (screen === 'shop') {
    openShop?.() || shopUI?.open?.();
  }
  if (screen === 'select' || screen === 'levels') {
    if (openSelect) {
      const t0=Date.now();
      while (Date.now()-t0<8000 && !window.SquishGame?.campaign?.levelsLoaded) await wait(100);
      openSelect();
    } else {
      click('#home-screen [data-nav="adventure"]');
      await wait(200);
      click('#home-screen [data-nav="select"]');
    }
  }
  if (screen === 'result' || screen === 'win') {
    campaignUI?.showResult?.({
      n: 1, won: true, stars: 3, moves: 2, limit: 5, left: 3, canNext: true,
      extraAvailable: 0, gifts: [], toolsUsed: 0, giftsUsed: 0,
    });
  }
  if (screen === 'lose') {
    campaignUI?.showResult?.({
      n: 3, won: false, stars: 0, moves: 5, limit: 5, lostReason: 'moves',
      canNext: false, extraAvailable: 1, extraGold: 0, extraAd: true,
    });
  }
  if (screen === 'gift') {
    campaignUI?.showResult?.({
      n: 10, won: true, stars: 2, moves: 4, limit: 7, left: 3, canNext: true,
      gifts: [{ type: 'rocket', id: 'preview' }], toolsUsed: 0, giftsUsed: 0,
    });
  }
  if (screen === 'att' || q.has('att')) {
    await showAttPrePrompt({ lang });
  }
  if (screen === 'streak' || streakDay) {
    const day = Math.max(1, Math.min(35, streakDay || 7));
    const today = localDateISO();
    const yesterday = addDaysISO(today, -1);
    // Arrive as if yesterday was day-1, so today's check-in lands on `day`.
    let state = emptyState();
    if (day > 1) {
      state = { ...state, totalDays: day - 1, lastCheckIn: yesterday, gifted: [] };
      // titles/gifts catch up through normalize in checkIn
    } else {
      state = { ...state, totalDays: 0, lastCheckIn: null };
    }
    saveState(state);
    const ev = checkIn(loadState(), today);
    saveState(ev.state);
    streak?.paint?.();
    closePopup();
    showPopup(ev);
  }
}

