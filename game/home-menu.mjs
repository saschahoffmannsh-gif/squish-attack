// Startbildschirm und Modus-Menüs im Herbst-Design (reines DOM, kein 3D).
// Ersetzt das frühere 3D-Glastisch-Menü (world-menu.mjs) mit derselben
// Schnittstelle, die game.mjs und start-menu.mjs erwarten.
import {ICONS,TILE_ICONS,leafSvg} from './aw-icons.mjs?v=launch-30';
import {BUILD} from './flags.mjs?v=launch-30';
import {t, fmtNum, onLangChange} from './i18n.mjs?v=launch-30';
import {fitLabelsSoon} from './fit-labels.mjs?v=launch-30';

const LEAF_COLORS=['#f07a1c','#e8541a','#c9301c','#f2a01e','#d94a17','#b8321a','#ffb030'];
const fmt=n=>fmtNum(n);
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
    vibration.querySelector('[data-toggle-state]').textContent=on?t('on'):t('off');
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
  function button({label,sub,icon,color='aw-green',size='',action,dim=false,id,nav}){
    const b=page.createElement('button');b.type='button';b.className=`aw-btn ${color} ${size}`.trim();
    b.dataset.label=label;if(id)b.id=id;if(nav)b.dataset.nav=nav;if(dim)b.classList.add('is-dim');
    b.innerHTML=`<span class="aw-ico">${ICONS[icon]||''}</span><span class="aw-label"><span></span>${sub?'<small></small>':''}</span>`;
    b.querySelector('.aw-label>span').textContent=label;
    if(sub)b.querySelector('small').textContent=sub;
    b.setAttribute('aria-label',sub?`${label}, ${sub}`:label);
    b.addEventListener('click',()=>{if(busy||!active)return;action(b);});
    return b;
  }
  function tile({label,icon,action,badge=0,nav,id}){
    const b=page.createElement('button');b.type='button';b.className='aw-tile';b.dataset.label=label;if(id)b.id=id;if(nav)b.dataset.nav=nav;
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
      for(const ch of chips){const e=page.createElement('span');e.className='aw-chip'+(ch.n?'':' is-zero')+(ch.gold?' is-gold':'');if(ch.type)e.dataset.type=ch.type;e.innerHTML='<i></i><span></span>';e.querySelector('i').textContent=String(ch.n);e.lastChild.textContent=ch.label;row.append(e);}
      c.append(row);
    }
    return c;
  }

  // ---------- Bildschirme ----------
  const lockHint=()=>t('lock.hint');
  function decorateLock(b,label){
    b.classList.add('is-locked');b.dataset.locked='1';
    const badge=page.createElement('span');badge.className='aw-lock';badge.innerHTML=ICONS.lock||'';
    badge.setAttribute('aria-hidden','true');b.append(badge);
    b.setAttribute('aria-label',t('menu.lockedAria',{label,hint:lockHint()}));
    return b;
  }
  function lockedTap(b){
    tap('tap');
    b.classList.remove('aw-wobble');void b.offsetWidth;b.classList.add('aw-wobble');
    say(lockHint(),2800);
  }
  function burstUnlock(b){
    b.classList.add('is-unlocking');
    const badge=page.createElement('span');badge.className='aw-lock is-burst';badge.innerHTML=ICONS.lock||'';
    badge.setAttribute('aria-hidden','true');b.append(badge);
    const r=reduced();
    if(!r){
      for(let i=0;i<6;i++){
        const s=page.createElement('i');s.className='aw-spark';
        const a=i/6*Math.PI*2,d=28+i%2*10;
        s.style.setProperty('--sx',`${Math.cos(a)*d}px`);s.style.setProperty('--sy',`${Math.sin(a)*d-8}px`);
        s.style.left='auto';s.style.right='16px';s.style.top='50%';s.style.marginTop='-4px';
        b.append(s);setTimeout(()=>s.remove(),700);
      }
    }
    setTimeout(()=>{badge.remove();b.classList.remove('is-unlocking');},r?0:750);
  }
  function homeItems(){
    const unlocked=!!hooks.campaign?.summary?.().modesUnlocked;
    const celebrate=unlocked&&hooks.consumeUnlockCelebration?.();
    const tiles=page.createElement('div');tiles.className='aw-tiles';
    tiles.append(
      tile({label:t('menu.levels'),icon:'star',nav:'levels',action:()=>{tap();hooks.setMode?.('campaign');hooks.campaign?.openSelect?.();}}),
      tile({label:t('menu.rules'),icon:'cap',nav:'rules',action:()=>{tap();void go('rules');}}));
    const endlos=button({label:t('menu.endless'),icon:'infinity',color:'aw-orange',id:'home-endless',nav:'endless',dim:!unlocked,
      action:b=>{if(!hooks.campaign?.summary?.().modesUnlocked){lockedTap(b);return;}tap();hooks.setMode?.('endless');void go('endless');}});
    const duo=button({label:t('menu.duel'),icon:'duo',color:'aw-blue',id:'home-duel',nav:'duel',dim:!unlocked,
      action:b=>{if(!hooks.campaign?.summary?.().modesUnlocked){lockedTap(b);return;}tap();hooks.gesture?.();void hooks.duel?.open?.();}});
    if(!unlocked){decorateLock(endlos,t('menu.endless'));decorateLock(duo,t('menu.duel'));}
    else if(celebrate){
      burstUnlock(endlos);burstUnlock(duo);
      say(t('lock.unlocked'),3200);
      hooks.haptics?.pulse?.('big');
    }
    return [
      button({label:t('menu.adventure'),icon:'play',color:'aw-green',size:'aw-big',nav:'adventure',
        action:()=>{tap();hooks.setMode?.('campaign');void go('campaign');}}),
      endlos, duo, tiles,
    ];
  }
  function rulesItems(){
    const box=page.createElement('div');box.className='aw-card aw-rules';box.tabIndex=0;
    const src=[...page.querySelectorAll('#veil .rules p')];
    const intro=page.createElement('p');intro.className='aw-rules-lead';
    intro.textContent=t('rules.lead');
    box.append(...src.map(p=>{const c=page.createElement('p');c.textContent=p.textContent;return c;}),intro);
    // launch-28: bebilderte Erklärungen (explain.mjs) – jedes Thema jederzeit nachlesbar.
    const topics=hooks.explain?.topics?.()||[];
    const out=[ribbon(t('rules.ribbon'),'aw-r-purple')];
    if(topics.length){
      const lead=page.createElement('p');lead.className='aw-ex-lead';lead.textContent=t('rules.topics');
      const list=page.createElement('div');list.className='aw-ex-list';list.id='rules-topics';
      for(const tp of topics){
        const b=page.createElement('button');b.type='button';b.className='aw-ex-btn';b.dataset.topic=tp.topic;b.dataset.nav='ex-'+tp.topic;
        const ico=page.createElement('span');ico.setAttribute('aria-hidden','true');try{ico.append(tp.icon());}catch{}
        const label=page.createElement('span');label.textContent=tp.title;
        b.append(ico,label);b.addEventListener('click',()=>{tap();void hooks.explain.show(tp.topic);});
        list.append(b);
      }
      const head=page.createElement('p');head.className='aw-rules-lead';head.textContent=t('rules.full');
      box.prepend(head);
      out.push(lead,list);
    }
    return [...out,box,
      button({label:t('menu.back'),icon:'back',color:'aw-slate',size:'aw-small',nav:'back',action:()=>{tap();void go('home');}})];
  }
  function campaignItems(){
    const info=hooks.campaign?.summary?.()||{next:1,ready:false};
    const inv=info.inventory;   // null = kein Vorrat (TOOL_STOCK aus) → keine Chips
    // launch-28: Chips nur für den Gold-Vorrat (seltene Geschenke); normale Hilfen sind unbegrenzt.
    const goldChips=inv&&(inv.extraMoves>0||inv.rocket>0)?[{n:inv.extraMoves||0,label:t('gift.goldName',{tool:t('tool.extraMoves')}),type:'extraMoves',gold:true},{n:inv.rocket||0,label:t('gift.goldName',{tool:t('tool.rocket')}),type:'rocket',gold:true}]:null;
    const c=card(`★ ${info.total??0} / ${(info.count||25)*3}`,info.caption||'',goldChips);
    // Vorrat-Aktionen in der Karte: offene Geschenke öffnen, Werkzeug-Shop.
    const acts=page.createElement('div');acts.className='aw-card-actions';
    if(info.pendingGifts>0){
      const g=page.createElement('button');g.type='button';g.className='gift-btn';g.id='home-gift';g.dataset.label=t('menu.gift');g.dataset.nav='gift';
      g.innerHTML=(hooks.icons?.gift||'')+'<span></span>'+(info.pendingGifts>1?`<b class="gift-n">${info.pendingGifts}</b>`:'');
      g.querySelector('span').textContent=t('menu.gift');
      g.setAttribute('aria-label',t('result.giftAria',{n:info.pendingGifts}));
      g.addEventListener('click',()=>{tap();hooks.campaign?.openGift?.();});acts.append(g);
    }
    if(info.shop){
      const b=page.createElement('button');b.type='button';b.className='shop-pill';b.id='home-shop';b.dataset.label=t('menu.shop');b.dataset.nav='shop';
      b.innerHTML=(hooks.icons?.shop||'')+'<span></span>';b.querySelector('span').textContent=t('menu.shop');b.setAttribute('aria-label',t('shop.openAria'));
      b.addEventListener('click',()=>{tap();hooks.campaign?.openShop?.();});acts.append(b);
    }
    if(acts.childElementCount)c.append(acts);
    const items=[ribbon(t('menu.adventure'),'aw-r-green'),c];
    items.push(button({label:t('menu.playLevel',{n:info.next}),icon:'play',color:'aw-green',size:'aw-big',id:'home-play-level',nav:'play-level',action:()=>{
      if(!info.ready&&!hooks.campaign?.summary?.().ready){say(t('menu.loadingLevels'),2000);return;}
      tap('move');hooks.gesture?.();void play({campaign:hooks.campaign.summary().next});
    }}));
    items.push(button({label:t('menu.select'),icon:'grid',color:'aw-blue',nav:'select',action:()=>{tap();hooks.campaign?.openSelect?.();}}));
    items.push(button({label:t('menu.back'),icon:'back',color:'aw-slate',size:'aw-small',nav:'back',action:()=>{tap();void go('home');}}));
    return items;
  }
  function endlessItems(){
    const e=hooks.endlessStats?.()||{},can=!!hooks.canContinue?.();
    const sub=e.bestTile?t('menu.bestTile',{n:e.bestTile}):'';
    const items=[ribbon(t('menu.endless'),'aw-r-orange'),card(e.best?t('menu.record',{score:fmt(e.best)}):t('menu.noRecord'),sub)];
    const cont=button({label:t('menu.continue'),icon:'play',color:can?'aw-green':'aw-orange',size:can?'aw-big':'',dim:!can,nav:'continue',action:b=>{
      if(!hooks.canContinue?.()){say(t('menu.noSave'),2600);return;}
      tap('move');hooks.gesture?.();void play(false);
    }});
    const fresh=button({label:t('menu.newGame'),icon:can?'plus':'play',color:can?'aw-orange':'aw-green',size:can?'':'aw-big',nav:'new-game',action:()=>{tap('move');hooks.gesture?.();void play(true);}});
    items.push(...(can?[cont,fresh]:[fresh,cont]));
    items.push(button({label:t('menu.back'),icon:'back',color:'aw-slate',size:'aw-small',nav:'back',action:()=>{tap();void go('home');}}));
    return items;
  }
  function updateTopbar(){
    const c=hooks.campaign?.summary?.()||{},e=hooks.endlessStats?.()||{};
    if(starsEl){starsEl.querySelector('b').textContent=`${c.total??0}/${(c.count||25)*3}`;starsEl.setAttribute('aria-label',t('menu.starsAria',{n:c.total??0,max:(c.count||25)*3}));}
    if(recordEl){recordEl.querySelector('b').textContent=fmt(e.best||0);recordEl.setAttribute('aria-label',t('menu.recordAria',{score:fmt(e.best||0)}));}
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
    fitLabelsSoon(root);
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
    if(page.querySelector('.duel-screen:not([hidden]),.settings-screen:not([hidden]),.shop-veil,.gift-fx,.ad-veil'))return;
    ev.preventDefault();void go('home');
  });

  onLangChange(()=>{syncVibration();if(active&&!busy)render(screen||'home',{animate:false});else updateTopbar();});

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
