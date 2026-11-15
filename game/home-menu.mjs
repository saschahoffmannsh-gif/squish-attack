// Startbildschirm und Modus-Menüs im Herbst-Design (reines DOM, kein 3D).
// Ersetzt das frühere 3D-Glastisch-Menü (world-menu.mjs) mit derselben
// Schnittstelle, die game.mjs und start-menu.mjs erwarten.
import {ICONS,TILE_ICONS,leafSvg} from './aw-icons.mjs?v=launch-10';
import {BUILD} from './flags.mjs?v=launch-10';

const LEAF_COLORS=['#f07a1c','#e8541a','#c9301c','#f2a01e','#d94a17','#b8321a','#ffb030'];
const fmt=n=>Number(n||0).toLocaleString('de-DE');
const rand=(a,b)=>a+Math.random()*(b-a);

export function installBackdrop(page=document){
  const bg=page.getElementById('aw-bg');
  if(!bg||bg.dataset.ready)return;bg.dataset.ready='1';
  const parts=[];
  for(let i=0;i<9;i++){
    const d=page.createElement('i');d.className='aw-bokeh';const size=rand(40,140);
    d.style.cssText=`left:${rand(-5,95)}%;top:${rand(0,95)}%;width:${size}px;height:${size}px;--c:${['#ffb14d','#ff7a2a','#ffd27a','#e0602a'][i%4]};--b:${rand(4,14)}px;--o:${rand(.12,.32).toFixed(2)}`;
    parts.push(d);
  }
  for(let i=0;i<16;i++){
    const l=page.createElement('i');l.className='aw-leaf';const far=i%3===0;
    l.style.cssText=`--x:${rand(-4,96).toFixed(1)}%;--y:${rand(4,90).toFixed(1)}vh;--s:${(far?rand(16,24):rand(28,46)).toFixed(0)}px;--c:${LEAF_COLORS[i%LEAF_COLORS.length]};`+
      `--o:${far?.45:.85};--b:${far?'1.6px':'0px'};--d:${(far?rand(18,26):rand(11,17)).toFixed(1)}s;--delay:${(-rand(0,24)).toFixed(1)}s;--dx:${rand(-80,80).toFixed(0)}px;--r:${rand(240,720).toFixed(0)}deg`;
    l.innerHTML=leafSvg(!far);parts.push(l);
  }
  bg.append(...parts);
}

export function createHomeMenu({page=document,sound,reduceMotion,hooks}){
  const overlay=page.getElementById('loading-screen'),root=page.getElementById('home-menu'),screenEl=page.getElementById('home-screen');
  const statusEl=page.getElementById('home-status'),vibration=page.getElementById('vibration-toggle');
  let active=false,screen=null,busy=false,statusTimer=0,lastScreen='home';
  installBackdrop(page);
  const starsEl=page.getElementById('home-stars'),recordEl=page.getElementById('home-record');
  starsEl?.querySelector('i')?.insertAdjacentHTML('beforeend',TILE_ICONS.star);
  recordEl?.querySelector('i')?.insertAdjacentHTML('beforeend',TILE_ICONS.trophy);
  const build=page.getElementById('settings-build');if(build)build.textContent='Squish '+BUILD;
  const homeBuild=page.getElementById('home-build');if(homeBuild)homeBuild.textContent=BUILD;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const reduced=()=>!!reduceMotion?.matches;

  // ---------- Vibration in den Einstellungen ----------
  function syncVibration(){
    if(!vibration)return;
    const on=hooks.haptics?.enabled!==false;
    vibration.setAttribute('aria-checked',String(on));
    vibration.querySelector('[data-toggle-state]').textContent=on?'An':'Aus';
  }
  if(vibration){
    if(!hooks.haptics?.supported)vibration.hidden=true;
    vibration.addEventListener('click',()=>{hooks.haptics?.toggle();syncVibration();});
    hooks.haptics?.onChange?.(syncVibration);syncVibration();
  }

  function say(text,duration=0){
    clearTimeout(statusTimer);
    if(statusEl)statusEl.textContent=text||'';
    if(text&&duration)statusTimer=setTimeout(()=>{if(statusEl)statusEl.textContent='';},duration);
  }
  function tap(kind='tap'){
    try{sound?.unlock?.();}catch{}
    hooks.haptics?.pulse?.(kind);
    try{sound?.play?.('land',2);}catch{}
  }
  function button({label,sub,icon,color='aw-green',size='',action,dim=false,id}){
    const b=page.createElement('button');b.type='button';b.className=`aw-btn ${color} ${size}`.trim();
    b.dataset.label=label;if(id)b.id=id;if(dim)b.classList.add('is-dim');
    b.innerHTML=`<span class="aw-ico">${ICONS[icon]||''}</span><span class="aw-label"><span></span>${sub?'<small></small>':''}</span>`;
    b.querySelector('.aw-label>span').textContent=label;
    if(sub)b.querySelector('small').textContent=sub;
    b.setAttribute('aria-label',sub?`${label}, ${sub}`:label);
    b.addEventListener('click',()=>{if(busy||!active)return;action(b);});
    return b;
  }
  function tile({label,icon,action,badge=0}){
    const b=page.createElement('button');b.type='button';b.className='aw-tile';b.dataset.label=label;
    b.innerHTML=`<span class="aw-tile-ico">${TILE_ICONS[icon]||''}</span><span class="aw-tile-label"></span>`;
    b.querySelector('.aw-tile-label').textContent=label;
    if(badge>0){const n=page.createElement('b');n.className='aw-badge';n.textContent=String(badge);b.append(n);}
    b.addEventListener('click',()=>{if(busy||!active)return;action(b);});
    return b;
  }
  function ribbon(text,tone){const r=page.createElement('div');r.className=`aw-ribbon ${tone}`;r.textContent=text;r.setAttribute('role','heading');r.setAttribute('aria-level','2');return r;}
  function card(big,sub,chips){
    const c=page.createElement('div');c.className='aw-card';
    const b=page.createElement('span');b.className='aw-card-big';b.textContent=big;c.append(b);
    if(sub){const s=page.createElement('span');s.className='aw-card-sub';s.textContent=sub;c.append(s);}
    if(chips?.length){
      const row=page.createElement('div');row.className='aw-chips';
      for(const ch of chips){const e=page.createElement('span');e.className='aw-chip'+(ch.n?'':' is-zero');e.innerHTML='<i></i><span></span>';e.querySelector('i').textContent=String(ch.n);e.lastChild.textContent=ch.label;row.append(e);}
      c.append(row);
    }
    return c;
  }

  // ---------- Bildschirme ----------
  function homeItems(){
    const tiles=page.createElement('div');tiles.className='aw-tiles';
    tiles.append(
      tile({label:'Levels',icon:'star',action:()=>{tap();hooks.setMode?.('campaign');hooks.campaign?.openSelect?.();}}),
      tile({label:'Bestenliste',icon:'trophy',action:()=>{tap();hooks.leaderboard?.();}}),
      tile({label:'Regeln',icon:'cap',action:()=>{tap();void go('rules');}}));
    return [
      button({label:'Abenteuer',icon:'play',color:'aw-green',size:'aw-big',
        action:()=>{tap();hooks.setMode?.('campaign');void go('campaign');}}),
      button({label:'Endlos',icon:'infinity',color:'aw-orange',
        action:()=>{tap();hooks.setMode?.('endless');void go('endless');}}),
      button({label:'2 Spieler',icon:'duo',color:'aw-blue',
        action:()=>{tap();hooks.gesture?.();void hooks.duel?.open?.();}}),
      tiles,
    ];
  }
  function rulesItems(){
    const box=page.createElement('div');box.className='aw-card aw-rules';box.tabIndex=0;
    const src=[...page.querySelectorAll('#veil .rules p')];
    const intro=page.createElement('p');intro.className='aw-rules-lead';
    intro.textContent='Im Abenteuer zeigt jedes Level oben sein Ziel und die Züge, die du dafür hast.';
    box.append(...src.map(p=>{const c=page.createElement('p');c.textContent=p.textContent;return c;}),intro);
    return [ribbon('Spielregeln','aw-r-purple'),box,
      button({label:'Zurück',icon:'back',color:'aw-slate',size:'aw-small',action:()=>{tap();void go('home');}})];
  }
  function campaignItems(){
    const info=hooks.campaign?.summary?.()||{next:1,ready:false};
    const inv=info.inventory||{};
    const items=[ribbon('Abenteuer','aw-r-green'),
      card(`★ ${info.total??0} / ${(info.count||25)*3}`,info.caption||'',[{n:inv.extraMoves||0,label:'+3 Züge'},{n:inv.hint||0,label:'Hinweis'},{n:inv.rocket||0,label:'Rakete'},{n:inv.wand||0,label:'Zauberstab'}])];
    items.push(button({label:`Level ${info.next} spielen`,icon:'play',color:'aw-green',size:'aw-big',id:'home-play-level',action:()=>{
      if(!info.ready&&!hooks.campaign?.summary?.().ready){say('Level werden geladen …',2000);return;}
      tap('move');hooks.gesture?.();void play({campaign:hooks.campaign.summary().next});
    }}));
    items.push(button({label:'Levelauswahl',icon:'grid',color:'aw-blue',action:()=>{tap();hooks.campaign?.openSelect?.();}}));
    items.push(button({label:'Zurück',icon:'back',color:'aw-slate',size:'aw-small',action:()=>{tap();void go('home');}}));
    return items;
  }
  function endlessItems(){
    const e=hooks.endlessStats?.()||{},can=!!hooks.canContinue?.();
    const sub=e.bestTile?`Bester Stein: ${e.bestTile}`:'';
    const items=[ribbon('Endlos','aw-r-orange'),card(e.best?`Rekord ${fmt(e.best)}`:'Noch kein Rekord',sub)];
    const cont=button({label:'Weiterspielen',icon:'play',color:can?'aw-green':'aw-orange',size:can?'aw-big':'',dim:!can,action:b=>{
      if(!hooks.canContinue?.()){say('Noch kein Spielstand – starte ein neues Spiel.',2600);return;}
      tap('move');hooks.gesture?.();void play(false);
    }});
    const fresh=button({label:'Neues Spiel',icon:can?'plus':'play',color:can?'aw-orange':'aw-green',size:can?'':'aw-big',action:()=>{tap('move');hooks.gesture?.();void play(true);}});
    items.push(...(can?[cont,fresh]:[fresh,cont]));
    items.push(button({label:'Bestenliste',icon:'bars',color:'aw-blue',action:()=>{tap();hooks.leaderboard?.();}}));
    items.push(button({label:'Zurück',icon:'back',color:'aw-slate',size:'aw-small',action:()=>{tap();void go('home');}}));
    return items;
  }
  function updateTopbar(){
    const c=hooks.campaign?.summary?.()||{},e=hooks.endlessStats?.()||{};
    if(starsEl){starsEl.querySelector('b').textContent=`${c.total??0}/${(c.count||25)*3}`;starsEl.setAttribute('aria-label',`${c.total??0} von ${(c.count||25)*3} Sternen im Abenteuer`);}
    if(recordEl){recordEl.querySelector('b').textContent=fmt(e.best||0);recordEl.setAttribute('aria-label',`Endlos-Rekord: ${fmt(e.best||0)} Punkte`);}
  }
  function render(name,{animate=true}={}){
    screen=name;lastScreen=name;root.dataset.screen=name;
    const items=name==='campaign'?campaignItems():name==='endless'?endlessItems():name==='rules'?rulesItems():homeItems();
    updateTopbar();
    items.forEach((el,i)=>el.style.setProperty('--i',String(i)));
    screenEl.classList.remove('is-leaving');
    screenEl.classList.toggle('no-anim',!animate);
    screenEl.replaceChildren(...items);
    if(statusEl)screenEl.append(statusEl);
  }
  async function go(name){
    if(busy)return;busy=true;say('');
    try{
      if(!reduced()){screenEl.classList.add('is-leaving');await wait(170);}
      render(name);
      if(keyboard)screenEl.querySelector('button')?.focus({preventScroll:true});
      await wait(reduced()?0:260);
    }finally{busy=false;}
  }
  function show(){
    root.hidden=false;page.documentElement.classList.add('home-open');
    overlay.dataset.mode='home';
  }
  function hide(){
    root.hidden=true;page.documentElement.classList.remove('home-open');say('');
  }
  async function play(arg){
    if(!active||busy)return;
    busy=true;
    try{active=false;hide();hooks.pauseScene?.(false);await hooks.launch(arg);}
    finally{busy=false;}
  }
  // Fokus nur bei Tastaturbedienung setzen (kein Fokusring nach Antippen).
  let keyboard=false;
  page.addEventListener('pointerdown',()=>{keyboard=false;},true);
  page.addEventListener('keydown',ev=>{if(ev.key==='Tab'||ev.key==='Enter'||ev.key===' ')keyboard=true;},true);
  page.addEventListener('keydown',ev=>{
    if(!active||ev.key!=='Escape'||screen==='home')return;
    if(page.querySelector('.duel-screen:not([hidden]),.settings-screen:not([hidden])'))return;
    ev.preventDefault();void go('home');
  });

  return {
    get active(){return active;},get screen(){return screen;},
    get stats(){return {items:active?screenEl.childElementCount:0,busy,screen};},
    preload(){return Promise.resolve();},
    async open({launch,screen:target}={}){
      if(launch)hooks.launch=launch;
      if(active)return;active=true;
      show();render(target||'home');
      hooks.pauseScene?.(true);
      if(keyboard)screenEl.querySelector('button')?.focus({preventScroll:true});
    },
    play,
    refresh(){if(active&&!busy&&(screen==='campaign'||screen==='home'))render(screen,{animate:false});else updateTopbar();},
    code(){},status(){},
    async dismiss(){active=false;hide();hooks.pauseScene?.(false);},
    dispose(){active=false;hide();},
  };
}
