// Kampagne: DOM-Teile (Ziel-Anzeige, Züge, Hilfsmittel, Ergebnis-Dialog, Levelauswahl).
// Reine Darstellung; Spiellogik und Speichern liegen in game.mjs / campaign.mjs.
import {TOOL_ICONS,GIFT_SVG} from './tool-icons.mjs?v=preview-goal';
import {t, fmtNum, hasKey, onLangChange, getLang} from './i18n.mjs?v=preview-goal';
import {fitLabelsSoon} from './fit-labels.mjs?v=preview-goal';
import {goalProgress,goalText,LONG_STREET,movesLeft,totalStars,lockReason,chapterOf,starGate,CHAPTER_SIZE,toolName,starsFor,starMovesUsed} from './campaign.mjs?v=preview-goal';
import {miniTile} from './explain.mjs?v=preview-goal';

const $=id=>document.getElementById(id);
export const TOOL_ARTICLE=new Proxy({},{get:(_,k)=>t('tool.'+k)});
export const TOOL_NOM=new Proxy({},{get:(_,k)=>toolName(k)});
const fmt=n=>fmtNum(n);

const starText=(n,max=3)=>'★'.repeat(n)+'☆'.repeat(Math.max(0,max-n));

function tileRow(values, opts={}){
  const wrap=document.createElement('span');wrap.className='goal-row'+(opts.cls?' '+opts.cls:'');
  for(const v of values)wrap.append(miniTile(v,{gold:!!opts.gold,ghost:v==null,cls:'goal-tile'}));
  return wrap;
}

function tileGrid(rows){
  const g=document.createElement('span');g.className='goal-grid';
  g.style.setProperty('--cols', String(Math.max(...rows.map(r=>r.length))));
  for(const row of rows){
    const r=document.createElement('span');r.className='goal-grid-row';
    for(const v of row)r.append(miniTile(v,{ghost:v==null,cls:'goal-tile'}));
    g.append(r);
  }
  return g;
}

function plusBadge(text){
  const s=document.createElement('i');s.className='goal-plus';s.textContent=text;return s;
}

function goalPicture(goal){
  const pic=document.createElement('span');pic.className='goal-pic';pic.setAttribute('aria-hidden','true');
  const typ=goal.type, shape=goal.shape;
  if(typ==='fuse' && shape==='t'){
    const s=goal.size|0;
    // T: a triple plus one on the middle (4) or a 5-T if size 5
    if(s>=5) pic.append(tileGrid([[null,3,null],[3,3,3],[null,3,null]]));
    else pic.append(tileGrid([[null,3,null],[3,3,3]]));
  } else if(typ==='fuse'){
    const n=Math.max(3, Math.min(6, goal.size|0));
    const v = n>=5 ? 3 : 1;
    const row=tileRow(Array(n).fill(v));
    pic.append(row);
    if(n>=5) pic.append(plusBadge('+2'));
    else if(n===4) pic.append(plusBadge('+1'));
  } else if(typ==='street' || typ==='long'){
    const n = typ==='long' ? (goal.n||LONG_STREET) : 4;
    const vals=Array.from({length:n},(_,i)=>i+1);
    pic.append(tileRow(vals));
    if(n>=4) pic.append(plusBadge('+1'));
  } else if(typ==='tile'){
    pic.append(tileRow([goal.value]));
  } else if(typ==='make'){
    pic.append(tileRow([goal.value]));
    pic.append(plusBadge(`${goal.value}+`));
  } else if(typ==='purge'){
    const gone=miniTile(goal.value,{cls:'goal-tile is-purge'});
    pic.append(gone);
  } else if(typ==='score'){
    const s=document.createElement('span');s.className='goal-score';s.textContent=fmt(goal.points);pic.append(s);
  } else if(typ==='clear'){
    pic.append(tileRow([2,3,1],{cls:'is-faded'}));
  } else if(typ==='combo'){
    pic.append(tileRow([1,1,1]));
    pic.append(plusBadge(`×${goal.chain}`));
  } else if(typ==='empty'){
    const s=document.createElement('span');s.className='goal-empty';s.textContent=`max. ${goal.max}`;pic.append(s);
  } else {
    const s=document.createElement('span');s.className='goal-fallback';s.textContent=goalShort(goal);pic.append(s);
  }
  return pic;
}

const SLOT_MAX=6;

function goalSlotNeed(goal){
  const typ=goal.type;
  if(typ==='score'||typ==='empty') return 0;
  if(typ==='tile'||typ==='fuse') return 1;
  if(typ==='combo') return goal.chain|0;
  if(typ==='clear'||typ==='purge') return goal.tiles|0;
  return goal.count|0;
}

function usesSlots(goal){
  const n=goalSlotNeed(goal);
  return n>0 && n<=SLOT_MAX;
}

function goalCue(goal){
  const de=getLang()!=='en';
  switch(goal.type){
    case 'street': return de?'Straße':'Street';
    case 'long': return de?'lang':'long';
    case 'clear':
    case 'purge': return de?'weg':'clear';
    case 'empty': return 'max';
    default: return '';
  }
}

function hudPicture(goal){
  const typ=goal.type;
  if(typ==='score'){
    const pic=document.createElement('span');pic.className='goal-pic';pic.setAttribute('aria-hidden','true');
    const s=document.createElement('span');s.className='goal-score-mark';s.textContent='★';pic.append(s);
    return pic;
  }
  if(typ==='empty'){
    const pic=document.createElement('span');pic.className='goal-pic is-empty-pic';pic.setAttribute('aria-hidden','true');
    pic.append(tileRow([1,null],{cls:'is-faded'}));
    return pic;
  }
  const pic=goalPicture(goal);
  if(typ==='make'||typ==='combo') pic.querySelectorAll('.goal-plus').forEach(el=>el.remove());
  return pic;
}

function renderSlots(n, filled){
  const ul=document.createElement('ul');
  ul.className='goal-slots';
  ul.setAttribute('aria-hidden','true');
  const need=Math.max(0, Math.min(SLOT_MAX, n|0));
  const have=Math.max(0, Math.min(need, filled|0));
  for(let i=0;i<need;i++){
    const li=document.createElement('li');
    li.className='goal-slot'+(i<have?' is-filled':' is-empty');
    ul.append(li);
  }
  return ul;
}

function hudTrack(goal, run){
  const p=goalProgress(goal,run);
  const wrap=document.createElement('span');
  wrap.className='goal-hud-track';
  if(usesSlots(goal)){
    const need=goalSlotNeed(goal);
    const typ=goal.type;
    const filled=p.done?need:(typ==='tile'||typ==='fuse'?(p.done?1:0):p.current);
    wrap.append(renderSlots(need, filled));
  } else if(!p.done){
    const b=document.createElement('b');
    b.className='goal-hud-count';
    b.textContent=`${fmt(p.current)}/${fmt(p.target)}`;
    wrap.append(b);
  }
  if(p.done){
    const ok=document.createElement('span');
    ok.className='goal-hud-check';
    ok.setAttribute('aria-hidden','true');
    ok.textContent='✓';
    wrap.append(ok);
  }
  return wrap;
}

function spokenProgress(goal, run){
  const p=goalProgress(goal,run);
  if(p.done) return '✓';
  if(usesSlots(goal)) return `${Math.min(goalSlotNeed(goal), typCurrent(goal,p))}/${goalSlotNeed(goal)}`;
  return `${fmt(p.current)}/${fmt(p.target)}`;
}

function typCurrent(goal,p){
  const typ=goal.type;
  if(typ==='tile'||typ==='fuse') return p.done?1:0;
  return p.current;
}

export function renderGoalItem(goal,run){
  const p=goalProgress(goal,run),li=document.createElement('li');
  li.className='goal-hud'+(p.done?' is-done':'');
  li.dataset.type=goal.type;
  li.append(hudPicture(goal));
  const cue=goalCue(goal);
  if(cue){
    const lbl=document.createElement('span');
    lbl.className='goal-hud-cue';
    lbl.textContent=cue;
    li.append(lbl);
  }
  li.append(hudTrack(goal,run));
  li.setAttribute('aria-label',`${goalText(goal)}, ${spokenProgress(goal,run)}`);
  li.title=goalText(goal);
  return li;
}

export function lockText(lock){
  if(!lock)return '';
  if(lock.reason==='stars')return t('campaign.lockStars',{chapter:lock.chapter,need:lock.need,have:lock.have});
  return t('campaign.lockPrev');
}

export function createCampaignUI({onPlay,onNext,onRetry,onExtra,onMenu,onTool,onGift,onCloseSelect,onStar,reduceMotion}={}){
  const hud=$('campaign-hud'),levelEl=$('campaign-level'),goalsEl=$('campaign-goals'),movesEl=$('campaign-moves'),tipEl=$('campaign-tip'),capEl=$('campaign-tool-cap');
  let prevDone=null;
  function dropGoalPopups(){
    $('goal-intro')?.remove();
    $('goal-hint')?.remove();
    document.querySelectorAll('.campaign-goal-head').forEach(head=>{
      const level=head.querySelector('#campaign-level, .campaign-level');
      if(level) head.before(level);
      head.remove();
    });
  }
  function syncHudFeedback(run){
    if(!run?.level?.goals||!goalsEl)return;
    const done=run.level.goals.map(g=>!!goalProgress(g,run).done);
    const just=!!(prevDone&&done.some((d,i)=>d&&!prevDone[i]));
    const all=done.length>0&&done.every(Boolean);
    const rows=[...goalsEl.children];
    rows.forEach((li,i)=>{
      const now=!!done[i];
      const was=!!(prevDone&&prevDone[i]);
      if(just&&now&&!was){
        li.classList.remove('is-pulse');
        void li.offsetWidth;
        li.classList.add('is-pulse');
      }
    });
    goalsEl.classList.toggle('is-all-done', all);
    if(just&&all){
      goalsEl.classList.remove('is-pulse');
      void goalsEl.offsetWidth;
      goalsEl.classList.add('is-pulse');
    }
    prevDone=done;
  }

  // launch-28: im Abenteuer nur +3 Züge und Rakete (beliebig oft).
  const tools=$('campaign-tools'),extraBtn=$('tool-extra'),rocketBtn=$('tool-rocket');
  for(const b of [rocketBtn]){const ico=b.querySelector('[data-icon]');if(ico&&!ico.firstChild)ico.innerHTML=TOOL_ICONS[ico.dataset.icon];}
  const result=$('campaign-result'),rKicker=$('campaign-result-kicker'),rTitle=$('campaign-result-title'),rStars=$('campaign-result-stars');
  const rMessage=$('campaign-result-message'),rGift=$('campaign-result-gift');
  // launch-29: kleines Gold-Abzeichen statt Satz, wenn Gold eingesetzt wurde (sternneutral)
  const rGold=document.createElement('span');rGold.className='aw-goldbadge';rGold.id='campaign-result-goldbadge';rGold.hidden=true;rMessage.before(rGold);
  const bNext=$('campaign-next'),bExtra=$('campaign-extra'),bRetry=$('campaign-retry'),bMenu=$('campaign-menu');
  const rMoves=$('campaign-result-moves'),rStarCount=$('campaign-result-starcount'),rPair=$('campaign-result-pair'),rClose=$('campaign-result-close');
  const setLabel=(b,t)=>{const l=b.querySelector('.aw-label>span');if(l)l.textContent=t;else b.textContent=t;};
  // Ablauf-Protokoll (für Tests): confetti → dialog → star1..3
  const timeline=[];let starTimers=[];
  const mark=name=>{timeline.push({name,t:Math.round(performance.now())});if(timeline.length>40)timeline.shift();};
  rStars.querySelectorAll('.aw-star').forEach((el,i)=>el.querySelector('.full')?.addEventListener('animationstart',()=>mark('star'+(i+1))));
  const select=$('campaign-screen'),selPanel=$('campaign-panel'),selTotal=$('campaign-total'),chapters=$('campaign-chapters'),lockNote=$('campaign-lock-note');
  let lastFocus=null,lastHud=null,lastTools=null,lastResult=null,lastSelect=null;

  function renderHud(run,n,label=null){
    lastHud={run,n,label};hud.hidden=false;
    dropGoalPopups();
    levelEl.textContent=label||(run.level.tool?t('campaign.levelHard',{n}):t('campaign.levelLabel',{n}));
    levelEl.title=levelEl.textContent;
    const goals=run.level.goals||[];
    goalsEl.hidden=false;
    goalsEl.classList.add('is-pictorial');
    goalsEl.classList.toggle('is-several',goals.length>1);
    goalsEl.classList.toggle('is-three',goals.length>=3);
    goalsEl.replaceChildren(...goals.map(goal=>renderGoalItem(goal,run)));
    if(tipEl){
      if(n>=1&&n<=5&&hasKey('tip.'+n)){tipEl.hidden=false;tipEl.textContent=t('tip.'+n);}
      else {tipEl.hidden=true;tipEl.textContent='';}
    }
    syncHudFeedback(run);
    const left=Math.max(0,movesLeft(run));
    if(movesEl.textContent!==String(left))movesEl.textContent=String(left);
    const box=movesEl.closest('.campaign-moves');
    box.classList.toggle('is-low',left<=2);
    movesEl.setAttribute('aria-label',t('campaign.movesAria',{n:left}));
    // launch-32: Sterne-Leiste unter den Zügen – so viele Sterne gibt es, wenn der nächste Zug das Level löst.
    // Sie hängt nur an den übrigen Zügen (jede Rakete zählt als ein Zug, +3-Züge zählen nicht als übrig).
    let meter=box.querySelector('.campaign-starmeter');
    if(!meter){meter=document.createElement('i');meter.className='campaign-starmeter';for(let i=0;i<3;i++)meter.append(document.createElement('b'));box.append(meter);}
    const can=run.status==='won'?null:starsFor(run.level,starMovesUsed(run)+1,true);
    meter.hidden=can==null;
    if(can!=null){meter.dataset.stars=String(can);[...meter.children].forEach((b,i)=>b.classList.toggle('is-on',i<can));meter.setAttribute('aria-label',t('campaign.starsLeftAria',{n:can}));meter.setAttribute('role','img');}
  }
  // launch-32: Hilfen kosten keine Sterne mehr – kein Sterne-Deckel über der Leiste. Gold zeigt kurz „ohne Werbung“.
  function renderToolCap(toolsUsed=0,giftsUsed=0){
    if(!capEl)return;
    const g=giftsUsed|0;
    if(g<=0){capEl.hidden=true;capEl.textContent='';delete capEl.dataset.cap;return;}
    capEl.hidden=false;capEl.textContent=t('campaign.goldCap',{n:g});capEl.dataset.cap='gold';
  }
  // stock = {extraMoves, rocket}: Vorrat, höchstens 1 je Typ (launch-42). Leere Knöpfe sind ausgegraut.
  function renderTools(stock={},opts={}){
    const {canExtra=true,armed=null,locked=false,toolsUsed=0,giftsUsed=0,freeTry=null}=opts;   // freeTry: Typ oder true (alle)
    lastTools={inv:stock,opts:{canExtra,armed,locked,toolsUsed,giftsUsed,freeTry}};tools.hidden=false;
    renderToolCap(toolsUsed,giftsUsed);
    const set=(btn,type,canUse,label)=>{
      const g=Math.max(0,stock?.[type]|0),free=freeTry===true||freeTry===type,have=g>0||free;
      const c=btn.querySelector('[data-count]');
      c.textContent=g>0?String(g):'';c.hidden=!(g>0);c.classList.remove('is-zero');
      btn.classList.toggle('is-gold',g>0);btn.classList.toggle('is-empty',!have);
      btn.dataset.shop='';btn.dataset.refill='';btn.dataset.ad='';btn.dataset.offline='';
      btn.dataset.free=free&&g<=0?'1':'';btn.dataset.freeLabel=t('tool.freeBadge');
      btn.disabled=!canUse||!have;
      const aria=g>0?t('tool.goldAria',{label,n:g}):free?t('tool.freeTryAria',{label}):t('tool.emptyAria',{label});
      btn.setAttribute('aria-label',aria);
    };
    set(extraBtn,'extraMoves',canExtra&&!locked,t('tool.help.extra'));
    set(rocketBtn,'rocket',!locked||armed==='rocket',t('tool.help.rocket'));
    rocketBtn.classList.toggle('is-armed',armed==='rocket');rocketBtn.setAttribute('aria-pressed',String(armed==='rocket'));
  }
  function hide(){hud.hidden=true;tools.hidden=true;if(tipEl)tipEl.hidden=true;if(capEl)capEl.hidden=true;prevDone=null;dropGoalPopups();hideResult();}
  extraBtn.addEventListener('click',()=>onTool?.('extraMoves'));
  rocketBtn.addEventListener('click',()=>onTool?.('rocket'));

  // ---------- Ergebnis ----------
  function showResult({n,won,stars,moves,limit,base=null,left:leftIn=null,lostReason,canNext,nextLock,gifts=[],extraAvailable=0,extraGold=0,extraAd=false,toolsUsed=0,giftsUsed=0,toolLevel=null,unlockModes=false,tutorialTool=false}){
    const extraOffer=extraAvailable>0;
    result.dataset.outcome=won?'won':'lost';
    lastResult={n,won,stars,moves,limit,base,left:leftIn,lostReason,canNext,nextLock,gifts,extraAvailable,extraGold,extraAd,toolsUsed,giftsUsed,toolLevel,unlockModes,tutorialTool};
    rKicker.textContent=t('campaign.levelLabel',{n});
    rTitle.textContent=won?(stars===3?t('result.perfect'):t('result.clear')):lostReason==='board-full'?t('result.full'):t('result.noMoves');
    rStars.hidden=!won;rStars.setAttribute('aria-label',t('campaign.starsOf',{n:stars,max:3}));
    rStars.dataset.stars=String(won?stars:0);
    // launch-32: im Sieg die übrigen Züge (Grundlage der Sterne, ohne +3-Züge), sonst Züge/Limit
    const left=leftIn??Math.max(0,(base??limit)-moves);
    rMoves.textContent=won?String(left):`${moves}/${limit}`;
    {const lab=rMoves.closest('span')?.querySelector('[data-i18n]');if(lab){lab.dataset.i18n=won?'result.statsMoves':'campaign.movesLabel';lab.textContent=t(lab.dataset.i18n);}}
    rMoves.setAttribute('aria-label',won?t('result.leftAria',{n:left}):`${moves}/${limit}`);
    rStarCount.textContent=won?`${stars} / 3`:'–';
    rMessage.textContent=won
      ?(stars<3?t('result.betterStars'):t('result.bestSolved'))
      :(lostReason==='board-full'?t('result.boardFull'):t('result.goalOpen'))+(extraOffer&&lostReason==='moves'?t('result.extraOffer'):t('result.tryAgain'))
        +(toolLevel&&toolLevel!=='extraMoves'?t('result.hardTip',{tool:toolName(toolLevel)}):'');
    if(won&&tutorialTool)rMessage.textContent=t('result.tutorialTool').trim();   // launch-28: Tutorial-Level mit Hilfsmittel
    if(won&&unlockModes)rMessage.textContent+=t('lock.resultBonus');
    if(won&&!canNext&&nextLock)rMessage.textContent+=' '+lockText(nextLock);
    else if(won&&!canNext)rMessage.textContent+=t('result.allDone');
    rGold.hidden=!(won&&giftsUsed>0);rGold.textContent=t('result.goldBadge');rGold.setAttribute('aria-label',t('result.goldSolved'));
    setGifts(gifts);
    bNext.hidden=!won;bNext.disabled=!canNext;
    setLabel(bNext,canNext?t('result.next'):nextLock?t('result.locked'):t('result.done'));
    bNext.title=nextLock?lockText(nextLock):'';
    bExtra.hidden=won||!extraOffer||lostReason!=='moves';
    const gold=extraGold>0,viaAd=!gold&&!!extraAd;bExtra.dataset.refill=viaAd?'ad':'';bExtra.classList.toggle('is-gold',gold);
    setLabel(bExtra,gold?t('result.extraGold'):viaAd?t('result.extraAd'):t('result.extraFree'));
    bExtra.setAttribute('aria-label',gold?t('result.extraGoldAria',{n:extraGold}):viaAd?t('result.extraAdAria'):t('result.extraFreeAria'));
    // Verloren ohne +3: "Nochmal" wird der große Hauptknopf.
    const retryMain=!won&&bExtra.hidden;
    bRetry.classList.toggle('aw-big',retryMain);bRetry.classList.toggle('aw-green',retryMain);bRetry.classList.toggle('aw-purple',!retryMain);
    if(retryMain)result.querySelector('.aw-result-actions').insertBefore(bRetry,rPair);else rPair.append(bRetry);
    rPair.classList.toggle('is-single',retryMain);
    // Sterne: leere Plätze sofort, verdiente nacheinander mit Pop + Glanz.
    starTimers.forEach(clearTimeout);starTimers=[];
    rStars.classList.remove('is-playing','is-shown');
    const reduced=!!reduceMotion?.matches,first=reduced?150:420,gap=reduced?120:360;
    rStars.querySelectorAll('.aw-star').forEach((el,i)=>{
      el.classList.toggle('is-earned',won&&i<stars);el.style.setProperty('--sd',`${first+i*gap}ms`);
      if(won&&i<stars)starTimers.push(setTimeout(()=>onStar?.(i),first+i*gap+(reduced?0:180)));
    });
    void rStars.offsetWidth;
    if(won)rStars.classList.add('is-playing');
    result.hidden=false;mark('dialog');fitLabelsSoon(result);
    if(won&&!stars)mark('nostars');
    (won&&canNext?bNext:!bExtra.hidden?bExtra:bRetry).focus({preventScroll:true,focusVisible:false});
  }
  function hideResult(){result.hidden=true;starTimers.forEach(clearTimeout);starTimers=[];rStars.classList.remove('is-playing');}
  // Offene Geschenke als antippbarer Knopf (Geschenk-Hinweis bleibt): öffnet die Blase.
  // launch-29: Geschenk-Kachel nur Bild + Inhalt + „Öffnen“ (+ Anzahl) – kein Satz.
  function setGifts(gifts=[]){
    rGift.hidden=!gifts.length;rGift.classList.add('is-gold');
    rGift.innerHTML='';
    if(!gifts.length)return;
    const ico=document.createElement('span');ico.className='gift-box';ico.innerHTML=GIFT_SVG;
    const what=document.createElement('span');what.className='gift-what';
    if(gifts[0].type==='extraMoves')what.textContent='+3';else{what.classList.add('is-ico');what.innerHTML=TOOL_ICONS[gifts[0].type]||'';}
    const label=document.createElement('span');label.className='gift-open';label.textContent=t('result.giftOpenShort');
    rGift.append(ico,what,label);
    if(gifts.length>1){const n=document.createElement('b');n.className='gift-n';n.textContent=String(gifts.length);rGift.append(n);}
    rGift.setAttribute('aria-label',t('result.giftAria',{n:gifts.length})+': '+gifts.map(g=>toolName(g.type)).join(', '));
  }
  rGift.addEventListener('click',()=>onGift?.());
  bNext.addEventListener('click',()=>onNext?.());
  bExtra.addEventListener('click',()=>onExtra?.());
  bRetry.addEventListener('click',()=>onRetry?.());
  bMenu.addEventListener('click',()=>onMenu?.());
  rClose?.addEventListener('click',()=>onMenu?.());

  // ---------- Levelauswahl ----------
  function onKey(ev){if(ev.key==='Escape'){ev.preventDefault();closeSelect();}}
  function openSelect({levels,progress}){
    const toolOf=n=>levels[n-1]?.tool||null;
    lastFocus=document.activeElement;
    const count=levels.length,total=totalStars(progress);
    selTotal.textContent=t('campaign.starsTotal',{n:total,max:count*3}); lastSelect={levels,progress};
    lockNote.textContent='';
    const groups=[];let nextMarked=false;
    for(let start=1;start<=count;start+=CHAPTER_SIZE){
      const k=chapterOf(start),sec=document.createElement('section');sec.className='campaign-chapter';
      const h=document.createElement('h3');
      const gate=starGate(k);
      h.innerHTML='';const title=document.createElement('span');title.textContent=t('campaign.chapter',{n:k});h.append(title);
      if(gate){const open=total>=gate||(progress.openChapters||[]).includes(k)||!!progress.levels[String(start)];
        const g=document.createElement('small');g.textContent=t(open?'campaign.gateOpen':'campaign.gate',{n:gate,have:total});g.className=open?'is-open':'';h.append(g);}
      const grid=document.createElement('div');grid.className='campaign-grid';
      for(let n=start;n<Math.min(count+1,start+CHAPTER_SIZE);n++){
        const lock=lockReason(progress,n),rec=progress.levels[String(n)];
        const b=document.createElement('button');b.type='button';b.className='campaign-level-btn';b.dataset.level=String(n);
        if(lock){b.classList.add('is-locked');b.setAttribute('aria-disabled','true');}
        if(rec)b.classList.add('is-done');
        if(toolOf(n)){b.classList.add('is-tool');b.dataset.tool=toolOf(n);}
        if(!lock&&!rec&&!nextMarked){b.classList.add('is-next');nextMarked=true;}
        const num=document.createElement('span');num.className='num';num.textContent=lock?'🔒':String(n);
        const st=document.createElement('span');st.className='stars';
        const maxS=3;
        if(rec){const b=document.createElement('b');b.textContent='★'.repeat(rec.stars);st.append(b,'☆'.repeat(Math.max(0,maxS-rec.stars)));}else st.textContent=lock?'':'☆'.repeat(maxS);
        b.append(num,st);
        b.setAttribute('aria-label',(lock?t('campaign.levelLockedAria',{n,reason:lockText(lock)}):rec?t('campaign.levelPlayedAria',{n,stars:rec.stars,max:maxS}):t('campaign.levelNewAria',{n}))+(toolOf(n)?t('campaign.levelHardTip',{tool:toolName(toolOf(n))}):''));
        b.addEventListener('click',()=>{
          if(lock){lockNote.textContent=t('campaign.lockNote',{n,reason:lockText(lock)});b.classList.remove('shake');void b.offsetWidth;b.classList.add('shake');return;}
          closeSelect(true);onPlay?.(n);
        });
        grid.append(b);
      }
      sec.append(h,grid);groups.push(sec);
    }
    chapters.replaceChildren(...groups);
    select.hidden=false;selPanel.focus({preventScroll:true});
    // 100 Level: das nächste Level in die Mitte holen (ohne Animation)
    const nextBtn=chapters.querySelector('.is-next');
    if(nextBtn&&Number(nextBtn.dataset.level)>CHAPTER_SIZE)nextBtn.scrollIntoView({block:'center',behavior:'instant'});
    document.addEventListener('keydown',onKey);
  }
  function closeSelect(silent=false){
    if(select.hidden)return;
    select.hidden=true;document.removeEventListener('keydown',onKey);
    if(!silent){lastFocus?.focus?.({preventScroll:true});onCloseSelect?.();}
  }
  $('campaign-close').addEventListener('click',()=>closeSelect());
  select.addEventListener('click',ev=>{if(ev.target===select)closeSelect();});

  onLangChange(()=>{
    if(lastHud&&!hud.hidden)renderHud(lastHud.run,lastHud.n,lastHud.label);
    if(lastTools&&!tools.hidden)renderTools(lastTools.inv,lastTools.opts);
    if(lastResult&&!result.hidden)showResult(lastResult);
    if(lastSelect&&!select.hidden)openSelect(lastSelect);
  });

  return {toolButton:type=>({extraMoves:extraBtn,rocket:rocketBtn})[type],renderHud,renderTools,setGifts,giftButton:rGift,hide,showResult,hideResult,openSelect,closeSelect,mark,timeline,
    get resultOpen(){return !result.hidden;},get selectOpen(){return !select.hidden;}};
}
