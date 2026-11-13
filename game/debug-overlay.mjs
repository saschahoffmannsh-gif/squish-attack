// Lightweight DOM overlay for iPhone freezes. Independent of the WebGL
// loop: a setInterval heartbeat keeps ticking even if requestAnimationFrame stops.
import {flags,flagSummary,BUILD} from './flags.mjs?v=speed-2';

const log=[];
function push(line){
  log.push(`${new Date().toISOString().slice(11,23)} ${line}`);
  if(log.length>8)log.shift();
  render();
}

let frames=0,last=performance.now(),fps=0,frameMs=0,beats=0,lost=0,restored=0,lastRaf=0;
const lastError={message:'–',at:'–'};

function hook(){
  const onError=(msg,src,line,col,err)=>{
    lastError.message=String(err?.stack||err||msg).slice(0,240);
    lastError.at=new Date().toISOString().slice(11,23);
    push('error '+lastError.message);
  };
  window.addEventListener('error',event=>onError(event.message,event.filename,event.lineno,event.colno,event.error));
  window.addEventListener('unhandledrejection',event=>{
    const reason=event.reason;
    lastError.message=('rejection '+String(reason?.stack||reason)).slice(0,240);
    lastError.at=new Date().toISOString().slice(11,23);
    push('reject '+lastError.message);
  });
  const bindCanvas=()=>{
    const canvas=document.querySelector('canvas');
    if(!canvas||canvas.dataset.squishDebugBound)return;
    canvas.dataset.squishDebugBound='1';
    canvas.addEventListener('webglcontextlost',()=>{lost++;push('webglcontextlost');});
    canvas.addEventListener('webglcontextrestored',()=>{restored++;push('webglcontextrestored');});
  };
  bindCanvas();
  setInterval(bindCanvas,1000);
}

function formatSfx(p){
  const why=p.skipped?`drop ${p.skipped}`:'play';
  return `sfx  ${p.kind||'?'} ${p.name||'?'} ${why}${p.volume!=null?` vol=${p.volume}`:''}`;
}

function snapshot(){
  const game=window.SquishGame;
  const flagsNow=window.SquishFlags||flagSummary();
  const sound=game?.sound||{};
  const fusion=game?.fusion||{};
  return {flagsNow,sound,fusion,state:game?.state};
}

function render(){
  const el=document.getElementById('squish-debug');
  if(!el)return;
  const {flagsNow,sound,fusion,state}=snapshot();
  const worker=fusion.worker===false?'inline':fusion.worker?'worker':(fusion.worker===0||fusion.worker==null?'–':String(fusion.worker));
  el.textContent=[
    `Squish debug  build ${BUILD}  beat ${beats}  fps ${fps}  frame ${frameMs.toFixed(1)}ms`,
    `flags  nofusion=${!!flagsNow.nofusion} noworker=${!!flagsNow.noworker} noprewarm=${!!flagsNow.noprewarm} nosound=${!!flagsNow.nosound} ios=${!!flagsNow.ios} safari=${!!flagsNow.safari}`,
    `game  started=${state?.started} busy=${state?.busy} paused=${state?.paused} booting=${state?.booting}`,
    `webgl  lost=${lost} restored=${restored}  worker=${worker}  meshMs=${fusion.meshMs??'–'}  tables=${fusion.tablesReady??'–'}`,
    `sound  state=${sound.state||'–'} decoded=${(sound.decoded||[]).join(',')||'–'} ext=${sound.ext||'–'} cup=${sound.cup||'–'}`,
    ...((sound.lastPlays||[]).slice(-8).map(formatSfx)),
    `last error @ ${lastError.at}`,
    lastError.message,
    ...log,
  ].join('\n');
}

function onFrame(now){
  frames++;
  if(lastRaf)frameMs=now-lastRaf;
  lastRaf=now;
  requestAnimationFrame(onFrame);
}

function tick(){
  beats++;
  const now=performance.now();
  if(now-last>=500){
    fps=Math.round(frames*1000/(now-last));
    const avg=window.SquishGame?.graphics?.quality?.stats?.averageFrameMs;
    if(avg)frameMs=avg;
    frames=0;last=now;
  }
  render();
}

export function installDebugOverlay(page=document){
  if(!flags.debug||page.getElementById('squish-debug'))return;
  hook();
  const el=page.createElement('pre');
  el.id='squish-debug';
  el.setAttribute('aria-hidden','true');
  Object.assign(el.style,{
    position:'fixed',left:'8px',right:'8px',bottom:'8px',zIndex:'99999',
    margin:'0',padding:'8px 10px',maxHeight:'42vh',overflow:'auto',
    background:'rgba(0,0,0,.72)',color:'#d6ff9a',font:'12px/1.35 ui-monospace,Menlo,monospace',
    whiteSpace:'pre-wrap',wordBreak:'break-word',pointerEvents:'none',borderRadius:'8px',
  });
  page.body.append(el);
  setInterval(tick,250);
  requestAnimationFrame(onFrame);
  push('overlay ready '+location.search);
  render();
  return el;
}

if(flags.debug){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>installDebugOverlay());
  else installDebugOverlay();
}
