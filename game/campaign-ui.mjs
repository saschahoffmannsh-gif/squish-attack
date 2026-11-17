// Kampagne: DOM-Teile (Ziel-Anzeige, Züge, Hilfsmittel, Ergebnis-Dialog, Levelauswahl).
// Reine Darstellung; Spiellogik und Speichern liegen in game.mjs / campaign.mjs.
import {TOOL_ICONS,GIFT_SVG} from './tool-icons.mjs?v=launch-30';
import {t, fmtNum, hasKey, onLangChange} from './i18n.mjs?v=launch-30';
import {fitLabelsSoon} from './fit-labels.mjs?v=launch-30';
import {goalProgress,goalText,goalShort,movesLeft,totalStars,lockReason,chapterOf,starGate,CHAPTER_SIZE,toolName,toolStarCap} from './campaign.mjs?v=launch-30';

const $=id=>document.getElementById(id);
export const TOOL_ARTICLE=new Proxy({},{get:(_,k)=>t('tool.'+k)});
export const TOOL_NOM=new Proxy({},{get:(_,k)=>toolName(k)});
const fmt=n=>fmtNum(n);
const starText=(n,max=3)=>'★'.repeat(n)+'☆'.repeat(Math.max(0,max-n));

export function lockText(lock){
  if(!lock)return '';
  if(lock.reason==='stars')return t('campaign.lockStars',{chapter:lock.chapter,need:lock.need,have:lock.have});
  return t('campaign.lockPrev');
}

export function createCampaignUI({onPlay,onNext,onRetry,onExtra,onMenu,onTool,onGift,onCloseSelect,onStar,reduceMotion}={}){
  const hud=$('campaign-hud'),levelEl=$('campaign-level'),goalsEl=$('campaign-goals'),movesEl=$('campaign-moves'),tipEl=$('campaign-tip'),capEl=$('campaign-tool-cap');
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
    const three=run.level.goals.length>=3;
    goalsEl.classList.toggle('is-three',three);
    goalsEl.replaceChildren(...run.level.goals.map(goal=>{
      const p=goalProgress(goal,run),li=document.createElement('li');
      li.className=p.done?'is-done':'';li.dataset.type=goal.type;
      const t=document.createElement('span');t.textContent=three?goalShort(goal):goalText(goal);
      if(three)t.title=goalText(goal);
      const v=document.createElement('b');v.textContent=p.done?'✓':goal.type==='tile'?`${Math.min(p.target,Math.max(p.current,...run.board.flat().filter(Boolean).map(t=>t.value)))}/${p.target}`:goal.type==='empty'?`${p.current}→${p.target}`:`${fmt(p.current)}/${fmt(p.target)}`;
      li.append(t,v);return li;
    }));
    if(tipEl){
      const tip=hasKey('tip.'+n)?t('tip.'+n):(run.level.tip||'');
      tipEl.hidden=!tip;tipEl.textContent=tip;
    }
    const left=Math.max(0,movesLeft(run));
    if(movesEl.textContent!==String(left))movesEl.textContent=String(left);
    movesEl.closest('.campaign-moves').classList.toggle('is-low',left<=2);
    movesEl.setAttribute('aria-label',t('campaign.movesAria',{n:left}));
  }
  // launch-28: Sterne-Hinweis über der Leiste. Hilfen deckeln (1 → max. 2★, mehr → 1★),
  // Gold-Geschenke sind sternneutral.
  function renderToolCap(toolsUsed=0,giftsUsed=0){
    if(!capEl)return;
    const n=toolsUsed|0,g=giftsUsed|0;
    if(n<=0&&g<=0){capEl.hidden=true;capEl.textContent='';delete capEl.dataset.cap;return;}
    capEl.hidden=false;
    if(n<=0){capEl.textContent=t('campaign.goldCap',{n:g});capEl.dataset.cap='gold';return;}
    const max=toolStarCap(n);
    capEl.textContent=n===1?t('campaign.toolCap',{n,max}):t('campaign.toolCapMany',{n,max});
    capEl.dataset.cap=String(max);
  }
  // gold = {extraMoves, rocket}: Gold-Geschenke (sternneutral, ohne Werbung). Sonst unbegrenzt;
  // needsAd: vor dem Einsatz kommt ein Belohnungsclip (kein Werbefrei).
  function renderTools(gold={},opts={}){
    const {canExtra=true,armed=null,locked=false,needsAd=false,offline=false,toolsUsed=0,giftsUsed=0,freeTry=null}=opts;   // freeTry: Typ oder true (alle)
    lastTools={inv:gold,opts:{canExtra,armed,locked,needsAd,offline,toolsUsed,giftsUsed,freeTry}};tools.hidden=false;
    renderToolCap(toolsUsed,giftsUsed);
    const set=(btn,type,enabled,label)=>{
      const g=Math.max(0,gold?.[type]|0),free=freeTry===true||freeTry===type;
      const c=btn.querySelector('[data-count]');
      c.textContent=g>0?String(g):'';c.hidden=!(g>0);c.classList.remove('is-zero');
      btn.classList.toggle('is-gold',g>0);btn.classList.remove('is-empty');btn.dataset.shop='';btn.dataset.refill='';
      btn.dataset.ad=(g<=0&&needsAd&&!free)?'1':'';
      btn.dataset.free=free&&g<=0?'1':'';btn.dataset.freeLabel=t('tool.freeBadge');
      const off=g<=0&&needsAd&&!free&&offline;btn.dataset.offline=off?'1':'';   // launch-31: ohne Verbindung gesperrt (Tippen → Hinweis)
      btn.disabled=!enabled;
      const aria=g>0?t('tool.goldAria',{label,n:g}):free?t('tool.freeTryAria',{label}):off?t('tool.offlineAria',{label}):needsAd?t('tool.adAria',{label}):t('tool.freeAria',{label});
      btn.setAttribute('aria-label',aria);
    };
    set(extraBtn,'extraMoves',canExtra&&!locked,t('tool.help.extra'));
    set(rocketBtn,'rocket',!locked||armed==='rocket',t('tool.help.rocket'));
    rocketBtn.classList.toggle('is-armed',armed==='rocket');rocketBtn.setAttribute('aria-pressed',String(armed==='rocket'));
  }
  function hide(){hud.hidden=true;tools.hidden=true;if(tipEl)tipEl.hidden=true;if(capEl)capEl.hidden=true;hideResult();}
  extraBtn.addEventListener('click',()=>onTool?.('extraMoves'));
  rocketBtn.addEventListener('click',()=>onTool?.('rocket'));

  // ---------- Ergebnis ----------
  function showResult({n,won,stars,moves,limit,lostReason,canNext,nextLock,gifts=[],extraAvailable=0,extraGold=0,extraAd=false,toolsUsed=0,giftsUsed=0,toolLevel=null,unlockModes=false,tutorialTool=false}){
    const extraOffer=extraAvailable>0;
    result.dataset.outcome=won?'won':'lost';
    lastResult={n,won,stars,moves,limit,lostReason,canNext,nextLock,gifts,extraAvailable,extraGold,extraAd,toolsUsed,giftsUsed,toolLevel,unlockModes,tutorialTool};
    rKicker.textContent=t('campaign.levelLabel',{n});
    rTitle.textContent=won?(stars===3?t('result.perfect'):t('result.clear')):lostReason==='board-full'?t('result.full'):t('result.noMoves');
    rStars.hidden=!won;rStars.setAttribute('aria-label',t('campaign.starsOf',{n:stars,max:3}));
    rStars.dataset.stars=String(won?stars:0);
    rMoves.textContent=won?String(moves):`${moves}/${limit}`;
    rStarCount.textContent=won?`${stars} / 3`:'–';
    rMessage.textContent=won
      ?(toolsUsed?(toolsUsed===1?t('result.toolCap',{n:toolsUsed,max:toolStarCap(toolsUsed)}):t('result.toolCapMany',{n:toolsUsed})):stars<3?t('result.betterStars'):t('result.bestSolved'))
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
