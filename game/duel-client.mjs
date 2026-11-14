import {apiFetch} from './api.mjs?v=sq-2';
// All commands share one channel; polling can never overtake a player's move.
export function createDuelClient({canSync,onView,onPrepare,onBegin,onConnection,onStatus=()=>{},onCode=()=>{}}) {
  const overlay=document.getElementById('duel-screen'),panel=document.getElementById('duel-panel');
  const status=document.getElementById('duel-status'),code=document.getElementById('duel-code');
  const host=document.getElementById('duel-host'),join=document.getElementById('duel-join');
  const input=document.getElementById('duel-input'),form=document.getElementById('duel-join-form');
  const hostTab=document.getElementById('duel-host-tab'),joinTab=document.getElementById('duel-join-tab');
  let session=null,view=null,flight=false,syncing=false,moving=false,connected=false,prepared=false,begun=false,opening=false,stopped=false,retryMove=null,offset=0,lastGood=0,mode='host';
  const sessionKey='squish-duel-session-v1';
  // Room codes are 6 digits now; 4-digit codes of rooms opened before the update still work.
  const CODE_LEN=6,CODE_RE=/^(\d{4}|\d{6})$/;
  // Adaptive polling (ms between requests). Any request - including moves - resets the clock,
  // and errors back off exponentially. Polls are read-only on the server.
  const POLL={playing:1500,lobby:2500,finished:6000,maxBackoff:15000};
  let lastRequest=0,failures=0;
  const makeToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
  // Every status line also reaches the in-world menu caption.
  function say(text){status.textContent=text;onStatus(text);}
  function remember(){try {sessionStorage.setItem(sessionKey,JSON.stringify(session));}catch{}}
  function abortAfter(ms){
    // Always use a timer; AbortSignal.timeout has been flaky in some WebKit builds.
    const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);
    c.signal.addEventListener('abort',()=>clearTimeout(t),{once:true});
    return c.signal;
  }
  function friendly(error){
    const m=error?.message||String(error||'');
    if(error?.name==='AbortError'||/aborted|timeout/i.test(m))return 'Keine Antwort vom Server. Bitte nochmal auf Host tippen.';
    if(/Failed to fetch|Load failed|NetworkError|Network request failed|fetch/i.test(m))return 'Verbindung zum Server fehlgeschlagen. Bitte die Seite neu laden.';
    if(/Unexpected token|JSON|<!DOCTYPE|<html/i.test(m))return 'Serverantwort ungültig. Bitte die Seite neu laden.';
    return m||'Verbindung fehlgeschlagen';
  }
  async function request(action,extra={}) {
    lastRequest=Date.now();
    const response=await apiFetch('/duel',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.token}`},
      body:JSON.stringify({action,room:session.room,...extra}),cache:'no-store',signal:abortAfter(8000)});
    const raw=await response.text();
    let data={};
    try{data=raw?JSON.parse(raw):{};}catch{throw new Error('Serverantwort ungültig. Bitte die Seite neu laden.');}
    if(!response.ok){const error=new Error(data.error||'Verbindung fehlgeschlagen');error.status=response.status;throw error;}
    failures=0;
    session.room=data.room;remember();offset=data.serverNow-Date.now();lastGood=Date.now();connected=true;onConnection(true);
    session.action='sync';remember();
    return data;
  }
  async function accept(data,notify=true) {
    if(begun&&view?.game&&data?.game&&Number(data.game.revision)<Number(view.game.revision)){
      data={...data,game:view.game,you:view.you??data.you};
    }
    view=data;code.textContent=data.room;onCode(data.room,data);
    hostTab.disabled=!!data.opponent;joinTab.disabled=!!data.opponent;
    if(data.status==='waiting')say('Warte auf den zweiten Spieler … Code 10 Minuten gültig.');
    else if(data.status==='ready')say('Verbunden! Beide Spielfelder werden vorbereitet …');
    if(data.opponent&&data.status!=='finished') {
      if(!prepared){await onPrepare(data.game);prepared=true;}
      if(!data.ready){data=await request('ready');view=data;}
    }
    if((data.status==='playing'||data.status==='finished')&&!begun&&data.opponent) {
      begun=true;overlay.hidden=true;document.getElementById('loading-screen').inert=false;
      await onBegin(data);
    }
    if(notify&&begun)await onView(data);
  }
  function failed(error) {
    failures++;
    connected=false;onConnection(false);
    say(friendly(error));
    if([400,401,404,409,410].includes(error.status)) {
      if(!begun){session=null;try{sessionStorage.removeItem(sessionKey);}catch{};document.getElementById('duel-host-retry').hidden=false;}
      else if([401,404,410].includes(error.status)){stopped=true;onConnection(false,error.message);}
    }
  }
  function tabs(next) {
    mode=next;host.hidden=next!=='host';join.hidden=next!=='join';
    hostTab.disabled=false;joinTab.disabled=false;
    hostTab.setAttribute('aria-pressed',String(next==='host'));joinTab.setAttribute('aria-pressed',String(next==='join'));
  }
  async function create() {
    if(flight)return;
    flight=true;document.getElementById('duel-host-retry').hidden=true;code.textContent='····';say('Spielcode wird erstellt …');
    session={token:makeToken(),room:null,action:'create'};remember();
    try{await accept(await request('create'));}catch(e){failed(e);}finally{flight=false;}
  }
  async function changeMode(next) {
    if(flight)return;
    if(session?.room&&view?.status==='waiting') {
      flight=true;try{await request('leave');}catch{}finally{flight=false;}
    }
    session=null;view=null;prepared=false;tabs(next);say('');
    if(next==='host')await create();else input.focus();
  }
  async function open() {
    if(opening)return;opening=true;
    overlay.hidden=false;document.getElementById('loading-screen').inert=true;panel.focus({preventScroll:true});
    try {
      let saved;try{saved=JSON.parse(sessionStorage.getItem(sessionKey));}catch{}
      if(saved?.room&&/^[a-f0-9]{64}$/.test(saved.token)) {
        session=saved;flight=true;
        try{await accept(await request(saved.action||'sync'));}catch(e){failed(e);}finally{flight=false;}
      }
      if(!session){tabs('host');await create();}
    }finally{opening=false;}
  }
  hostTab.addEventListener('click',()=>void changeMode('host'));
  joinTab.addEventListener('click',()=>void changeMode('join'));
  document.getElementById('duel-host-retry').addEventListener('click',()=>void create());
  input.addEventListener('input',()=>{input.value=input.value.replace(/\D/g,'').slice(0,CODE_LEN);});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(flight||!CODE_RE.test(input.value))return;
    flight=true;session={token:makeToken(),room:input.value,action:'join'};remember();say('Verbindung wird hergestellt …');
    const button=form.querySelector('button');button.disabled=true;
    try{await accept(await request('join'));}catch(e){failed(e);}finally{flight=false;button.disabled=false;}
  });
  const idle=async()=>{
    const start=Date.now();
    while(flight||opening||syncing||moving){
      if(Date.now()-start>8000){flight=false;opening=false;syncing=false;break;}
      await new Promise(r=>setTimeout(r,60));
    }
  };
  const idleSync=async()=>{
    const start=Date.now();
    while(syncing){
      if(Date.now()-start>8000){syncing=false;break;}
      await new Promise(r=>setTimeout(r,60));
    }
  };
  // In-world menu: same room logic as the panel, driven without the overlay.
  async function enter() {
    if(opening)return;opening=true;
    try {
      let saved;try{saved=JSON.parse(sessionStorage.getItem(sessionKey));}catch{}
      if(saved?.room&&/^[a-f0-9]{64}$/.test(saved.token)) {
        session=saved;flight=true;
        try{await accept(await request(saved.action||'sync'));}catch(e){failed(e);}finally{flight=false;}
      }
      if(!session){tabs('host');await create();}
    }finally{opening=false;}
  }
  async function hostRoom(){
    await idle();if(begun)return;
    if(mode==='host'&&session?.room&&view?.status==='waiting')return;
    if(mode==='host'){await create();return;}
    await changeMode('host');
  }
  async function joinMode(){await idle();if(begun)return;await changeMode('join');}
  async function joinRoom(room) {
    await idle();if(begun||!CODE_RE.test(room))return false;
    flight=true;mode='join';session={token:makeToken(),room,action:'join'};remember();say('Verbindung wird hergestellt …');
    try{await accept(await request('join'));return true;}catch(e){failed(e);return false;}finally{flight=false;}
  }
  async function cancel() {
    await idle();if(begun)return;
    if(session?.room&&view?.status==='waiting'){flight=true;try{await request('leave');}catch{}finally{flight=false;}}
    session=null;view=null;prepared=false;mode='host';
    try{sessionStorage.removeItem(sessionKey);}catch{}
    say('');
  }
  async function exit() {
    if(flight)return;
    stopped=true;
    if(session?.room){try{await request('leave');}catch{}}
    try{sessionStorage.removeItem(sessionKey);}catch{}
    location.href='./index.html';
  }
  document.getElementById('duel-close').addEventListener('click',()=>void exit());
  overlay.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();void exit();}
    if(e.key==='Tab') {
      const items=[...overlay.querySelectorAll('button,input')].filter(el=>!el.disabled&&el.getClientRects().length);
      if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1)?.focus();}
      else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0]?.focus();}
    }
  });
  function pollDelay(){
    const s=view?.status;
    const base=s==='playing'?POLL.playing:s==='finished'?POLL.finished:POLL.lobby;
    return failures?Math.min(POLL.maxBackoff,base*2**Math.min(failures,4)):base;
  }
  setInterval(async()=>{
    if(stopped||!session||flight||moving||syncing||opening||document.hidden||(begun&&!canSync()))return;
    if(!session.room&&mode!=='host')return;
    if(Date.now()-lastRequest<pollDelay())return;
    syncing=true;
    try{
      const data=retryMove?await request('move',retryMove):await request(session.room?(session.action||'sync'):'create');
      if(retryMove&&data)retryMove=null;
      await accept(data);
    }catch(e){failed(e);}finally{syncing=false;}
  },250);
  return {open,exit,enter,host:hostRoom,joinMode,join:joinRoom,cancel,get mode(){return mode;},get room(){return session?.room||null;},get waiting(){return view?.status==='waiting';},get active(){return begun;},get view(){return view;},get serverNow(){return Date.now()+offset;},
    get canMove(){const now=Date.now()+offset;return begun&&!moving&&connected&&Date.now()-lastGood<10000&&view?.status==='playing'&&now>=view.startsAt&&now<view.endsAt;},
    async move(direction,line) {
      if(moving||retryMove)return null;
      await idleSync();
      if(!view?.game)return null;
      moving=true;retryMove={id:crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join(''),direction,line,revision:view.game.revision};
      try {const data=await request('move',retryMove);retryMove=null;if(data)view=data;return data;}
      catch(e){failed(e);return null;}finally{moving=false;}
    },
  };
}
