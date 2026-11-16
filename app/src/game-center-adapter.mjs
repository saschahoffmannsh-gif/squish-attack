// Game-Center-Adapter für game/game-center.mjs, über @bavrk/capacitor-game-center
// (Capacitor.Plugins.GameCenter). Jede Methode fängt Fehler; ein abgelehnter
// Dialog blockiert das Spiel nicht.

export function createGameCenterAdapter({ GameCenter, log = () => {} } = {}) {
  let signedIn = false;
  const listeners = new Set();

  const emit = () => {
    for (const fn of listeners) { try { fn(signedIn); } catch { /* ignore */ } }
  };

  if (typeof GameCenter?.addListener === 'function') {
    try {
      GameCenter.addListener('signedIn', (state) => {
        signedIn = !!state?.signedIn;
        emit();
      }).catch(e => log('gc listener', e));
    } catch (e) { log('gc listener', e); }
  }

  return {
    name: 'gamecenter',
    isAvailable: () => true,
    isSignedIn: () => signedIn,
    onSignedIn(fn) {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async signIn() {
      try {
        const r = await GameCenter.signIn();
        signedIn = !!r?.signedIn;
        emit();
        return { signedIn, error: r?.error };
      } catch (e) {
        log('gc signIn', e);
        signedIn = false;
        emit();
        return { signedIn: false, error: String(e?.message || e) };
      }
    },
    async submitScore(leaderboardId, value) {
      const n = Math.floor(Number(value) || 0);
      if (n <= 0 || !signedIn) return;
      try {
        await GameCenter.submitScore({ leaderboard: leaderboardId, value: n });
      } catch (e) { log('gc score', e); }
    },
    async reportAchievements(ids) {
      const list = [...new Set((ids || []).filter(Boolean))];
      if (!list.length || !signedIn) return;
      try {
        await GameCenter.reportAchievements({ ids: list });
      } catch (e) { log('gc achievements', e); }
    },
    async show(view = 'dashboard', leaderboardId) {
      try {
        await GameCenter.show(leaderboardId ? { leaderboard: leaderboardId } : { view });
      } catch (e) { log('gc show', e); }
    },
  };
}
