// Bridge to native app features (Capacitor iOS/Android shell, repo squish-app).
// In a normal browser window.Capacitor is missing, so every call here is a
// silent no-op (or uses the web fallback) and the web game behaves as before.
// The shell loads Capacitor's core runtime (capacitor.js) before the game,
// which provides Capacitor.registerPlugin(); plugins are looked up by name so
// this file needs no bundler and no npm imports.
const cap=globalThis.Capacitor;
export const isNative=Boolean(cap?.isNativePlatform?.());
export const platform=isNative?cap.getPlatform():'web';
const cache=new Map();
function plugin(name) {
  if(!isNative||!cap.isPluginAvailable?.(name))return null;
  if(!cache.has(name))cache.set(name,cap.Plugins?.[name]||cap.registerPlugin(name));
  return cache.get(name);
}
const quiet=promise=>{try{return Promise.resolve(promise).catch(()=>{});}catch{return Promise.resolve();}};

// ---------- haptics ----------
// Game kinds from haptics.mjs: tap, move, merge, big; plus gameover / win.
const IMPACT={tap:'LIGHT',move:'LIGHT',merge:'MEDIUM',big:'HEAVY'};
const NOTIFY={gameover:'WARNING',win:'SUCCESS',lose:'ERROR'};
export const hasNativeHaptics=Boolean(plugin('Haptics'));
export function haptic(kind='move') {
  const h=plugin('Haptics');if(!h)return false;
  if(kind in NOTIFY)void quiet(h.notification({type:NOTIFY[kind]}));
  else if(kind==='big'){void quiet(h.impact({style:'HEAVY'}));setTimeout(()=>void quiet(h.impact({style:'MEDIUM'})),90);}
  else void quiet(h.impact({style:IMPACT[kind]||'LIGHT'}));
  return true;
}

// ---------- share ----------
/** Opens the native share sheet (or the Web Share API) for a duel code. Resolves true if a sheet opened. */
export async function shareDuelCode(room) {
  const text=`Spiel ein Duell gegen mich in Squish Attack! Mein Code: ${room}`;
  const share=plugin('Share');
  try{
    if(share){await share.share({title:'Squish Attack Duell',text,dialogTitle:'Duell-Code teilen'});return true;}
    if(typeof navigator!=='undefined'&&typeof navigator.share==='function'){await navigator.share({title:'Squish Attack Duell',text});return true;}
  }catch{return true;} // user closed the sheet
  return false;
}
export const canShare=Boolean(plugin('Share'))||(typeof navigator!=='undefined'&&typeof navigator.share==='function');

// ---------- screen ----------
let awake=false;
/** Keep the display on while a run is being played (released on pause/menu). */
export function keepAwake(on) {
  on=Boolean(on);if(on===awake)return;awake=on;
  const k=plugin('KeepAwake');if(!k)return;
  void quiet(on?k.keepAwake():k.allowSleep());
}

// ---------- lifecycle ----------
/** cb() when the app goes to the background (before iOS may suspend it). */
export function onPause(cb){const a=plugin('App');if(a)void quiet(a.addListener('pause',()=>{try{cb();}catch{}}));}
export function onResume(cb){const a=plugin('App');if(a)void quiet(a.addListener('resume',()=>{try{cb();}catch{}}));}
/** Android back button. cb() returns true if it handled it; otherwise the app goes to the background. */
export function onBackButton(cb) {
  const a=plugin('App');if(!a||platform!=='android')return;
  void quiet(a.addListener('backButton',()=>{let handled=false;try{handled=cb();}catch{}if(!handled)void quiet(a.minimizeApp());}));
}

// ---------- game services (prepared, inactive) ----------
// Game Center (iOS) / Play Games (Android) need App Store Connect / Play Console
// leaderboards first. Then install a plugin that registers as "GameConnect"
// (e.g. @openforge/capacitor-game-connect) and set the ids below. Until then this is a no-op.
export const GAME_SERVICES={leaderboardIos:'',leaderboardAndroid:''};
export function submitLeaderboardScore(score) {
  const g=plugin('GameConnect');
  const id=platform==='ios'?GAME_SERVICES.leaderboardIos:GAME_SERVICES.leaderboardAndroid;
  if(!g||!id||!Number.isSafeInteger(score)||score<=0)return false;
  void quiet(g.submitScore({leaderboardID:id,totalScoreAmount:score}));
  return true;
}

// ---------- startup ----------
if(isNative){
  document.documentElement.classList.add('is-native-app',`is-${platform}`);
  void quiet(plugin('StatusBar')?.hide());
  // The HTML boot splash looks like the native one, so hand over right away.
  const hide=()=>void quiet(plugin('SplashScreen')?.hide({fadeOutDuration:250}));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hide,{once:true});else hide();
}
if(typeof window!=='undefined')window.SquishNative={isNative,platform,hasNativeHaptics,canShare};
