// Kampagne: DOM-Teile (Ziel-Anzeige, Züge, Hilfsmittel, Ergebnis-Dialog, Levelauswahl).
// Reine Darstellung; Spiellogik und Speichern liegen in game.mjs / campaign.mjs.
import {TOOL_ICONS,GIFT_SVG} from './tool-icons.mjs?v=launch-12';
import {goalProgress,goalText,movesLeft,totalStars,lockReason,chapterOf,starGate,CHAPTER_SIZE,toolName} from './campaign.mjs?v=launch-12';

const $=id=>document.getElementById(id);
const fmt=n=>Number(n||0).toLocaleString('de-DE');
const starText=(n,max=3)=>'★'.repeat(n)+'☆'.repeat(Math.max(0,max-n));

export function lockText(lock){
  if(!lock)return '';
  if(lock.reason==='stars')return `Kapitel ${lock.chapter} braucht ${lock.need} ★ – du hast ${lock.have} ★. Hol dir mehr Sterne in den bisherigen Leveln.`;
  return 'Schaff zuerst das Level davor.';
}

export function createCampaignUI({onPlay,onNext,onRetry,onExtra,onMenu,onTool,onGift,onCloseSelect,onStar,reduceMotion}={}){
  const hud=$('campaign-hud'),levelEl=$('campaign-level'),goalsEl=$('campaign-goals'),movesEl=$('campaign-moves');
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
  let lastFocus=null;

  function renderHud(run,n){
    hud.hidden=false;
    levelEl.textContent=`LEVEL ${n}`;
    goalsEl.replaceChildren(...run.level.goals.map(goal=>{
      const p=goalProgress(goal,run),li=document.createElement('li');
      li.className=p.done?'is-done':'';
      const t=document.createElement('span');t.textContent=goalText(goal);
      const v=document.createElement('b');v.textContent=p.done?'✓':goal.type==='tile'?`${Math.min(p.target,Math.max(p.current,...run.board.flat().filter(Boolean).map(t=>t.value)))}/${p.target}`:`${fmt(p.current)}/${fmt(p.target)}`;
      li.append(t,v);return li;
    }));
    const left=Math.max(0,movesLeft(run));
    if(movesEl.textContent!==String(left))movesEl.textContent=String(left);
    movesEl.closest('.campaign-moves').classList.toggle('is-low',left<=2);
    movesEl.setAttribute('aria-label',`Noch ${left} Züge`);
  }
  // armed: 'rocket' | 'wand' | null; busy: 'hint' während der Suche/Vorführung.
  // shop: bei 0 zeigt die Kachel ein grünes Plus und öffnet beim Antippen den Shop.
  function renderTools(inv,{canExtra=true,armed=null,busy=null,locked=false,shop=false}={}){
    tools.hidden=false;
    const set=(btn,n,enabled,label)=>{
      const empty=!(n>0),toShop=empty&&shop;
      const c=btn.querySelector('[data-count]');c.textContent=toShop?'+':String(n|0);c.classList.toggle('is-zero',empty&&!shop);
      btn.classList.toggle('is-empty',toShop);btn.dataset.shop=toShop?'1':'';
      btn.disabled=toShop?!!locked:!enabled;
      btn.setAttribute('aria-label',toShop?`${label}: keine mehr – Shop öffnen`:`${label}, ${n|0} vorhanden`);
    };
    set(extraBtn,inv.extraMoves,inv.extraMoves>0&&canExtra&&!locked,'Hilfsmittel +3 Züge');
    set(hintBtn,inv.hint,(inv.hint>0&&!locked)||busy==='hint','Hilfsmittel Hinweis: spielt 2 Züge zum Ziel');
    set(rocketBtn,inv.rocket,(inv.rocket>0&&!locked)||armed==='rocket','Hilfsmittel Rakete: einen Stein wegsprengen');
    set(wandBtn,inv.wand,(inv.wand>0&&!locked)||armed==='wand','Hilfsmittel Zauberstab: Zahl eines Steins wählen');
    for(const [btn,type] of [[rocketBtn,'rocket'],[wandBtn,'wand']]){btn.classList.toggle('is-armed',armed===type);btn.setAttribute('aria-pressed',String(armed===type));}
    hintBtn.classList.toggle('is-busy',busy==='hint');hintBtn.classList.toggle('is-armed',busy==='hint');
  }
  function hide(){hud.hidden=true;tools.hidden=true;hideResult();}
  extraBtn.addEventListener('click',()=>onTool?.('extraMoves'));
  hintBtn.addEventListener('click',()=>onTool?.('hint'));
  rocketBtn.addEventListener('click',()=>onTool?.('rocket'));
  wandBtn.addEventListener('click',()=>onTool?.('wand'));

  // ---------- Ergebnis ----------
  function showResult({n,won,stars,moves,limit,lostReason,canNext,nextLock,gifts=[],extraAvailable=0,toolsUsed=0}){
    result.dataset.outcome=won?'won':'lost';
    rKicker.textContent=`LEVEL ${n}`;
    rTitle.textContent=won?(stars===3?'Perfekt!':'Level geschafft!'):lostReason==='board-full'?'Kein Platz mehr':'Keine Züge mehr';
    rStars.hidden=!won;rStars.setAttribute('aria-label',`${stars} von 3 Sternen`);
    rStars.dataset.stars=String(won?stars:0);
    rMoves.textContent=won?String(moves):`${moves}/${limit}`;
    rStarCount.textContent=won?`${stars} / 3`:'–';
    rMessage.textContent=won
      ?(toolsUsed?'Mit Hilfsmittel gibt es höchstens 2 ★.':stars<3?'Mit weniger Zügen gibt es mehr Sterne.':'Bestmöglich gelöst!')
      :(lostReason==='board-full'?'Das Brett ist voll.':'Das Ziel ist noch nicht erreicht.')+(extraAvailable&&lostReason==='moves'?' Mit +3 Zügen kannst du weiterspielen (dann höchstens 2 ★).':' Versuch es noch einmal!');
    if(won&&!canNext&&nextLock)rMessage.textContent+=' '+lockText(nextLock);
    else if(won&&!canNext)rMessage.textContent+=' Alle Level geschafft!';
    setGifts(gifts);
    bNext.hidden=!won;bNext.disabled=!canNext;
    setLabel(bNext,canNext?'Weiter':nextLock?'Gesperrt':'Geschafft');
    bNext.title=nextLock?lockText(nextLock):'';
    bExtra.hidden=won||!extraAvailable||lostReason!=='moves';
    setLabel(bExtra,`+3 Züge (${extraAvailable})`);
    bExtra.setAttribute('aria-label',`+3 Züge einsetzen, ${extraAvailable} vorhanden`);
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
    result.hidden=false;mark('dialog');
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
    const t=document.createElement('span');t.textContent=`Geschenk: ${toolName(gifts[0].type)}${gifts.length>1?' …':''} – öffnen!`;
    rGift.append(ico.firstChild,t);
    if(gifts.length>1){const n=document.createElement('b');n.className='gift-n';n.textContent=String(gifts.length);rGift.append(n);}
    rGift.setAttribute('aria-label',`${gifts.length} Geschenk${gifts.length>1?'e':''} öffnen`);
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
    lastFocus=document.activeElement;
    const count=levels.length,total=totalStars(progress);
    selTotal.textContent=`★ ${total} von ${count*3}`;
    lockNote.textContent='';
    const groups=[];let nextMarked=false;
    for(let start=1;start<=count;start+=CHAPTER_SIZE){
      const k=chapterOf(start),sec=document.createElement('section');sec.className='campaign-chapter';
      const h=document.createElement('h3');
      const gate=starGate(k);
      h.innerHTML='';const title=document.createElement('span');title.textContent=`Kapitel ${k}`;h.append(title);
      if(gate){const g=document.createElement('small');g.textContent=total>=gate?`ab ${gate} ★ ✓`:`ab ${gate} ★`;g.className=total>=gate?'is-open':'';h.append(g);}
      const grid=document.createElement('div');grid.className='campaign-grid';
      for(let n=start;n<Math.min(count+1,start+CHAPTER_SIZE);n++){
        const lock=lockReason(progress,n),rec=progress.levels[String(n)];
        const b=document.createElement('button');b.type='button';b.className='campaign-level-btn';b.dataset.level=String(n);
        if(lock){b.classList.add('is-locked');b.setAttribute('aria-disabled','true');}
        if(rec)b.classList.add('is-done');
        if(!lock&&!rec&&!nextMarked){b.classList.add('is-next');nextMarked=true;}
        const num=document.createElement('span');num.className='num';num.textContent=lock?'🔒':String(n);
        const st=document.createElement('span');st.className='stars';
        if(rec){const b=document.createElement('b');b.textContent='★'.repeat(rec.stars);st.append(b,'☆'.repeat(3-rec.stars));}else st.textContent=lock?'':'☆☆☆';
        b.append(num,st);
        b.setAttribute('aria-label',lock?`Level ${n}, gesperrt. ${lockText(lock)}`:`Level ${n}${rec?`, ${rec.stars} von 3 Sternen`:', noch nicht gespielt'}`);
        b.addEventListener('click',()=>{
          if(lock){lockNote.textContent=`Level ${n}: ${lockText(lock)}`;b.classList.remove('shake');void b.offsetWidth;b.classList.add('shake');return;}
          closeSelect(true);onPlay?.(n);
        });
        grid.append(b);
      }
      sec.append(h,grid);groups.push(sec);
    }
    chapters.replaceChildren(...groups);
    select.hidden=false;selPanel.focus({preventScroll:true});
    document.addEventListener('keydown',onKey);
  }
  function closeSelect(silent=false){
    if(select.hidden)return;
    select.hidden=true;document.removeEventListener('keydown',onKey);
    if(!silent){lastFocus?.focus?.({preventScroll:true});onCloseSelect?.();}
  }
  $('campaign-close').addEventListener('click',()=>closeSelect());
  select.addEventListener('click',ev=>{if(ev.target===select)closeSelect();});

  return {toolButton:type=>({extraMoves:extraBtn,hint:hintBtn,rocket:rocketBtn,wand:wandBtn})[type],renderHud,renderTools,setGifts,giftButton:rGift,hide,showResult,hideResult,openSelect,closeSelect,mark,timeline,
    get resultOpen(){return !result.hidden;},get selectOpen(){return !select.hidden;}};
}
