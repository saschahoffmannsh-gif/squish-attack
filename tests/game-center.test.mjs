import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACHIEVEMENTS, ACHIEVEMENT_IDS, ENDLESS_LEADERBOARD_ID, ENDLESS_LEADERBOARD,
  achievementPointsTotal, earnedAchievements, registerGameCenter,
  isGameCenterAvailable, isGameCenterSignedIn, canShowGameCenter,
  signInGameCenter, showGameCenter, submitEndlessScore, unlockAchievements,
  syncGameCenter, setGameCenterSources, noteFiveMerge, noteStreet,
  GC_FLAGS_KEY,
} from '../game/game-center.mjs';

const mem = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};
const progress = levels => ({ levels: Object.fromEntries(
  Object.entries(levels).map(([id, stars]) => [String(id), { stars, moves: 5, at: 1 }]),
) });

test('Katalog: 16 Erfolge, eindeutige IDs, 100 Punkte, eine Endlos-Bestenliste', () => {
  assert.equal(ACHIEVEMENTS.length, 16);
  assert.equal(new Set(ACHIEVEMENT_IDS).size, 16);
  assert.equal(achievementPointsTotal(), 100);
  assert.equal(ENDLESS_LEADERBOARD_ID, 'squish.lb.endless');
  assert.equal(ENDLESS_LEADERBOARD.sort, 'highToLow');
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.id.startsWith('squish.ach.'));
    assert.ok(a.points > 0);
    assert.ok(a.title.de && a.title.en && a.description.de && a.description.en);
  }
  assert.ok(ACHIEVEMENT_IDS.includes('squish.ach.tutorial'));
  assert.ok(ACHIEVEMENT_IDS.includes('squish.ach.chapter10'));
  assert.ok(ACHIEVEMENT_IDS.includes('squish.ach.first5'));
  assert.ok(ACHIEVEMENT_IDS.includes('squish.ach.firstStreet'));
  assert.ok(ACHIEVEMENT_IDS.includes('squish.ach.perfectChapter'));
  assert.ok(ACHIEVEMENT_IDS.includes('squish.ach.endless1000'));
  assert.ok(ACHIEVEMENT_IDS.includes('squish.ach.endless5000'));
});

test('earnedAchievements: Tutorial, Kapitel, 5er/Straße rückwirkend, Perfekt, Endlos', () => {
  assert.deepEqual(earnedAchievements(progress({})), []);
  assert.deepEqual(earnedAchievements(progress({ 5: 1 })), [
    'squish.ach.tutorial', 'squish.ach.first5', 'squish.ach.firstStreet',
  ]);
  assert.deepEqual(earnedAchievements(progress({ 4: 1 })), ['squish.ach.first5']);
  const ch1 = {};
  for (let i = 1; i <= 10; i++) ch1[i] = 1;
  const ids = earnedAchievements(progress(ch1));
  assert.ok(ids.includes('squish.ach.chapter1'));
  assert.ok(!ids.includes('squish.ach.chapter2'));
  assert.ok(!ids.includes('squish.ach.perfectChapter'));
  const perfect = {};
  for (let i = 11; i <= 20; i++) perfect[i] = 3;
  assert.ok(earnedAchievements(progress(perfect)).includes('squish.ach.perfectChapter'));
  assert.ok(earnedAchievements(progress(perfect)).includes('squish.ach.chapter2'));
  assert.deepEqual(earnedAchievements(null, { sawFiveMerge: true, sawStreet: true, bestEndless: 5000 }), [
    'squish.ach.first5', 'squish.ach.firstStreet', 'squish.ach.endless1000', 'squish.ach.endless5000',
  ]);
  assert.deepEqual(earnedAchievements(null, { bestEndless: 1000 }), ['squish.ach.endless1000']);
  assert.deepEqual(earnedAchievements(null, { bestEndless: 999 }), []);
});

test('Web ohne Adapter: alles No-Op, Spiel wird nicht blockiert', async () => {
  registerGameCenter(null);
  setGameCenterSources({ storage: mem() });
  assert.equal(isGameCenterAvailable(), false);
  assert.equal(isGameCenterSignedIn(), false);
  assert.equal(canShowGameCenter(), false);
  assert.equal((await signInGameCenter()).signedIn, false);
  assert.equal((await showGameCenter()).ok, false);
  assert.equal((await submitEndlessScore(1200)).reason, 'unavailable');
  assert.equal((await unlockAchievements(['squish.ach.tutorial'])).reason, 'unavailable');
  const r = await syncGameCenter({ progress: progress({ 5: 1 }), bestEndless: 0 });
  assert.deepEqual(r.ids, ['squish.ach.tutorial', 'squish.ach.first5', 'squish.ach.firstStreet']);
  assert.equal(r.reported, false);
});

test('Adapter: Freischalten und Score nur mit Anmeldung; unbekannte IDs fallen weg', async () => {
  const calls = [];
  let signedIn = true;
  registerGameCenter({
    isAvailable: () => true,
    isSignedIn: () => signedIn,
    submitScore: async (id, value) => { calls.push(['score', id, value]); },
    reportAchievements: async (ids) => { calls.push(['unlock', ids]); },
    show: async (view) => { calls.push(['show', view]); },
  });
  setGameCenterSources({ storage: mem() });
  assert.equal(isGameCenterAvailable(), true);
  assert.equal(canShowGameCenter(), true);
  const u = await unlockAchievements(['squish.ach.tutorial', 'nope', 'squish.ach.tutorial']);
  assert.deepEqual(u.ids, ['squish.ach.tutorial']);
  const s = await submitEndlessScore(2500.9);
  assert.deepEqual(s, { ok: true, value: 2500 });
  await showGameCenter('achievements');
  assert.deepEqual(calls, [
    ['unlock', ['squish.ach.tutorial']],
    ['score', ENDLESS_LEADERBOARD_ID, 2500],
    ['show', 'achievements'],
  ]);
  assert.equal((await submitEndlessScore(0)).reason, 'skip');
  registerGameCenter(null);
});

test('noteFiveMerge merkt die Flag und syncs Erfolge', async () => {
  const storage = mem();
  const calls = [];
  registerGameCenter({
    isSignedIn: () => true,
    reportAchievements: async (ids) => { calls.push(ids); },
  });
  setGameCenterSources({ progress: () => progress({}), bestEndless: () => 0, storage });
  noteFiveMerge();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(JSON.parse(storage.getItem(GC_FLAGS_KEY)).five, true);
  assert.ok(calls.some(ids => ids.includes('squish.ach.first5')));
  noteStreet();
  await new Promise(r => setTimeout(r, 0));
  assert.ok(calls.some(ids => ids.includes('squish.ach.firstStreet')));
  registerGameCenter(null);
});
