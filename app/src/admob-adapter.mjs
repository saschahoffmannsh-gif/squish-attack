// AdMob-Adapter für game/native-ads.mjs (registerNativeAds). Kein Import, das Plugin kommt aus der
// Capacitor-Brücke (Capacitor.Plugins.AdMob). Reihenfolge beim ersten Start:
//   initialize → UMP-Einwilligung (requestConsentInfo / showConsentForm) → Anzeigen nur bei canRequestAds.
//   launch-32: ATT nicht mehr hier beim Start (askTracking:false), sondern nach dem ersten gelösten Level (att-prompt.mjs).
// launch-42: Belohnungsclips entfallen. showRewarded ist ein No-Op und lädt keine Rewarded-Einheit.
export const EVENTS = Object.freeze({
  rewardDismissed: 'onRewardedVideoAdDismissed',
  interstitialDismissed: 'interstitialAdDismissed',
});

function onceEvent(AdMob, name, timeoutMs) {
  let handle = null, timer = null;
  const done = new Promise(resolve => {
    timer = setTimeout(resolve, timeoutMs);
    Promise.resolve(AdMob.addListener?.(name, () => resolve())).then(h => { handle = h; }).catch(() => {});
  });
  return done.finally(() => { clearTimeout(timer); try { handle?.remove?.(); } catch {} });
}

export async function setupConsent(AdMob, { askTracking = true, testing = true, log = () => {} } = {}) {
  const state = { initialized: false, canRequestAds: false, consent: null, tracking: null, privacyOptions: false };
  try { await AdMob.initialize({ initializeForTesting: !!testing }); state.initialized = true; }
  catch (e) { log('admob init', e); return state; }
  try {
    let info = await AdMob.requestConsentInfo({});
    if (info?.isConsentFormAvailable && info.status === 'REQUIRED') info = await AdMob.showConsentForm();
    state.consent = info?.status ?? null;
    state.canRequestAds = info?.canRequestAds !== false;
    state.privacyOptions = info?.privacyOptionsRequirementStatus === 'REQUIRED';
  } catch (e) { log('consent', e); state.canRequestAds = true; }   // UMP nicht erreichbar → Google entscheidet serverseitig (nicht personalisiert)
  if (askTracking) {
    try {
      const t = await AdMob.trackingAuthorizationStatus();
      if (t?.status === 'notDetermined') await AdMob.requestTrackingAuthorization();
      state.tracking = (await AdMob.trackingAuthorizationStatus())?.status ?? null;
    } catch (e) { log('att', e); }
  }
  return state;
}

/**
 * @param AdMob   Capacitor-Plugin (oder Mock in Tests)
 * @param ready   Promise<{canRequestAds}> aus setupConsent
 * @param hooks   {onStart, onEnd} – z. B. Spiel-Ton aus/an (das Spiel macht das zusätzlich selbst)
 */
const limit = (p, ms, what) => Promise.race([Promise.resolve(p), new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' timeout')), ms))]);
const offline = () => globalThis.navigator?.onLine === false;
// launch-31: nie auf dem Netz hängen bleiben. Ohne Netz, ohne Einwilligung in readyTimeoutMs oder ohne geladenen
// Clip in loadTimeoutMs → {ok:false, unavailable:true}; das Spiel überspringt die Werbung dann still.
export function createAdMobAdapter({ AdMob, ids, testing = true, ready = Promise.resolve({ canRequestAds: true }), dismissTimeoutMs = 120000,
  readyTimeoutMs = 3000, loadTimeoutMs = 8000, log = () => {} } = {}) {
  let showing = false;
  const canShow = async () => { if (offline()) return false; try { return !!(await limit(ready, readyTimeoutMs, 'consent'))?.canRequestAds; } catch { return false; } };
  const NA = { ok: false, unavailable: true };
  return {
    name: 'admob',
    get showing() { return showing; },
    async showRewarded() {
      // launch-42: bewusst ungenutzt, kein SDK-Aufruf.
      return { ok: false, unavailable: true };
    },
    async showInterstitial({ placement = 'level' } = {}) {
      if (showing) return { ok: false };
      showing = true;   // sofort, damit nie zwei Clips gleichzeitig laufen
      try {
        if (!(await canShow())) return NA;
        try { await limit(AdMob.prepareInterstitial({ adId: ids.interstitialId, isTesting: !!testing }), loadTimeoutMs, 'interstitial load'); }
        catch (e) { log('interstitial load ' + placement, e); return NA; }
        const closed = onceEvent(AdMob, EVENTS.interstitialDismissed, dismissTimeoutMs);
        await AdMob.showInterstitial();
        await closed;
        return { ok: true };
      } catch (e) { log('interstitial ' + placement, e); return NA; }
      finally { showing = false; }
    },
  };
}
