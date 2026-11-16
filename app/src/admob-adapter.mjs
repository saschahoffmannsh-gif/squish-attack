// AdMob-Adapter für game/native-ads.mjs (registerNativeAds). Kein Import, das Plugin kommt aus der
// Capacitor-Brücke (Capacitor.Plugins.AdMob). Reihenfolge beim ersten Start:
//   initialize → UMP-Einwilligung (requestConsentInfo / showConsentForm) → ATT → Anzeigen nur bei canRequestAds.
// Belohnung nur, wenn der Clip bis zum Ende lief (das Plugin lehnt sonst mit REWARDED_AD_CANCELLED ab).
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
export function createAdMobAdapter({ AdMob, ids, testing = true, ready = Promise.resolve({ canRequestAds: true }), dismissTimeoutMs = 120000, log = () => {} } = {}) {
  let showing = false;
  const canShow = async () => { try { return !!(await ready)?.canRequestAds; } catch { return false; } };
  return {
    name: 'admob',
    get showing() { return showing; },
    async showRewarded({ placement = 'tool' } = {}) {
      if (showing) return { ok: false };
      showing = true;   // sofort, damit nie zwei Clips gleichzeitig laufen
      try {
        if (!(await canShow())) return { ok: false };
        await AdMob.prepareRewardVideoAd({ adId: ids.rewardedId, isTesting: !!testing });
        const closed = onceEvent(AdMob, EVENTS.rewardDismissed, dismissTimeoutMs);
        let reward = null;
        try { reward = await AdMob.showRewardVideoAd(); } catch (e) { log('rewarded ' + placement, e); }
        if (reward) await closed;   // erst weiter, wenn der Clip zu ist
        return { ok: !!reward };
      } catch (e) { log('rewarded load ' + placement, e); return { ok: false }; }
      finally { showing = false; }
    },
    async showInterstitial({ placement = 'level' } = {}) {
      if (showing) return { ok: false };
      showing = true;   // sofort, damit nie zwei Clips gleichzeitig laufen
      try {
        if (!(await canShow())) return { ok: false };
        await AdMob.prepareInterstitial({ adId: ids.interstitialId, isTesting: !!testing });
        const closed = onceEvent(AdMob, EVENTS.interstitialDismissed, dismissTimeoutMs);
        await AdMob.showInterstitial();
        await closed;
        return { ok: true };
      } catch (e) { log('interstitial ' + placement, e); return { ok: false }; }
      finally { showing = false; }
    },
  };
}
