import {createScoreLedger} from './score-ledger.mjs?v=reward-fx-1';
import {createFlipbookLayer,hexColor} from './vfx-flipbooks.mjs?v=vfx-3';
import {createComboMeter,comboTint} from './combo-meter.mjs?v=combo-1';
const palette=['#00b5ff','#f31954','#00dc45','#ff850c','#9239ff','#ffc829','#f44ebd','#20d8ce'];
const gold='#ffce70',ivory='#fff8dd';
const GOLD=hexColor('#ffc964'),IVORY=hexColor(ivory);
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const hue=value=>palette[((value||1)-1)%palette.length];
// Bits atlas cells (static Blender renders): gel droplet, glint, light orb, gold-chrome pearl.
const BIT={gel:0,glint:1,orb:2,pearl:3};
// World width of each flipbook cell in board pitches (Blender orthographic scale).
const SCALE={merge:3.2,quad:4,super:5.2,record:5.2,column:2.3,aura:2.4,bits:1};
export function mergeProfile(group,combo=1){
  const count=group.cells.length,kind=group.street?'street':count>=5?'super':count===4?'quad':'triple';
  return {kind,color:hue(group.nextValue),power:kind==='super'?1.85:kind==='quad'?1.35:kind==='street'?1.15:1,particles:Math.min(32,(kind==='super'?32:kind==='quad'?24:kind==='street'?18:16)+Math.min(3,combo-1)*2),rings:kind==='super'?3:kind==='quad'?2:1,points:group.nextValue*count*10};
}
export function celebrationFor(group,combo=1){
  if(combo>=4)return {title:'SQUISHTASTISCH!',subtitle:`KETTE ×${combo}`,priority:4};
  if(combo===3)return {title:'FANTASTISCH!',subtitle:'KETTE ×3',priority:3};
  if(group&&!group.street&&group.cells.length>=5)return {title:'MEGA SQUISH!',subtitle:'+2 STUFEN',priority:3};
  if(combo===2)return {title:'SÜSS!',subtitle:'KETTE ×2',priority:2};
  if(group?.street&&group.cells.length>=4)return {title:'FLOW!',subtitle:'PERFEKTE STRASSE',priority:1};
  if(group&&!group.street&&group.cells.length===4)return {title:'SQUISH!',subtitle:'VIER AUF EINEN STREICH',priority:1};
  return null;
}
// Which rendered layers one merge plays. Triggers that fire together are
// folded into one composed tier instead of two complete effects.
export function vfxTier(group,{peak=false,record=false}={}){
  const count=group.cells?.length||3,kind=group.street?'street':count>=5?'super':count===4?'quad':'triple';
  const base=kind==='super'?'super':kind==='quad'?'quad':'merge';
  return {kind,base,peak:peak&&!record,record,rank:(record?3:peak?1.5:0)+(base==='super'?3:base==='quad'?2:1)};
}

// Rendered flipbooks on one bounded WebGL layer; logic ticks only while busy.
export function createMergeEffects(layer,reduceMotion,{
  scoreElement=document.getElementById('score'),recordElement=document.getElementById('best'),
  onCollect=()=>{},onCountEnd=()=>{},onCountCancel=()=>{},onRecord=()=>{},onRecordCollect=()=>{},page=document,
}={}) {
  const vfx=createFlipbookLayer(layer,{page});
  // Merge first; the rarer tiers follow while the player reads the board.
  // Merges are real gel now (fusion.mjs); only the light bits and the combo
  // cushions remain as rendered sprites.
  setTimeout(()=>vfx.preload(['bits','cushion']),400);
  const counter=scoreElement?.closest('.run-score'),format=new Intl.NumberFormat('de-DE');
  const ledger=createScoreLedger(value=>{if(scoreElement)scoreElement.textContent=format.format(value);});
  const announcement=page.getElementById?.('score-announcement');
  const labels=new Set();
  const comboElement=page.getElementById?.('combo-meter'),meter=createComboMeter(comboElement,{page,reduceMotion});
  let raf=0,jobs=[],disposed=false,serial=1,comboLabel,recordLabel,hero,counterPulse,bigBursts=[];
  let heroPriority=0,heroUntil=0,heroKey='',lastPulse=-Infinity;
  let arrivals=0,totalFlights=0,fill=0,holdUntil=0,lastCollect=-Infinity,counting=false;
  let lastRecordCollect=-Infinity,lastScoreReceipt=-Infinity,lastRecordReceipt=-Infinity,tickCost=0;
  const now=()=>performance.now();
  const size=()=>vfx.size;
  function px(p){const {width,height}=size();return {x:p.x/100*width,y:p.y/100*height,pitch:(p.size||14)/95*width};}
  function anchor(element,fallback){
    if(!element)return fallback;
    const a=element.getBoundingClientRect(),b=layer.getBoundingClientRect();
    return {x:(a.left+a.width/2-b.left)/Math.max(1,b.width)*100,y:(a.top+a.height/2-b.top)/Math.max(1,b.height)*100,size:a.width/Math.max(1,b.width)*100};
  }
  function add(job){
    if(jobs.length>=70){const index=jobs.findIndex(j=>j.kind!=='swarm'&&j.kind!=='record');jobs.splice(index<0?0:index,1);}
    jobs.push(job);wake();
  }
  function wake(){if(!raf&&!disposed&&!page.hidden)raf=requestAnimationFrame(tick);}
  function label(className,position,text,duration=900,customFrames){
    if(labels.size>=12){const first=labels.values().next().value;first.getAnimations().forEach(a=>a.cancel());first.remove();labels.delete(first);}
    const el=page.createElement('div');el.className=className;el.style.left=`${clamp(position.x,12,88)}%`;el.style.top=`${clamp(position.y,12,77)}%`;el.textContent=text;layer.append(el);labels.add(el);
    const frames=customFrames||(reduceMotion.matches||className==='fx-record-label'?[{opacity:0},{opacity:1,offset:.12},{opacity:1,offset:.78},{opacity:0}]:[
      {opacity:0,transform:'translate(-50%,-20%) scale(.86)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.16},
      {opacity:1,transform:'translate(-50%,-75%) scale(1)',offset:.65},{opacity:0,transform:'translate(-50%,-100%) scale(.98)'}]);
    const animation=el.animate(frames,{duration,easing:'linear',fill:'forwards'});
    animation.finished.then(()=>{labels.delete(el);el.remove();},()=>{labels.delete(el);el.remove();});return el;
  }
  // ------------------------------------------------------------ rendered layers
  function aura(){}
  // A moving rendered particle; `path(t)` returns layer percentages.
  function particle(cell,{tint,size:w,life,delay=0,path,alpha=1,gain=1.25,hot=1,cover=.85,spin=0,rotate=0}){
    const {width,height}=size();
    return vfx.stamp('bits',cell,{w,tint,gain,hot,cover,alpha,life,delay,spin,rotate,x:-999,y:-999,track(s,age){
      const t=clamp(age/life),q=path(t,s);s.x=q.x/100*width;s.y=q.y/100*height;if(q.alpha!==undefined)s.alpha=alpha*q.alpha;if(q.w){s.w=s.h=q.w;}
    }});
  }
  function shower(position,{count=18,tint=GOLD,spread=26,life=1.2}={}){
    if(reduceMotion.matches||page.hidden)return;
    const {width}=size(),base=position.size||14;
    for(let i=0;i<count;i++){
      const a=i*2.39996,s=.35+((i*37)%17)/17*.65,dx=Math.cos(a)*spread*s,dy=-Math.abs(Math.sin(a))*spread*.55*s-4,cell=i%3===0?BIT.glint:BIT.pearl;
      const w=(cell===BIT.pearl?.05:.11)*base/100*width*(1.6+s);
      particle(cell,{tint,size:w,life:life*(.7+s*.4),delay:i*9,spin:(i%2?1:-1)*3,alpha:1,path:t=>({x:position.x+dx*(1-(1-t)**2),y:position.y+dy*(1-(1-t)**2)+28*t*t,alpha:Math.min(1,t*8)*(1-clamp((t-.6)/.4))})});
    }
  }
  function showHero(reward){
    if(!reward||page.hidden)return;
    const key=reward.title+reward.subtitle,time=now();
    if(time<heroUntil&&(reward.priority<heroPriority||key===heroKey))return;
    hero?.getAnimations().forEach(a=>a.cancel());hero?.remove();if(hero)labels.delete(hero);
    heroPriority=reward.priority;heroUntil=time+(reward.priority===5?1500:900);heroKey=key;
    const frames=reduceMotion.matches?[{opacity:0},{opacity:1,offset:.12},{opacity:1,offset:.8},{opacity:0}]:[
      {opacity:0,transform:'translate(-50%,-50%) rotate(-7deg) scale(.35)'},
      {opacity:1,transform:'translate(-50%,-50%) rotate(2deg) scale(1.13)',offset:.16},
      {opacity:1,transform:'translate(-50%,-50%) rotate(-1deg) scale(.97)',offset:.30},
      {opacity:1,transform:'translate(-50%,-50%) rotate(0) scale(1)',offset:.46},
      {opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.75},
      {opacity:0,transform:'translate(-50%,-70%) scale(1.05)'}];
    hero=label(`fx-hero${reward.priority===5?' fx-hero--record':''}${reward.title.length<8?' fx-hero--short':''}`,{x:50,y:73},'',reward.priority===5?1500:1050,frames);
    const title=page.createElement('strong'),sub=page.createElement('small');title.textContent=reward.title;sub.textContent=reward.subtitle;hero.append(title);hero.append(sub);
    // Soft rendered light bloom behind the headline (no ring, no core).
    if(!reduceMotion.matches){const {width,height}=size(),record=reward.priority===5;
      vfx.stamp('bits',BIT.orb,{x:width*.5,y:height*.725,w:width*1.05,h:width*.42,tint:record?GOLD:hexColor('#ff6a8e'),gain:record?.9:.7,hot:0,cover:0,alpha:.8,life:record?1.4:1,fadeIn:.12,fadeOut:.45});}
  }
  function pulseCounter(time){
    if(reduceMotion.matches||!counter?.animate||time-lastPulse<150)return;
    lastPulse=time;counter.classList.add('is-receiving');counterPulse?.cancel();
    counterPulse=counter.animate([{transform:'scale(1)'},{transform:'scale(1.15)',offset:.27},{transform:'scale(.98)',offset:.65},{transform:'scale(1)'}],{duration:260,easing:'linear'});
    counterPulse.finished.catch(()=>{});
  }
  function stopCounting(complete){if(counting){counting=false;if(complete)onCountEnd();else onCountCancel();}}
  function resetFlights(){stopCounting(false);jobs=jobs.filter(j=>!(j.kind==='swarm'&&j.purpose==='score'));for(const s of beadSprites('score'))s.life=0;arrivals=totalFlights=0;fill=0;holdUntil=0;counter?.classList.remove('is-collecting');counter?.classList.remove('is-receiving');counter?.style.setProperty('--score-fill','0');counterPulse?.cancel();counterPulse=null;}
  const flights=new Set();
  function* beadSprites(purpose){for(const f of flights)if(f.purpose===purpose)for(const s of f.sprites)yield s;}
  function settle(){ledger.finish();jobs=[];flights.clear();vfx.clear();bigBursts=[];resetFlights();if(raf)cancelAnimationFrame(raf);raf=0;for(const el of labels){el.getAnimations().forEach(a=>a.cancel());el.remove();}labels.clear();comboLabel=recordLabel=hero=null;heroPriority=heroUntil=0;heroKey='';}
  function visibility(){if(page.hidden)settle();}
  page.addEventListener('visibilitychange',visibility);reduceMotion.addEventListener?.('change',settle);
  function flying(kind){return jobs.reduce((n,j)=>n+(j.kind==='swarm'&&j.purpose===kind?j.beads.length-j.completed:0),0);}
  function tracker(path,life){
    const {width,height}=size();
    return (s,age)=>{const q=path(clamp(age/life),s);s.x=q.x/100*width;s.y=q.y/100*height;if(q.alpha!==undefined)s.alpha=q.alpha;if(q.w){const r=s.h/s.w;s.w=q.w;s.h=q.w*r;}};
  }
  function tick(time){
    raf=0;if(disposed||page.hidden)return;
    const began=now();
    const wasCounting=ledger.busy;ledger.update(time);
    if(wasCounting&&!ledger.busy&&announcement)announcement.textContent=`${format.format(ledger.target)} Punkte`;
    const kept=[];
    for(const job of jobs){
      const age=time-job.start;if(age<0){kept.push(job);continue;}
      const t=clamp(age/job.life);
      if(job.kind==='record'&&age>=job.notifyAt&&!job.notified&&age<job.life){
        job.notified=true;onRecord(job.value);
        {const p=px(job.target);
          vfx.stamp('bits',BIT.orb,{x:p.x,y:p.y,w:p.pitch*2.6,tint:GOLD,gain:1,hot:.35,cover:0,alpha:.85,life:1.2,fadeIn:.08,fadeOut:.7});
          vfx.stamp('bits',BIT.glint,{x:p.x,y:p.y,w:p.pitch*1.6,tint:GOLD,gain:1.2,hot:1,cover:0,alpha:1,life:.7,fadeIn:.05,fadeOut:.45,spin:.8});}
        shower(job.target,{count:20,spread:22});
      }
      if(job.kind==='swarm'){
        let received=0;
        for(const bead of job.beads)if(!bead.arrived&&age>=bead.delay+bead.duration){bead.arrived=true;job.completed++;received++;}
        if(received&&job.purpose==='score'){
          arrivals+=received;fill=Math.max(fill,arrivals/Math.max(1,totalFlights));holdUntil=time+330;counter?.style.setProperty('--score-fill',String(fill));pulseCounter(time);
          const first=!counting;counting=true;
          if(first||time-lastCollect>95){onCollect({received,progress:fill});lastCollect=time;}
          if(time-lastScoreReceipt>110){aura(job.target,{tint:GOLD,scale:.42,alpha:.75,gain:1.1,hot:.9});lastScoreReceipt=time;}
        }else if(received&&job.purpose==='record'&&age<(job.ceremony?.life||job.life)){
          if(job.ceremony)job.ceremony.received+=received;
          if(time-lastRecordCollect>160){onRecordCollect();lastRecordCollect=time;}
          if(time-lastRecordReceipt>140){aura(job.target,{tint:hexColor(hue(job.ceremony?.value)),scale:.55,alpha:.8});lastRecordReceipt=time;}
        }
        if(t>=1)flights.delete(job);
      }
      if(t<1)kept.push(job);
    }
    jobs=kept;
    if(!ledger.busy&&!jobs.some(j=>j.kind==='swarm'&&j.purpose==='score'))stopCounting(true);
    if(!ledger.busy&&time>holdUntil&&!jobs.some(j=>j.kind==='swarm'&&j.purpose==='score')){counter?.classList.remove('is-collecting');counter?.classList.remove('is-receiving');}
    tickCost=tickCost*.8+Math.max(0,now()-began)*.2;
    if(jobs.length||ledger.busy||time<holdUntil)wake();
  }
  return {
    vfx,
    syncScore(value,force=false){if(force||value!==ledger.target)resetFlights();ledger.sync(value,force);},
    // Former rendered merge layers; the fused gel body replaces them.
    charge(){},
    trace(){},
    // The fused gel body pops on the board itself; this keeps only the headline.
    merge(group,combo=1){showHero(celebrationFor(group,combo));},
    // Points: the +N rises from the popped body and the counter rolls up.
    award(groups,from,to){
      if(reduceMotion.matches||page.hidden){resetFlights();ledger.sync(to,true);if(announcement)announcement.textContent=`${format.format(to)} Punkte`;return;}
      const start=now();
      const awards=groups.map((g,index)=>({points:g.nextValue*g.cells.length*10,delay:140+index*60}));
      if(!ledger.queue(from,to,awards,start))return;
      groups.forEach(group=>{
        const points=group.nextValue*group.cells.length*10,at={...group.position,y:group.position.y-group.position.size*.3};
        label(`fx-points${points>=1000?' fx-points--big':''}`,at,`+${format.format(points)}`,1050);
      });
      counter?.classList.add('is-receiving');holdUntil=start+520;
      const first=!counting;counting=true;if(first)onCollect({received:1,progress:1});
      setTimeout(()=>pulseCounter(now()),150);wake();
    },
    record(position,value,reward){
      if(page.hidden)return;
      showHero({title:'NEUER REKORD!',subtitle:`DEIN ${format.format(value)}ER SQUISH`,priority:5});
      recordLabel?.getAnimations().forEach(a=>a.cancel());recordLabel?.remove();
      for(const f of flights)if(f.purpose==='record'){for(const s of f.sprites)s.life=0;flights.delete(f);}
      jobs=jobs.filter(j=>j.kind!=='record'&&!(j.kind==='swarm'&&j.purpose==='record'));
      recordLabel=label('fx-record-label',{x:20,y:18},'NEUER\nREKORD',1850);
      if(reduceMotion.matches){onRecord(value);return;}
      const start=now(),target=anchor(recordElement,{x:50,y:18,size:14});
      add({kind:'record',position,target,value,start,notifyAt:380,life:1500,received:0});
    },
    upgrade(position,value,nextValue){if(!page.hidden)label('fx-upgrade',{x:position.x,y:position.y-position.size*.48},`${value} → ${nextValue} · SUPER`,1100);},
    pop(){},
    // Move combo: rendered gel aura and burst behind the meter, rising with the count.
    streak(count,{silent=false}={}){
      if(count<2){const was=silent?(meter.clear(),0):meter.end();
        if(was>=2&&!reduceMotion.matches&&!page.hidden&&comboElement){const p=px(anchor(comboElement,{x:50,y:17,size:46})),tint=hexColor(comboTint(was));
          vfx.stamp('bits',BIT.orb,{x:p.x,y:p.y+p.pitch*.05,w:p.pitch*.9,h:p.pitch*.22,tint,gain:.6,hot:0,cover:0,alpha:.35,life:.7,fadeIn:.1,fadeOut:.5});}
        return;}
      meter.show(count);
      if(reduceMotion.matches||page.hidden||!comboElement)return;
      const p=px(anchor(comboElement,{x:50,y:17,size:46})),tint=hexColor(comboTint(count)),energy=clamp((count-2)/5),w=p.pitch;
      // Soft rendered bloom behind the glyphs, then gel beads splash off the number.
      vfx.stamp('bits',BIT.orb,{x:p.x,y:p.y,w:w*(1+energy*.25),h:w*(.3+energy*.06),tint,gain:.8+energy*.3,hot:0,cover:0,alpha:.5+energy*.35,life:.8,fadeIn:.05,fadeOut:.55});
      const n=2+Math.round(energy*6),cx=p.x+w*.44;
      for(let i=0;i<n;i++){const a=-Math.PI*.35+(i/(Math.max(1,n-1))-.5)*Math.PI*1.1,dist=w*(.12+.07*((i*37)%7)/7+energy*.05),life=.6+((i*13)%5)*.04,size=w*(.045+energy*.02)*(1-.25*(i%2));
        vfx.play('cushion',{x:cx,y:p.y,w:size,tint,gain:1.25,hot:.9,cover:.88,fps:30,wrap:true,life,fadeOut:.25,delay:40+i*18,
          track:(sp,age)=>{const t=Math.min(1,age/life),e=1-(1-t)**2;sp.x=cx+Math.cos(a)*dist*e;sp.y=p.y+Math.sin(a)*dist*.55*e+w*.12*t*t;}});}
      if(count>=7)vfx.stamp('bits',BIT.orb,{x:cx,y:p.y,w:w*.5,h:w*.3,tint:GOLD,gain:1,hot:.3,cover:0,alpha:.7,life:.9,fadeIn:.08,fadeOut:.6,delay:60});
      if(announcement)announcement.textContent=`Combo ${count}`;
    },
    combo(count){if(count<2||page.hidden)return;showHero(celebrationFor(null,count));},
    finish(){settle();},
    clear(){settle();meter.clear();for(const el of labels){el.getAnimations().forEach(a=>a.cancel());el.remove();}labels.clear();comboLabel=recordLabel=null;},
    dispose(){this.clear();disposed=true;page.removeEventListener('visibilitychange',visibility);reduceMotion.removeEventListener?.('change',settle);vfx.dispose();},
    get stats(){const scoreFlying=flying('score'),recordFlying=flying('record');return {jobs:jobs.length,flying:scoreFlying+recordFlying,scoreFlying,recordFlying,labels:labels.size,running:!!raf,score:ledger.displayed,target:ledger.target,tickMs:Math.round(tickCost*100)/100,vfx:vfx.stats};},
  };
}
