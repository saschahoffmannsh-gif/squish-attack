// Kampagne: DOM-Teile (Ziel-Anzeige, Züge, Hilfsmittel, Ergebnis-Dialog, Levelauswahl).
// Reine Darstellung; Spiellogik und Speichern liegen in game.mjs / campaign.mjs.
import {goalProgress,goalText,movesLeft,totalStars,lockReason,chapterOf,starGate,CHAPTER_SIZE,toolName} from './campaign.mjs?v=launch-3';

const $=id=>document.getElementById(id);
const fmt=n=>Number(n||0).toLocaleString('de-DE');
const starText=(n,max=3)=>'★'.repeat(n)+'☆'.repeat(Math.max(0,max-n));

export function lockText(lock){
  if(!lock)return '';
  if(lock.reason==='stars')return `Kapitel ${lock.chapter} braucht ${lock.need} ★ – du hast ${lock.have} ★. Hol dir mehr Sterne in den bisherigen Leveln.`;
  return 'Schaff zuerst das Level davor.';
}

export function createCampaignUI({onPlay,onNext,onRetry,onExtra,onMenu,onTool,onCloseSelect}={}){
  const hud=$('campaign-hud'),levelEl=$('campaign-level'),goalsEl=$('campaign-goals'),movesEl=$('campaign-moves');
  const tools=$('campaign-tools'),extraBtn=$('tool-extra'),hammerBtn=$('tool-hammer');
  const result=$('campaign-result'),rKicker=$('campaign-result-kicker'),rTitle=$('campaign-result-title'),rStars=$('campaign-result-stars');
  const rMessage=$('campaign-result-message'),rGift=$('campaign-result-gift');
  const bNext=$('campaign-next'),bExtra=$('campaign-extra'),bRetry=$('campaign-retry'),bMenu=$('campaign-menu');
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
  function renderTools(inv,{canExtra=true,hammerArmed=false}={}){
    tools.hidden=false;
    extraBtn.querySelector('[data-count]').textContent=String(inv.extraMoves);
    hammerBtn.querySelector('[data-count]').textContent=String(inv.hammer);
    extraBtn.disabled=!(inv.extraMoves>0&&canExtra);
    hammerBtn.disabled=!(inv.hammer>0)&&!hammerArmed;
    hammerBtn.classList.toggle('is-armed',hammerArmed);
    hammerBtn.setAttribute('aria-pressed',String(hammerArmed));
    extraBtn.setAttribute('aria-label',`Hilfsmittel +3 Züge, ${inv.extraMoves} vorhanden`);
    hammerBtn.setAttribute('aria-label',`Hilfsmittel Hammer: einen Stein entfernen, ${inv.hammer} vorhanden`);
  }
  function hide(){hud.hidden=true;tools.hidden=true;hideResult();}
  extraBtn.addEventListener('click',()=>onTool?.('extraMoves'));
  hammerBtn.addEventListener('click',()=>onTool?.('hammer'));

  // ---------- Ergebnis ----------
  function showResult({n,won,stars,moves,limit,lostReason,canNext,nextLock,gifts=[],extraAvailable=0,toolsUsed=0}){
    rKicker.textContent=`LEVEL ${n}`;
    rTitle.textContent=won?(stars===3?'Perfekt!':'Geschafft!'):lostReason==='board-full'?'Kein Platz mehr':'Keine Züge mehr';
    rStars.hidden=!won;rStars.textContent=starText(stars);rStars.setAttribute('aria-label',`${stars} von 3 Sternen`);
    rStars.dataset.stars=String(stars);
    rMessage.textContent=won
      ?`In ${moves} ${moves===1?'Zug':'Zügen'} gelöst.`+(toolsUsed?' Mit Hilfsmittel gibt es höchstens 2 ★.':stars<3?' Mit weniger Zügen gibt es mehr Sterne.':'')
      :(lostReason==='board-full'?'Das Brett ist voll.':'Das Ziel ist noch nicht erreicht.')+(extraAvailable?' Du kannst +3 Züge einsetzen (dann höchstens 2 ★).':' Versuch es noch einmal!');
    rGift.hidden=!gifts.length;
    rGift.textContent=gifts.length?`Geschenk: ${gifts.map(g=>toolName(g.type)).join(' + ')}!`:'';
    bNext.hidden=!won;bNext.disabled=!canNext;
    bNext.textContent=canNext?'Nächstes Level':nextLock?'Nächstes Level gesperrt':'Alle Level geschafft';
    bNext.title=nextLock?lockText(nextLock):'';
    bExtra.hidden=won||!extraAvailable||lostReason!=='moves';
    bExtra.textContent=`+3 Züge einsetzen (${extraAvailable})`;
    bRetry.textContent=won?'Nochmal spielen':'Nochmal';
    bRetry.classList.toggle('primary',!won&&bExtra.hidden);
    result.hidden=false;
    (won&&canNext?bNext:!bExtra.hidden?bExtra:bRetry).focus({preventScroll:true});
    if(won&&!canNext&&nextLock){rMessage.textContent+=' '+lockText(nextLock);}
  }
  function hideResult(){result.hidden=true;}
  bNext.addEventListener('click',()=>onNext?.());
  bExtra.addEventListener('click',()=>onExtra?.());
  bRetry.addEventListener('click',()=>onRetry?.());
  bMenu.addEventListener('click',()=>onMenu?.());

  // ---------- Levelauswahl ----------
  function onKey(ev){if(ev.key==='Escape'){ev.preventDefault();closeSelect();}}
  function openSelect({levels,progress}){
    lastFocus=document.activeElement;
    const count=levels.length,total=totalStars(progress);
    selTotal.textContent=`★ ${total} von ${count*3}`;
    lockNote.textContent='';
    const groups=[];
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
        const num=document.createElement('span');num.className='num';num.textContent=lock?'🔒':String(n);
        const st=document.createElement('span');st.className='stars';st.textContent=rec?starText(rec.stars):lock?'':'☆☆☆';
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

  return {renderHud,renderTools,hide,showResult,hideResult,openSelect,closeSelect,
    get resultOpen(){return !result.hidden;},get selectOpen(){return !select.hidden;}};
}
