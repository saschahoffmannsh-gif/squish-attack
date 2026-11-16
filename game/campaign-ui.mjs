// Kampagne: DOM-Teile (Ziel-Anzeige, Züge, Hilfsmittel, Ergebnis-Dialog, Levelauswahl).
// Reine Darstellung; Spiellogik und Speichern liegen in game.mjs / campaign.mjs.
import {TOOL_ICONS,GIFT_SVG} from './tool-icons.mjs?v=launch-25';
import {t, fmtNum, hasKey, onLangChange} from './i18n.mjs?v=launch-25';
import {fitLabelsSoon} from './fit-labels.mjs?v=launch-25';
import {goalProgress,goalText,goalShort,movesLeft,totalStars,lockReason,chapterOf,starGate,CHAPTER_SIZE,toolName} from './campaign.mjs?v=launch-25';

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
  const hud=$('campaign-hud'),levelEl=$('campaign-level'),goalsEl=$('campaign-goals'),movesEl=$('campaign-moves'),tipEl=$('campaign-tip');
  const tools=$('campaign-tools'),extraBtn=$('tool-extra'),hintBtn=$('tool-hint'),rocketBtn=$('tool-rocket'),wandBtn=$('tool-wand');
  for(const b of [hintBtn,rocketBtn,wandBtn]){const ico=b.querySelector('[data-icon]');if(ico&&!ico.firstChild)ico.innerHTML=TOOL_ICONS[ico.dataset.icon];}
  const result=$('campaign-result'),rKicker=$('campaign-result-kicker'),rTitle=$('campaign-result-title'),rStars=$('campaign-result-stars');
  const rMessage=$('campaign-result-message'),rGift=$('campaign-result-gift');
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
  // armed: 'rocket' | 'wand' | null; busy: 'hint' während der Suche/Vorführung.
  // shop: bei 0 zeigt die Kachel ein grünes Plus und öffnet beim Antippen den Shop.
  // refill: 'ad' (launch-13: Dummy-Werbung) | 'shop' | null – bestimmt, was das grüne Plus bei 0 öffnet.
  function renderTools(inv,opts={}){
    const {canExtra=true,armed=null,busy=null,locked=false,shop=false,refill=shop?'shop':null}=opts;
    lastTools={inv,opts:{canExtra,armed,busy,locked,shop,refill}};tools.hidden=false;
    const set=(btn,n,enabled,label)=>{
      const empty=!(n>0),toShop=empty&&!!refill;
      const c=btn.querySelector('[data-count]');c.textContent=toShop?'+':String(n|0);c.classList.toggle('is-zero',empty&&!refill);
      btn.classList.toggle('is-empty',toShop);btn.dataset.shop=toShop?'1':'';btn.dataset.refill=toShop?refill:'';
      btn.disabled=toShop?!!locked:!enabled;
      btn.setAttribute('aria-label',toShop?t(refill==='ad'?'tool.emptyAd':'tool.emptyShop',{label}):t('tool.countAria',{label,n:n|0}));
    };
    set(extraBtn,inv.extraMoves,inv.extraMoves>0&&canExtra&&!locked,t('tool.help.extra'));
    set(hintBtn,inv.hint,(inv.hint>0&&!locked)||busy==='hint',t('tool.help.hint'));
    set(rocketBtn,inv.rocket,(inv.rocket>0&&!locked)||armed==='rocket',t('tool.help.rocket'));
    set(wandBtn,inv.wand,(inv.wand>0&&!locked)||armed==='wand',t('tool.help.wand'));
    for(const [btn,type] of [[rocketBtn,'rocket'],[wandBtn,'wand']]){btn.classList.toggle('is-armed',armed===type);btn.setAttribute('aria-pressed',String(armed===type));}
    hintBtn.classList.toggle('is-busy',busy==='hint');hintBtn.classList.toggle('is-armed',busy==='hint');
  }
  function hide(){hud.hidden=true;tools.hidden=true;if(tipEl)tipEl.hidden=true;hideResult();}
  extraBtn.addEventListener('click',()=>onTool?.('extraMoves'));
  hintBtn.addEventListener('click',()=>onTool?.('hint'));
  rocketBtn.addEventListener('click',()=>onTool?.('rocket'));
  wandBtn.addEventListener('click',()=>onTool?.('wand'));

  // ---------- Ergebnis ----------
  function showResult({n,won,stars,moves,limit,lostReason,canNext,nextLock,gifts=[],extraAvailable=0,extraAd=false,toolsUsed=0,toolLevel=null,unlockModes=false}){
    const extraOffer=extraAvailable>0||extraAd;
    result.dataset.outcome=won?'won':'lost';
    lastResult={n,won,stars,moves,limit,lostReason,canNext,nextLock,gifts,extraAvailable,extraAd,toolsUsed,toolLevel,unlockModes};
    rKicker.textContent=t('campaign.levelLabel',{n});
    rTitle.textContent=won?(stars===3?t('result.perfect'):t('result.clear')):lostReason==='board-full'?t('result.full'):t('result.noMoves');
    rStars.hidden=!won;rStars.setAttribute('aria-label',t('campaign.starsOf',{n:stars,max:3}));
    rStars.dataset.stars=String(won?stars:0);
    rMoves.textContent=won?String(moves):`${moves}/${limit}`;
    rStarCount.textContent=won?`${stars} / 3`:'–';
    rMessage.textContent=won
      ?(toolsUsed?t('result.toolCap'):stars<3?t('result.betterStars'):t('result.bestSolved'))
      :(lostReason==='board-full'?t('result.boardFull'):t('result.goalOpen'))+(extraOffer&&lostReason==='moves'?t('result.extraOffer'):t('result.tryAgain'))
        +(toolLevel&&toolLevel!=='extraMoves'?t('result.hardTip',{tool:toolName(toolLevel)}):'');
    if(won&&unlockModes)rMessage.textContent+=t('lock.resultBonus');
    if(won&&!canNext&&nextLock)rMessage.textContent+=' '+lockText(nextLock);
    else if(won&&!canNext)rMessage.textContent+=t('result.allDone');
    setGifts(gifts);
    bNext.hidden=!won;bNext.disabled=!canNext;
    setLabel(bNext,canNext?t('result.next'):nextLock?t('result.locked'):t('result.done'));
    bNext.title=nextLock?lockText(nextLock):'';
    bExtra.hidden=won||!extraOffer||lostReason!=='moves';
    const viaAd=!(extraAvailable>0);bExtra.dataset.refill=viaAd?'ad':'';
    setLabel(bExtra,viaAd?t('result.extraAd'):t('result.extraCount',{n:extraAvailable}));
    bExtra.setAttribute('aria-label',viaAd?t('result.extraAdAria'):t('result.extraUseAria',{n:extraAvailable}));
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
  function setGifts(gifts=[]){
    rGift.hidden=!gifts.length;
    rGift.innerHTML='';
    if(!gifts.length)return;
    const ico=document.createElement('span');ico.innerHTML=GIFT_SVG;
    const label=document.createElement('span');label.textContent=t(gifts.length>1?'result.giftOpenMore':'result.giftOpen',{tool:toolName(gifts[0].type)});
    rGift.append(ico.firstChild,label);
    if(gifts.length>1){const n=document.createElement('b');n.className='gift-n';n.textContent=String(gifts.length);rGift.append(n);}
    rGift.setAttribute('aria-label',t('result.giftAria',{n:gifts.length}));
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
      if(gate){const g=document.createElement('small');g.textContent=t(total>=gate?'campaign.gateOpen':'campaign.gate',{n:gate});g.className=total>=gate?'is-open':'';h.append(g);}
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

  return {toolButton:type=>({extraMoves:extraBtn,hint:hintBtn,rocket:rocketBtn,wand:wandBtn})[type],renderHud,renderTools,setGifts,giftButton:rGift,hide,showResult,hideResult,openSelect,closeSelect,mark,timeline,
    get resultOpen(){return !result.hidden;},get selectOpen(){return !select.hidden;}};
}
