// Short haptic ticks. Android/Chrome use navigator.vibrate; iOS Safari 17.4+
// has no vibrate API, but toggling an <input type=checkbox switch> through its
// label also plays the iOS system "switch" click. That click is gated by
// enabled (Einstellungen > Vibration). On iPhone the default is off, because
// the system click is easy to mistake for a game sound.
import {ios} from './flags.mjs?v=launch-2';
const KEY='squish-haptics-v1';
const PATTERNS={tap:[6],move:[9],merge:[16,60,16],big:[24,60,24,60,34]};
const TICKS={tap:1,move:1,merge:2,big:3};
const RANK={tap:0,move:1,merge:2,big:3};

export function createHaptics({page=document,storage=globalThis.localStorage}={}) {
  let enabled=true;
  try{
    const stored=storage?.getItem(KEY);
    enabled=ios?stored==='1':stored!=='0';
  }catch{enabled=!ios;}
  const vibrate=typeof navigator.vibrate==='function'?navigator.vibrate.bind(navigator):null;
  const listeners=new Set();
  let label=null,timers=[],lastAt=-1e9,lastRank=-1;
  function ensureSwitch() {
    if(!enabled)return null;
    if(label||vibrate)return label;
    label=page.createElement('label');label.className='haptic-switch';label.setAttribute('aria-hidden','true');
    const input=page.createElement('input');input.type='checkbox';input.setAttribute('switch','');input.tabIndex=-1;
    for(const type of ['click','change','input'])label.addEventListener(type,event=>event.stopPropagation());
    label.append(input);page.body.append(label);return label;
  }
  function tick(){try{label?.click();}catch{}}
  function pulse(kind='move') {
    if(!enabled||!(kind in TICKS))return false;
    const now=performance.now(),rank=RANK[kind];
    // Rate limit: one pattern at a time; only a stronger one may cut in.
    if(now-lastAt<(rank>lastRank?45:110))return false;
    lastAt=now;lastRank=rank;
    if(vibrate){try{vibrate(PATTERNS[kind]);}catch{}return true;}
    if(!ensureSwitch())return false;
    timers.forEach(clearTimeout);timers=[];
    tick();for(let i=1;i<TICKS[kind];i++)timers.push(setTimeout(tick,i*60));
    return true;
  }
  return {
    pulse,
    prime(){if(enabled)ensureSwitch();},
    get enabled(){return enabled;},
    set enabled(value) {
      enabled=Boolean(value);try{storage?.setItem(KEY,enabled?'1':'0');}catch{}
      listeners.forEach(fn=>fn(enabled));if(enabled)pulse('merge');
    },
    toggle(){this.enabled=!enabled;return enabled;},
    onChange(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
    get supported(){return Boolean(vibrate)||'switch' in (page.createElement('input'));},
  };
}
