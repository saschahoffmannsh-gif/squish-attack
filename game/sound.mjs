import {flags,ios,safari,BUILD} from './flags.mjs?v=launch-2';
// Sampled gel foley. Fetching is optional and never holds up the splash;
// the AudioContext is created/resumed only by a real player gesture.
// Slide/land use ralph.whitehead's CC0 Plunger Pop (#05); merge/pop use Gniffelbaf's CC0 balloon burst.
// See ./assets/audio/CREDITS.txt.

const AUDIO_ROOT=new URL('./assets/audio/',import.meta.url);
const FOLEY_VERSION='foley-v4';
const COMPRESSED=['ogg','m4a','mp3'];

function canPlay(type){
  try{return document.createElement('audio').canPlayType(type)||'';}catch{return '';}
}

export function preferredFoleyExt(){
  // Safari cannot decode ogg/vorbis. A hung decodeAudioData on a rejected or
  // never-settling ogg was a suspect for the freeze right as landing sounds
  // started, so iOS/Safari always take m4a then mp3.
  if(ios||safari){
    const m4a=canPlay('audio/mp4; codecs="mp4a.40.2"')||canPlay('audio/mp4')||canPlay('audio/aac');
    return m4a?'m4a':'mp3';
  }
  const rank=t=>t.startsWith('probably')?2:t.startsWith('maybe')?1:0;
  const ogg=rank(canPlay('audio/ogg; codecs="vorbis"')||canPlay('audio/ogg'));
  const m4a=rank(canPlay('audio/mp4; codecs="mp4a.40.2"')||canPlay('audio/mp4')||canPlay('audio/aac'));
  const mp3=rank(canPlay('audio/mpeg'));
  if(ogg>=m4a&&ogg>=mp3&&ogg)return 'ogg';
  if(m4a>=mp3&&m4a)return 'm4a';
  return 'mp3';
}

function extOrder(){
  const first=preferredFoleyExt();
  return [first,...COMPRESSED.filter(ext=>ext!==first)];
}

function wavUrl(name){const u=new URL(`plop-v3/${name}.wav`,AUDIO_ROOT);u.searchParams.set('v',BUILD);return u.href;}
function foleyUrl(name,ext){const u=new URL(`${FOLEY_VERSION}/${name}.${ext}`,AUDIO_ROOT);u.searchParams.set('v',BUILD);return u.href;}

function cupOrder(){
  // Prefer the 16-bit wav of ralph.whitehead plunger pop #05 (reliable on iOS, no encoder padding).
  if(ios||safari)return ['wav','m4a','mp3'];
  const first=preferredFoleyExt();
  return ['wav',first,...COMPRESSED.filter(ext=>ext!==first)];
}

export const FOLEY_FILES=Object.freeze({
  plop:wavUrl('plop'),
  suction:wavUrl('suction'),
  count:wavUrl('count'),
  cup:foleyUrl('slide',cupOrder()[0]),
  burst:foleyUrl('burst',preferredFoleyExt()),
});
export const MAX_SOUND_VOICES=16;
const LAND_WINDOW=40,LAND_MAX=2,SLIDE_DUP=18,PENDING_LIFE=800;
const SFX_LOG=typeof location!=='undefined'&&/\bsfxlog=1\b/.test(location.search||'');

export function createGameSound(button,{
  fetch:fetchAudio=globalThis.fetch.bind(globalThis),
  now=()=>performance.now(),
  audioContext:AudioContextCtor=globalThis.AudioContext||globalThis.webkitAudioContext,
  page=globalThis.document,
  storage=globalThis.localStorage,
}={}) {
  const key='squish-sound-v1';
  let enabled=storage?.getItem(key)!=='off',context=null,master=null,paused=false,disposed=false;
  let lastRecord=0,countVoice=null,duckUntil=0,lastSlideAt=-1e3;
  const bytes=new Map(),buffers=new Map(),voices=new Set(),pending=[],lastPlays=[];
  const controller=new AbortController(),signal=controller.signal;
  let loadPromise=null,landMarks=[],flushing=false;

  function notePlay(entry){
    lastPlays.push(entry);if(lastPlays.length>16)lastPlays.shift();
    if(SFX_LOG)console.info('[sfx]',entry.kind,entry.name||'',`size=${entry.size??0}`,`rate=${entry.rate??1}`,`vol=${entry.volume??0}`,`delay=${entry.delay??0}`);
  }

  function render(){
    if(!button)return;
    button.setAttribute('aria-pressed',enabled?'true':'false');
    button.setAttribute('aria-label',enabled?'Ton aus':'Ton an');
    button.textContent=enabled?'♪':'♪̸';
  }

  async function unlock(){
    if(flags.nosound||!enabled||disposed||!AudioContextCtor)return false;
    if(!context){
      context=new AudioContextCtor();
      master=context.createGain();
      const limit=context.createDynamicsCompressor();
      limit.threshold.value=-12;limit.knee.value=8;limit.ratio.value=6;
      limit.attack.value=.003;limit.release.value=.12;
      master.connect(limit);limit.connect(context.destination);
    }
    if(context.state==='suspended'){
      try{await Promise.race([context.resume(),new Promise(r=>setTimeout(r,800))]);}catch{}
    }
    // Never await decode on the gesture / game path: a stuck decodeAudioData
    // must not block landings or the start of a round.
    void decode().then(()=>{if(context?.state==='running')flushQueue();}).catch(()=>{});
    if(context.state==='running')flushQueue();
    return context.state==='running';
  }

  async function preload(){
    if(flags.nosound)return;
    if(loadPromise)return loadPromise;
    loadPromise=(async()=>{
      const jobs=[
        loadNamed('cup',cupOrder().map(ext=>foleyUrl('slide',ext))),
        loadNamed('burst',extOrder().map(ext=>foleyUrl('burst',ext))),
        loadNamed('plop',[wavUrl('plop')]),
        loadNamed('suction',[wavUrl('suction')]),
        loadNamed('count',[wavUrl('count')]),
      ];
      await Promise.all(jobs);
      if(SFX_LOG)console.info('[sfx] loaded',[...bytes.keys()],`ext=${preferredFoleyExt()}`);
    })();
    return loadPromise;
  }

  async function loadNamed(name,urls){
    for(const url of urls){
      try{
        const response=await fetchAudio(url,{cache:'force-cache',signal});
        if(!response.ok)continue;
        const data=await response.arrayBuffer();
        if(disposed)return;
        bytes.set(name,data);
        if(SFX_LOG)console.info('[sfx] fetched',name,url,data.byteLength);
        return;
      }catch(error){
        if(error?.name==='AbortError')return;
        if(SFX_LOG)console.warn('[sfx] miss',name,url,error);
      }
    }
    if(SFX_LOG)console.warn('[sfx] missing',name);
  }

  async function decode(){
    if(!context)return;
    await preload();
    const jobs=[];
    for(const [name,data] of bytes){
      if(buffers.has(name))continue;
      const work=context.decodeAudioData(data.slice(0)).then(buffer=>{
        if(!disposed)buffers.set(name,buffer);
      }).catch(error=>{
        if(SFX_LOG)console.warn('[sfx] decode',name,error);
      });
      const timeout=new Promise(resolve=>setTimeout(resolve,2500));
      jobs.push(Promise.race([work,timeout]));
    }
    if(jobs.length)await Promise.all(jobs);
  }

  function dump(name){
    // AudioBufferSourceNode is one-shot. Reusing a started node throws
    // InvalidStateError on iOS Safari (often when assigning .buffer).
    const source=context.createBufferSource();
    const gain=context.createGain();
    const panner=context.createStereoPanner();
    source.connect(gain);gain.connect(panner);panner.connect(master);
    const voice={name,buffer:source,gain,panner,priority:0,started:0};
    source.onended=()=>release(voice);
    return voice;
  }

  function release(voice){
    if(!voices.delete(voice))return;
    try{voice.buffer.stop();}catch{}
    try{voice.buffer.disconnect();voice.gain.disconnect();voice.panner.disconnect();}catch{}
    voice.buffer.onended=null;
    if(countVoice===voice)countVoice=null;
  }

  function overflow(){
    if(voices.size<=MAX_SOUND_VOICES)return;
    const surplus=[...voices].filter(voice=>voice!==countVoice).sort((a,b)=>a.priority-b.priority||a.started-b.started);
    release(surplus[0]);
  }

  function roundedRate(value){return Math.round(value*20)/20;}

  function sample(name,{volume=1,rate=1,pan=0,delay=0,loop=false,priority=0}={}){
    try{
      if(!enabled||paused||!context||context.state!=='running')return null;
      const data=buffers.get(name);if(!data)return null;
      const safeRate=Number.isFinite(rate)&&rate>0?rate:1;
      const safePan=Number.isFinite(pan)?Math.max(-1,Math.min(1,pan)):0;
      const safeDelay=Number.isFinite(delay)&&delay>0?delay:0;
      const safeVol=Number.isFinite(volume)?volume:0;
      const at=context.currentTime+safeDelay;
      const when=at>context.currentTime?at:context.currentTime;
      const voice=dump(name);
      voice.priority=priority;voice.started=when;
      voice.buffer.buffer=data;voice.buffer.loop=!!loop;
      voice.buffer.playbackRate.value=safeRate;
      const ducked=when<duckUntil&&priority<3?Math.max(.18,safeVol*.38):safeVol;
      const fade=.004,gain=Math.max(.0001,ducked);
      voice.gain.gain.setValueAtTime(.0001,when);
      voice.gain.gain.linearRampToValueAtTime(gain,when+fade);
      if(!loop){
        const end=when+Math.max(fade*2,data.duration/Math.max(.05,safeRate));
        voice.gain.gain.setValueAtTime(gain,Math.max(when+fade,end-fade));
        voice.gain.gain.linearRampToValueAtTime(.0001,end);
      }
      if('pan' in voice.panner)voice.panner.pan.setValueAtTime(safePan,when);
      voice.buffer.start(when);
      voices.add(voice);overflow();
      return voice;
    }catch(error){
      if(SFX_LOG)console.warn('[sfx] sample',name,error);
      return null;
    }
  }

  function sampleName(kind){
    return kind==='land'||kind==='slide'?'cup':kind==='merge'||kind==='flow'||kind==='pop'?'burst':kind==='squish'||kind==='tap'?'plop':kind==='record'?'suction':kind==='collect'?'count':kind;
  }

  function enqueue(kind,size,{combo=1,pan=0,requestedAt}={}){
    pending.push({kind,size,combo,pan,at:requestedAt??now()});
    if(pending.length>24)pending.shift();
  }

  function flushQueue(){
    if(flushing||!context||context.state!=='running')return;
    flushing=true;
    try{
      const items=pending.splice(0),tNow=now();
      const fresh=items.filter(e=>tNow-e.at<PENDING_LIFE);
      if(!fresh.length)return;
      const t0=fresh[0].at;
      for(const e of fresh){
        play(e.kind,e.size,{combo:e.combo,pan:e.pan,requestedAt:e.at,delay:Math.max(0,(e.at-t0)/1000),fromQueue:true});
      }
    }finally{flushing=false;}
  }

  function stop(){for(const voice of [...voices])release(voice);pending.length=0;}

  function play(kind,size=1,{combo=1,pan=0,requestedAt,delay=0,fromQueue=false}={}){
    try{
    if(flags.nosound||!enabled||paused||disposed){
      notePlay({kind,name:sampleName(kind),skipped:'off',t:requestedAt??now()});
      return;
    }
    const kick=unlock();
    if(!context||context.state!=='running'){
      enqueue(kind,size,{combo,pan,requestedAt});
      notePlay({kind,name:sampleName(kind),skipped:'locked',t:requestedAt??now()});
      void Promise.resolve(kick).then(ok=>{if(ok)flushQueue();}).catch(()=>{});
      return;
    }
    const need=kind==='land'||kind==='slide'?'cup':kind==='merge'||kind==='flow'||kind==='pop'?'burst':kind==='squish'||kind==='tap'?'plop':kind==='record'?'suction':kind==='collect'?'count':null;
    if(need&&!buffers.has(need)){
      enqueue(kind,size,{combo,pan,requestedAt});
      notePlay({kind,name:sampleName(kind),skipped:'decode',t:requestedAt??now()});
      void decode().then(()=>flushQueue()).catch(()=>{});
      return;
    }
    const level=size>=5?1.18:size===4?1.08:1;
    const pitch=size>=5?.86:size===4?.93:1;
    if(kind==='collect')return collect();
    if(kind==='slide'){
      const at=requestedAt??now();
      if(at-lastSlideAt<SLIDE_DUP){
        notePlay({kind,name:'cup',skipped:'dup',t:at});
        return;
      }
      lastSlideAt=at;
      const rate=roundedRate(.94+Math.random()*.14);
      const volume=.34+.08*Math.random();
      const voice=sample('cup',{volume,rate,pan,delay,priority:1});
      notePlay({kind,name:'cup',size,rate,volume:+volume.toFixed(3),delay,t:at,skipped:voice?undefined:'failed'});
      return;
    }
    if(kind==='land'){
      // Only thin when more than two landings share a ~40 ms window.
      const at=requestedAt??now();
      landMarks=landMarks.filter(mark=>at-mark<LAND_WINDOW);
      if(landMarks.length>=LAND_MAX){notePlay({kind,name:'cup',skipped:'land-thin',t:at});return;}
      landMarks.push(at);
      const rate=roundedRate(.92+Math.random()*.16);
      const volume=.30+.06*Math.random();
      const voice=sample('cup',{volume,rate,pan,delay,priority:1});
      notePlay({kind,name:'cup',size,rate,volume:+volume.toFixed(3),delay,t:at,skipped:voice?undefined:'failed'});
      return;
    }
    if(kind==='squish'){
      const volume=.16*level,rate=roundedRate(.9+Math.random()*.12);
      sample('plop',{volume,rate,pan,priority:1});
      notePlay({kind,name:'plop',size,rate,volume,t:now()});
      return;
    }
    if(kind==='merge'||kind==='flow'||kind==='pop'){
      // Balloon burst, fired by the caller at the fusion pop (or a menu/duel pop).
      const large=size>=5,quad=size===4;
      const rate=roundedRate(pitch*(large?.82:quad?.90:kind==='flow'?.96:1));
      const volume=(large?.64:quad?.54:kind==='pop'?.50:.48)*level;
      sample('burst',{volume,rate,pan,priority:2});
      notePlay({kind,name:'burst',size,rate,volume,t:now(),layer:1});
      if(quad||large){
        const layerRate=roundedRate(pitch*(large?.70:.80));
        const layerVolume=large?.24:.14;
        sample('burst',{volume:layerVolume,rate:layerRate,pan,delay:large?.05:.04,priority:2});
        notePlay({kind,name:'burst',size,rate:layerRate,volume:layerVolume,delay:large?.05:.04,t:now(),layer:2});
      }
      return;
    }
    if(kind==='record'){
      const at=context.currentTime;if(at-lastRecord<.65)return;lastRecord=at;
      duckUntil=at+.6;
      for(const voice of [...voices])if(voice.priority===3)release(voice);
      [.76,1.10,.92,1.24].forEach((rate,index)=>sample(index%2?'plop':'suction',{
        volume:index===0 ? .43 : .24,rate:roundedRate(rate*pitch),delay:index*.095,priority:3}));
      if(countVoice){const gain=countVoice.gain.gain;gain.cancelScheduledValues(at);gain.setTargetAtTime(.13,at,.02);}
      notePlay({kind,name:'record',size,t:now()});
      return;
    }
    const volume=.28*level,rate=pitch;
    sample('plop',{volume,rate,pan,priority:2});
    notePlay({kind,name:'plop',size,rate,volume,t:now()});
    }catch{}
  }

  function collect(){
    if(!enabled||paused||!context||context.state!=='running'){void unlock().then(ok=>{if(ok)collect();}).catch(()=>{});return;}
    if(countVoice)return;
    const at=context.currentTime;
    countVoice=sample('count',{volume:.22,rate:1,loop:true,priority:0});
    if(countVoice){
      countVoice.gain.gain.setValueAtTime(.0001,at);
      countVoice.gain.gain.linearRampToValueAtTime(.22,at+.08);
    }
  }

  function endCollect(){
    if(!countVoice||!context)return;
    const at=context.currentTime,voice=countVoice,gain=voice.gain.gain;
    gain.cancelScheduledValues(at);gain.setValueAtTime(gain.value,at);gain.linearRampToValueAtTime(.0001,at+.18);
    try{voice.buffer.stop(at+.2);}catch{}
    countVoice=null;
  }

  function visibility(){if(page.hidden)stop();}
  function toggle(){
    enabled=!enabled;
    try{storage?.setItem(key,enabled?'on':'off');}catch{}
    if(!enabled)stop();render();
    if(enabled)void unlock();
  }
  function onGesture(){void unlock();}
  button?.addEventListener('click',toggle);page?.addEventListener('visibilitychange',visibility);
  page?.addEventListener('pointerdown',onGesture,{capture:true});
  render();
  // On iOS, wait for a real gesture before fetching/decoding, so start-of-round
  // landings cannot pile up onto a stuck decodeAudioData.
  if(enabled&&!flags.nosound&&!ios)void preload();
  return {
    unlock,play,collect,endCollect,stop,preload,flushQueue,
    pause(){paused=true;stop();},resume(){paused=false;},
    dispose(){if(disposed)return;stop();disposed=true;controller.abort();
      button?.removeEventListener('click',toggle);page?.removeEventListener('visibilitychange',visibility);
      page?.removeEventListener('pointerdown',onGesture,{capture:true});
      try{void context?.close().catch(()=>{});}catch{}bytes.clear();buffers.clear();},
    get enabled(){return enabled;},
    get stats(){return {
      loaded:buffers.size||bytes.size,
      names:[...new Set([...bytes.keys(),...buffers.keys()])],
      decoded:[...buffers.keys()],
      voices:voices.size,counting:!!countVoice,state:context?.state||'locked',paused,
      ext:preferredFoleyExt(),cup:cupOrder()[0],build:BUILD,lastPlays,files:FOLEY_FILES,
    };},
  };
}
