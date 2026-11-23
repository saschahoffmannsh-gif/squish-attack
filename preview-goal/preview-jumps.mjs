// Sprungparameter nur in /preview-goal/. Live-Spiel unberührt.
import { setLang, getLang } from './i18n.mjs?v=preview-goal';
import { emptyProgress, recordResult, saveProgress } from './campaign.mjs?v=preview-goal';

const wait = ms => new Promise(r => setTimeout(r, ms));
function params() { return new URLSearchParams(location.search); }

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

export async function installPreviewJumps(api = {}) {
  const q = params();
  const lang = q.get('lang') === 'en' ? 'en' : q.get('lang') === 'de' ? 'de' : getLang();
  if (q.get('lang') === 'en' || q.get('lang') === 'de') setLang(lang);

  const { worldMenu, play, explainer, setProgress } = api;
  const level = Number(q.get('level') || 0);
  if (!level) return;

  await waitHome(worldMenu);
  await wait(200);

  const p = seedProgress(level);
  setProgress?.(p);
  // Ziel-Anzeige oben soll sichtbar sein, nicht hinter Erklärfenstern.
  if (explainer && q.get('explain') !== '1') {
    for (const k of ['merge', 'merge5', 'street', 'tools', 'gifts', 'gates', 'ads', 'tool-cost', 'gold-used']) explainer.mark?.(k);
  }
  await (play?.({ campaign: level }) ?? Promise.resolve());
}
