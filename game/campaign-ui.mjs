// Kampagne: DOM-Teile (Ziel-Anzeige, Züge, Hilfsmittel, Ergebnis-Dialog, Levelauswahl).
// Reine Darstellung; Spiellogik und Speichern liegen in game.mjs / campaign.mjs.
import {TOOL_ICONS,GIFT_SVG} from './tool-icons.mjs?v=launch-44';
import {t, fmtNum, hasKey, onLangChange} from './i18n.mjs?v=launch-44';
import {fitLabelsSoon} from './fit-labels.mjs?v=launch-44';
import {goalProgress,goalText,goalShort,goalIntro,LONG_STREET,movesLeft,totalStars,lockReason,chapterOf,starGate,CHAPTER_SIZE,toolName,starsFor,starMovesUsed} from './campaign.mjs?v=launch-44';
import {miniTile} from './explain.mjs?v=launch-44';

const $=id=>document.getElementById(id);
export const TOOL_ARTICLE=new Proxy({},{get:(_,k)=>t('tool.'+k)});
export const TOOL_NOM=new Proxy({},{get:(_,k)=>toolName(k)});
const fmt=n=>fmtNum(n);

const starText=(n,max=3)=>'★'.repeat(n)+'☆'.repeat(Math.max(0,max-n));

function progressLabel(goal,p,run){
  if(p.done)return '✓';
  if(goal.type==='tile'){
    const best=Math.min(p.target,Math.max(p.current,...run.board.flat().filter(Boolean).map(x=>x.value)));
    return `${best}/${p.target}`;
  }
  if(goal.type==='empty')return p.done?'✓':`${p.current} / max. ${p.target}`;
  return `${fmt(p.current)}/${fmt(p.target)}`;
}

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

export function renderGoalItem(goal,run){
  const p=goalProgress(goal,run),li=document.createElement('li');
  li.className='goal-chip'+(p.done?' is-done':'');li.dataset.type=goal.type;
  const count=goal.count|0;
  if((goal.type==='make'||goal.type==='street'||goal.type==='long'||goal.type==='purge'||goal.type==='clear') && count>1){
    li.dataset.many='1';
  }
  const pic=goalPicture(goal);
  const v=document.createElement('b');v.className='goal-count';v.textContent=progressLabel(goal,p,run);
  li.append(pic,v);
  li.setAttribute('aria-label',`${goalText(goal)}, ${v.textContent}`);
  li.title=goalText(goal);
  return li;
}
function decorateChip(li, goal, many){
  if(!many)return li;
  const lbl=document.createElement('span');lbl.className='goal-lbl';lbl.textContent=goalShort(goal);
  const count=li.querySelector('.goal-count');
  if(count)count.before(lbl);else li.append(lbl);
  return li;
}



export function lockText(lock){
  if(!lock)return '';
  if(lock.reason==='stars')return t('campaign.lockStars',{chapter:lock.chapter,need:lock.need,have:lock.have});
  return t('campaign.lockPrev');
}


function composeGoalCopy(run,n){
  const intro=goalIntro(run.level.goals);
  const lesson=hasKey('tip.'+n)?t('tip.'+n):'';
  let tip=lesson;
  if(!lesson) tip=intro;
  else if(n>5 && intro && !lesson.includes(intro.slice(0,18))) tip=`${intro} ${lesson}`;
  if(!lesson && run.level.tool){
    const extra=run.level.tool==='extraMoves'?t('campaign.hardExtra'):t('campaign.hardTool',{tool:toolName(run.level.tool)});
    tip=intro?`${intro} ${extra}`:extra;
  }
  return (tip||'').trim();
}

export function createCampaignUI({onPlay,onNext,onRetry,onExtra,onMenu,onTool,onGift,onCloseSelect,onStar,reduceMotion}={}){
  const hud=$('campaign-hud'),levelEl=$('campaign-level'),goalsEl=$('campaign-goals'),movesEl=$('campaign-moves'),tipEl=$('campaign-tip'),capEl=$('campaign-tool-cap');
  let introRun=null, introPhase='hidden', introTimer=null, introAnim=null, prevDone=null;
  function introEls(){
    let intro=$('goal-intro');
    if(!intro){
      intro=document.createElement('div');intro.id='goal-intro';intro.className='goal-intro';intro.hidden=true;
      intro.setAttribute('role','dialog');intro.setAttribute('aria-modal','true');
      intro.innerHTML='<div class="goal-intro-card" role="button" tabindex="0"><p class="goal-intro-text"></p><ul class="goal-intro-progress"></ul></div>';
      (document.querySelector('.game-stage')||document.body).append(intro);
      const dismiss=()=>collapseIntro();
      intro.addEventListener('click',dismiss);
      const card=intro.querySelector('.goal-intro-card');
      card.addEventListener('click',ev=>{ev.stopPropagation();dismiss();});
      card.addEventListener('keydown',ev=>{
        if(ev.key==='Enter'||ev.key===' ' ){ev.preventDefault();dismiss();}
      });
    }
    let hint=$('goal-hint');
    if(!hint){
      hint=document.createElement('button');hint.id='goal-hint';hint.type='button';hint.className='goal-task';
      hint.hidden=true;
      hint.innerHTML='<span class="goal-task-label"></span><span class="goal-task-bang" aria-hidden="true">!</span>';
      const level=document.getElementById('campaign-level');
      const goal=document.querySelector('.campaign-goal');
      let head=goal?.querySelector('.campaign-goal-head');
      if(!head){
        head=document.createElement('div');head.className='campaign-goal-head';
        if(level){level.before(head);head.append(level);}
        else goal?.prepend(head);
      }
      head.append(hint);
      hint.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();expandIntro();});
    }
    return {
      intro,hint,
      card:intro.querySelector('.goal-intro-card'),
      text:intro.querySelector('.goal-intro-text'),
      progress:intro.querySelector('.goal-intro-progress'),
      label:hint.querySelector('.goal-task-label'),
      bang:hint.querySelector('.goal-task-bang'),
    };
  }
  function setIntroText(copy){
    const {intro,hint,text,label}=introEls();
    if(text)text.textContent=copy;
    if(label)label.textContent=t('goal.task');
    hint.setAttribute('aria-label',t('goal.hintAria'));
    hint.title=t('goal.hintAria');
    intro.setAttribute('aria-label',copy);
  }
  function fillIntroProgress(run){
    const {progress}=introEls();
    if(!progress||!run?.level?.goals)return;
    const goals=run.level.goals;
    progress.classList.toggle('is-pictorial',true);
    progress.classList.toggle('is-several',goals.length>1);
    progress.classList.toggle('is-three',goals.length>=3);
    progress.replaceChildren(...goals.map(goal=>decorateChip(renderGoalItem(goal,run),goal,true)));
  }
  function syncTaskFeedback(run){
    const {hint,bang}=introEls();
    if(!run?.level?.goals)return;
    const done=run.level.goals.map(g=>!!goalProgress(g,run).done);
    const all=done.length>0&&done.every(Boolean);
    const just=prevDone&&done.some((d,i)=>d&&!prevDone[i]);
    prevDone=done;
    hint.classList.toggle('is-complete',all);
    if(bang)bang.textContent=all?'✓':'!';
    if(just){
      hint.classList.remove('is-pulse');
      void hint.offsetWidth;
      hint.classList.add('is-pulse');
    }
  }
  function clearIntroTimer(){if(introTimer){clearTimeout(introTimer);introTimer=null;}if(introAnim){try{introAnim.cancel();}catch{}introAnim=null;}}
  function hideIntro(){
    clearIntroTimer();
    const {intro,hint,card}=introEls();
    intro.getAnimations().forEach(a=>a.cancel());
    card?.getAnimations().forEach(a=>a.cancel());
    intro.style.opacity='';intro.hidden=true;intro.classList.remove('is-in','is-out');
    if(card){card.style.transform='';card.style.opacity='';}
    hint.hidden=true;hint.classList.remove('is-landed','is-pulse','is-complete');
    const bang=hint.querySelector('.goal-task-bang');if(bang)bang.textContent='!';
    introPhase='hidden';introRun=null;prevDone=null;
  }
  function showIntro(copy,run){
    const {intro,hint,card}=introEls();
    setIntroText(copy);
    fillIntroProgress(run);
    clearIntroTimer();
    introPhase='open';introRun=run;
    hint.hidden=false;hint.classList.remove('is-landed');
    intro.getAnimations().forEach(a=>a.cancel());
    card?.getAnimations().forEach(a=>a.cancel());
    if(card){card.style.transform='';card.style.opacity='';}
    intro.style.opacity='';
    intro.classList.remove('is-out','is-in');intro.hidden=false;
    void intro.offsetWidth;
    intro.classList.add('is-in');
  }
  function collapseIntro(){
    if(introPhase!=='open')return;
    introPhase='closing';
    clearIntroTimer();
    const {intro,hint,card}=introEls();
    hint.hidden=false;
    let done=false;
    const finish=()=>{
      if(done)return;done=true;
      clearIntroTimer();
      intro.getAnimations().forEach(a=>a.cancel());
      card?.getAnimations().forEach(a=>a.cancel());
      intro.style.opacity='';
      if(card){card.style.transform='';card.style.opacity='';}
      intro.hidden=true;intro.classList.remove('is-in','is-out');
      introPhase='collapsed';
      hint.classList.remove('is-landed');void hint.offsetWidth;hint.classList.add('is-landed');
    };
    if(reduceMotion?.matches||!card||!card.animate){finish();return;}
    const a=card.getBoundingClientRect(),b=hint.getBoundingClientRect();
    if(b.width<2||a.width<2){finish();return;}
    const dx=(b.left+b.width/2)-(a.left+a.width/2);
    const dy=(b.top+b.height/2)-(a.top+a.height/2);
    const s=Math.max(.08,Math.min(b.width/a.width,b.height/a.height));
    intro.classList.add('is-out');
    introAnim=card.animate([
      {transform:'translate(0,0) scale(1)',opacity:1},
      {transform:`translate(${dx}px,${dy}px) scale(${s})`,opacity:.12}
    ],{duration:420,easing:'cubic-bezier(.2,.7,.2,1)',fill:'forwards'});
    intro.animate([{opacity:1},{opacity:0}],{duration:420,easing:'linear',fill:'forwards'});
    introAnim.finished.then(finish).catch(finish);
    introTimer=setTimeout(finish,520);
  }
  function expandIntro(){
    if(introPhase==='open'||introPhase==='closing')return;
    const copy=composeGoalCopy(introRun,lastHud?.n)||introEls().text?.textContent||'';
    if(!copy||!introRun)return;
    showIntro(copy,introRun);
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
    levelEl.textContent=label||(run.level.tool?t('campaign.levelHard',{n}):t('campaign.levelLabel',{n}));
    levelEl.title=levelEl.textContent;
    goalsEl.hidden=true;
    goalsEl.replaceChildren();
    if(tipEl){tipEl.hidden=true;tipEl.textContent='';}
    const copy=composeGoalCopy(run,n);
    if(copy){
      setIntroText(copy);
      if(introRun!==run) { prevDone=null; showIntro(copy,run); }
      else if(introPhase==='open') fillIntroProgress(run);
      else if(introPhase==='hidden') { const {hint}=introEls(); hint.hidden=false; introPhase='collapsed'; }
      else fillIntroProgress(run);
      syncTaskFeedback(run);
    } else {
      hideIntro();
    }
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
  function hide(){hud.hidden=true;tools.hidden=true;if(tipEl)tipEl.hidden=true;if(capEl)capEl.hidden=true;hideIntro();hideResult();}
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
