// Leaderboard overlay. Reads the public snapshot (top 100) at most once per
// minute per board; the player's own rank comes from the last verified submit.
import {apiFetch,fetchLeaderboard,publicId} from './api.mjs?v=launch-2';
import {checkName} from './names.mjs?v=launch-2';

const CACHE_MS=60*1000,CACHE_KEY='squish-board-cache-v1';
const fmt=n=>Number(n||0).toLocaleString('de-DE');
const tileLabel=p=>p?`Stein ${fmt(p)}`:"";

export function createLeaderboard(game){
  const $=id=>document.getElementById(id);
  const screen=$('board-screen');
  if(!screen)return {open(){},close(){}};
  const panel=$('board-panel'),list=$('board-list'),me=$('board-me'),updated=$('board-updated');
  const tabs={week:$('board-tab-week'),alltime:$('board-tab-alltime')};
  const form=$('board-name-form'),input=$('board-name'),nameStatus=$('board-name-status');
  let kind='week',myId='',lastFocus=null,loadToken=0;
  const cache=(()=>{try{return JSON.parse(sessionStorage.getItem(CACHE_KEY))||{};}catch{return {};}})();
  const keepCache=()=>{try{sessionStorage.setItem(CACHE_KEY,JSON.stringify(cache));}catch{}};

  function renderMe(){
    const r=game.ranks(),own=kind==='week'?r?.week:r?.alltime,ownScore=kind==='week'?r?.weekBest:r?.best;
    let text;
    if(own&&ownScore)text=`Dein Platz: ${fmt(own)}${r.players?` von ${fmt(r.players)}`:''} · ${fmt(ownScore)} Punkte`;
    else if(kind==='week'&&r?.best)text='Diese Woche noch kein geprüftes Ergebnis.';
    else text='Noch kein geprüftes Ergebnis – spiel einfach eine Runde.';
    if(game.playing&&!game.ranked)text+=' Die laufende Runde zählt nicht (ohne Server-Start). Starte ein neues Spiel.';
    me.textContent=text;
  }
  function renderList(data){
    list.replaceChildren();
    if(!data.entries.length){const li=document.createElement('li');li.className='board-empty';li.textContent=kind==='week'?'Diese Woche hat noch niemand gepunktet. Du könntest Platz 1 sein!':'Noch keine Einträge.';list.append(li);}
    for(const e of data.entries){
      const li=document.createElement('li');if(myId&&e.id===myId)li.className='is-me';
      const r=document.createElement('span');r.className='r';r.textContent=`${e.r}.`;
      const n=document.createElement('span');n.className='n';n.textContent=e.n||'Anonym';
      if(e.p){const s=document.createElement('small');s.textContent=tileLabel(e.p);n.append(s);}
      const s=document.createElement('span');s.className='s';s.textContent=fmt(e.s);
      li.append(r,n,s);list.append(li);
    }
    const at=data.updatedAt?new Date(data.updatedAt):null;
    updated.textContent=at&&!Number.isNaN(+at)?`Stand: ${at.toLocaleString('de-DE',{weekday:'short',hour:'2-digit',minute:'2-digit'})} Uhr`:'';
  }
  async function load(){
    const token=++loadToken,k=kind,hit=cache[k];
    renderMe();
    if(hit)renderList(hit.data);
    if(hit&&Date.now()-hit.at<CACHE_MS)return;
    if(!hit){list.replaceChildren();const li=document.createElement('li');li.className='board-empty';li.textContent='Lade Bestenliste …';list.append(li);}
    try{
      const data=await fetchLeaderboard(k);
      cache[k]={at:Date.now(),data};keepCache();
      if(token===loadToken)renderList(data);
    }catch{
      if(token===loadToken&&!hit){list.replaceChildren();const li=document.createElement('li');li.className='board-empty';li.textContent='Bestenliste gerade nicht erreichbar. Versuch es später noch einmal.';list.append(li);}
    }
  }
  function select(k){kind=k;for(const [key,b] of Object.entries(tabs))b.setAttribute('aria-pressed',String(key===k));void load();}
  tabs.week.addEventListener('click',()=>select('week'));
  tabs.alltime.addEventListener('click',()=>select('alltime'));

  form.addEventListener('submit',async ev=>{
    ev.preventDefault();
    const checked=checkName(input.value);
    nameStatus.classList.toggle('is-error',!checked.ok);
    if(!checked.ok){nameStatus.textContent=checked.message;return;}
    const button=form.querySelector('button');button.disabled=true;nameStatus.textContent='Speichere …';
    try{
      const r=await apiFetch('/name',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:checked.name})});
      const data=await r.json().catch(()=>({}));
      if(!r.ok){nameStatus.classList.add('is-error');nameStatus.textContent=data.error||'Name konnte nicht gespeichert werden.';return;}
      game.setName(checked.name);input.value=checked.name;
      // Show the new name in the cached list right away; the public snapshot follows within a minute.
      for(const c of Object.values(cache))for(const e of c.data.entries)if(myId&&e.id===myId)e.n=checked.name;
      keepCache();if(cache[kind])renderList(cache[kind].data);
      if(data.ranks)game.storeRanks(data.ranks);
      nameStatus.textContent='Gespeichert. In der Liste erscheint der Name mit der nächsten Aktualisierung.';
    }catch{nameStatus.classList.add('is-error');nameStatus.textContent='Keine Verbindung. Versuch es später noch einmal.';}
    finally{button.disabled=false;}
  });

  function onKey(ev){if(ev.key==='Escape'){ev.preventDefault();close();}}
  function open(){
    lastFocus=document.activeElement;
    input.value=game.name();nameStatus.classList.remove('is-error');nameStatus.textContent='3–16 Zeichen: Buchstaben, Ziffern, Leerzeichen, . _ -';
    screen.hidden=false;panel.focus({preventScroll:true});
    document.addEventListener('keydown',onKey);
    if(!myId)publicId().then(id=>{myId=id;if(cache[kind])renderList(cache[kind].data);}).catch(()=>{});
    void load();
  }
  function close(){screen.hidden=true;document.removeEventListener('keydown',onKey);lastFocus?.focus?.({preventScroll:true});}
  $('board-close').addEventListener('click',close);
  screen.addEventListener('click',ev=>{if(ev.target===screen)close();});
  return {open,close};
}
