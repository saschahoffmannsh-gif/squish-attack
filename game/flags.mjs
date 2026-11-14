export const BUILD='launch-1';
// URL kill-switches and a conservative default for iOS/mobile.
//   ?debug=1        on-screen heartbeat / fps / last error
//   ?nofusion=1     skip the gel fusion (old short merge)
//   ?noworker=1     mesh fusion on the main thread
//   ?noprewarm=1    no off-screen blob priming / compileAsync
//   ?prewarm=1      force prewarm even on phones
//   ?nosound=1      mute and skip all audio fetch/decode
const params=typeof location!=='undefined'?new URLSearchParams(location.search):new URLSearchParams();
const has=name=>params.has(name);
const ua=typeof navigator!=='undefined'?navigator.userAgent||'':'';
export const ios=/iP(hone|ad|od)/.test(ua)||((typeof navigator!=='undefined'?navigator.platform:'')==='MacIntel'&&(navigator.maxTouchPoints||0)>1);
export const safari=/\bSafari\//.test(ua)&&!/\b(Chrome|Chromium|CriOS|Edg|FxiOS|OPiOS|HeadlessChrome)\//.test(ua);
export const mobile=ios||(typeof matchMedia==='function'&&matchMedia('(max-width:700px), (pointer:coarse)').matches);
// On phones we skip idle prewarm and compileAsync unless ?prewarm=1.
const wantPrewarm=has('prewarm');
export const flags=Object.freeze({
  debug:has('debug'),
  nofusion:has('nofusion'),
  noworker:has('noworker'),
  noprewarm:has('noprewarm')||(!wantPrewarm&&mobile),
  nosound:has('nosound'),
  ios,safari,mobile,
});
export function flagSummary(){
  return {build:BUILD,debug:flags.debug,nofusion:flags.nofusion,noworker:flags.noworker,noprewarm:flags.noprewarm,nosound:flags.nosound,ios,safari,mobile};
}
if(typeof window!=='undefined')window.SquishFlags=flagSummary();
