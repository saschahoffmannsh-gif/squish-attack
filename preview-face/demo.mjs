// Standalone face preview. Uses live launch-38 engine modules as read-only
// imports. Isolated storage, no service worker, no backend writes.
import {createSquishGraphics,THREE,PARAMETERS} from '../squish/squish-graphics.js?v=play-sharp-1';
import {buildSquishy,initializeMotion,updateSquishy,bindGelOptics,PARAMETERS as HUD,pillowTopHeight} from '../game/original-gel-models.js?v=menu-1';
import {applyComic,comicBodyMaterial,setComicValue} from '../game/comic-style.mjs?v=launch-38';
import {applyGelSoftness} from '../game/gel-softness.mjs?v=launch-38';
import {applyNeonGlassLighting} from '../game/gel-lighting.mjs?v=launch-38';
import {configureRenderQuality} from '../game/render-quality.mjs?v=launch-38';
import {createCrispLabelFactory} from '../game/crisp-labels.mjs?v=launch-38';
import {SIZE,insertTile,settle,isGameOver,createStartValues} from '../game/game-logic.mjs?v=launch-38';
import {nextSpawn} from '../game/balance.mjs';
import {attachFace,attachFaces,updateFaces,eyeColorFor,EXPRESSIONS,MOUTHS} from './face.mjs';

const STORAGE='shift3-preview-face-v1';
const params=new URLSearchParams(location.search);
const noface=params.has('noface');

applyNeonGlassLighting(PARAMETERS,HUD);
applyGelSoftness(PARAMETERS,HUD);

function setupGraphics(host,{tiles=[]}={}){
  const graphics=createSquishGraphics(host,{tiles,bindPointer:false,autoStart:false,alpha:true});
  graphics.bloom.enabled=false;
  const labelFactory=createCrispLabelFactory({anisotropy:graphics.renderer.capabilities.getMaxAnisotropy(),comic:true});
  PARAMETERS.labelFactory=HUD.labelFactory=labelFactory;
  configureRenderQuality(graphics);
  return graphics;
}

function styleTile(s,value){
  s.value=value;
  const material=comicBodyMaterial(value,s.body.geometry);
  const old=s.body.material;s.body.material=material;
  if(old&&old!==material)old.dispose?.();
  applyComic(s,value);
  initializeMotion(s);bindGelOptics(s);
  if(s.bubbles)s.bubbles.visible=false;
  if(!noface)attachFace(s,{color:eyeColorFor(value)});
  return s;
}

function buildTile(value){
  const material=comicBodyMaterial(value);
  const s=buildSquishy(value,material);
  return styleTile(s,value);
}

// ---------- hero ----------
const heroHost=document.getElementById('hero-stage');
const heroGfx=setupGraphics(heroHost,{tiles:[]});
heroGfx.camera.position.set(0,5.4,4.5);
heroGfx.camera.lookAt(0,.2,0);
heroGfx.camera.fov=24;heroGfx.camera.updateProjectionMatrix();
if(heroGfx.board)heroGfx.board.visible=false;
if(heroGfx.caustics){try{heroGfx.caustics.dispose?.();heroGfx.caustics.visible=false;}catch{}}

const hero=buildTile(1);
hero.group.position.set(0,0,0);
hero.group.scale.setScalar(1.12);
heroGfx.scene.add(hero.group);
hero.face?.set('neutral');

let heroTime=0,heroLast=null,heroDirty=true;
function pumpHero(t){
  const tick0=performance.now();
  const now=t??tick0;
  const dt=heroLast==null?0:Math.min(.05,(now-heroLast)/1000);
  heroLast=now;heroTime+=dt;
  if(autoPlay)tickAuto(dt);
  // Gentle idle wobble so the sculpt shows deformation.
  if(!hero.press)hero.press={held:!1,releaseQueued:!1,age:0,compression:0,velocity:0,hasSwipe:!1,dragX:0,dragZ:0,swipeX:0,swipeZ:0,swipeVX:0,swipeVZ:0,inputX:0,inputZ:0,directionX:0,directionZ:0};
  hero.amplitude=Math.max(hero.amplitude||0,.08);
  updateSquishy(hero,heroTime,dt,true);
  hero.face?.update();
  // createSquishGraphics resets the camera to the full board on resize/render.
  heroGfx.camera.position.set(0,5.4,4.5);
  heroGfx.camera.near=.3;heroGfx.camera.far=80;
  heroGfx.camera.lookAt(0,.2,0);
  heroGfx.camera.updateProjectionMatrix();
  heroGfx.render(dt);
  if(window.__onHeroTick)window.__onHeroTick(performance.now()-tick0);
  requestAnimationFrame(pumpHero);
}
requestAnimationFrame(pumpHero);

function setHeroValue(v){
  const val=Math.max(1,v|0);
  setComicValue(hero.body.material,val);
  hero.value=val;
  hero.group.userData.value=val;
  // Rebuild the label so 1 / 8 / 16 stay crisp.
  if(hero.label){hero.group.remove(hero.label);hero.label.geometry?.dispose?.();hero.label.material?.dispose?.();}
  const {createLabel}=waitLabel();
  if(createLabel){hero.label=createLabel(val);hero.group.add(hero.label);initializeMotion(hero);}
}

function waitLabel(){
  try{
    return {createLabel:HUD.labelFactory||PARAMETERS.labelFactory};
  }catch{return {};}
}

// Expression buttons
const exprBox=document.getElementById('expressions');
const mouthBox=document.getElementById('mouths');
const status=document.getElementById('pose-status');
let currentExpr='neutral',currentMouth='w',autoPlay=false,autoT=0,autoStep=0;

const AUTO=[
  {expr:'sleepy',mouth:'w',hold:1.6},
  {expr:'neutral',mouth:'w',hold:.5},
  {expr:'blink',mouth:'w',hold:.18},
  {expr:'neutral',mouth:'w',hold:.4},
  {expr:'lookLeft',mouth:'w',hold:.8},
  {expr:'lookRight',mouth:'w',hold:.8},
  {expr:'neutral',mouth:'w',hold:.3},
  {expr:'wide',mouth:'o',hold:.9},
  {expr:'happy',mouth:'smile',hold:1.1},
  {expr:'happy',mouth:'laugh',hold:.9},
  {expr:'neutral',mouth:'w',hold:.6},
];

function applyHero(expr=currentExpr,mouth=currentMouth){
  currentExpr=expr;currentMouth=mouth;
  hero.face?.set(expr);
  hero.face?.set('mouth',mouth);
  if(status)status.textContent=`${expr} · ${mouth}`;
  for(const b of exprBox.querySelectorAll('button[data-expr]'))b.classList.toggle('is-on',b.dataset.expr===expr);
  for(const b of mouthBox.querySelectorAll('button[data-mouth]'))b.classList.toggle('is-on',b.dataset.mouth===mouth);
}

function tickAuto(dt){
  autoT+=dt;const step=AUTO[autoStep%AUTO.length];
  if(autoT>=step.hold){autoT=0;autoStep++;const n=AUTO[autoStep%AUTO.length];applyHero(n.expr,n.mouth);}
}

const EXPR_LABEL={neutral:'Neutral',blink:'Blink',lookLeft:'Schau links',lookRight:'Schau rechts',wide:'Große Augen',happy:'Glücklich ^^',sleepy:'Müde'};
const MOUTH_LABEL={w:'w',smile:'Lächeln',o:'o',laugh:'Lachen'};
for(const e of EXPRESSIONS){
  const b=document.createElement('button');b.type='button';b.dataset.expr=e;b.textContent=EXPR_LABEL[e]||e;
  b.addEventListener('click',()=>{autoPlay=false;document.getElementById('auto-btn')?.classList.remove('is-on');applyHero(e,e==='happy'?'smile':e==='wide'?'o':currentMouth);});
  exprBox.append(b);
}
for(const m of MOUTHS){
  const b=document.createElement('button');b.type='button';b.dataset.mouth=m;b.textContent=MOUTH_LABEL[m]||m;
  b.addEventListener('click',()=>{autoPlay=false;document.getElementById('auto-btn')?.classList.remove('is-on');applyHero(currentExpr,m);});
  mouthBox.append(b);
}
const autoBtn=document.getElementById('auto-btn');
autoBtn?.addEventListener('click',()=>{
  autoPlay=!autoPlay;autoT=0;autoStep=0;autoBtn.classList.toggle('is-on',autoPlay);
  if(autoPlay){const n=AUTO[0];applyHero(n.expr,n.mouth);}
});
document.getElementById('wobble-btn')?.addEventListener('click',()=>{hero.amplitude=.45;});
applyHero('neutral','w');

// ---------- mini board ----------
const boardHost=document.getElementById('board-stage');
const boardGfx=setupGraphics(boardHost,{tiles:[]});
if(boardGfx.board)boardGfx.board.visible=true;
boardGfx.camera.position.set(0,11.2,9.4);
boardGfx.camera.lookAt(0,0,0);

const pitch=PARAMETERS.board.pitch;
function cellPos(row,col){
  const o=(SIZE-1)/2;
  return {x:(col-o)*pitch,z:(row-o)*pitch};
}

let id=1,queue=[1,2,3],busy=false,score=0,boardTime=0,boardLast=null;
function asTile(v){
  if(!v)return null;
  if(typeof v==='object'){if(v.id==null)v.id=id++;return v;}
  return {id:id++,value:v};
}
let board=createStartValues().map(row=>row.map(asTile));
const tiles=new Map(); // id -> squish

function syncBoard(){
  const wanted=new Set();
  for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
    const t=board[r][c];if(!t)continue;
    wanted.add(t.id);
    let s=tiles.get(t.id);
    if(!s){
      s=buildTile(t.value);s.id=t.id;tiles.set(t.id,s);boardGfx.scene.add(s.group);
    }else if(s.value!==t.value){
      setComicValue(s.body.material,t.value);s.value=t.value;
    }
    s.row=r;s.col=c;
    const p=cellPos(r,c);
    if(!s.motion)s.group.position.set(p.x,0,p.z);
  }
  for(const [tid,s] of tiles){
    if(!wanted.has(tid)){boardGfx.scene.remove(s.group);s.face?.dispose();tiles.delete(tid);}
  }
}

function poseBoard(kind,payload){
  for(const s of tiles.values()){
    if(!s.face)continue;
    if(kind==='look')s.face.set('look',payload);
    else s.face.set(kind);
  }
}

async function playMove(dir,line){
  if(busy)return;busy=true;
  const look={left:{x:-1,y:0},right:{x:1,y:0},up:{x:0,y:1},down:{x:0,y:-1}}[dir]||{x:0,y:0};
  poseBoard('look',look);
  const tile={id:id++,value:queue[0]};
  const inserted=insertTile(board,dir,line,tile);
  if(!inserted.accepted){
    poseBoard('neutral');busy=false;showNote('Reihe voll');return;
  }
  board=inserted.board;queue=queue.slice(1).concat([nextSpawn({board,moves:1,highest:8,random:Math.random()})]);
  syncBoard();
  const next=settle(board);
  const merged=!!next.passes?.length;
  if(merged){
    poseBoard('wide');
    await new Promise(r=>setTimeout(r,120));
    board=next.board;score+=next.points||0;
    syncBoard();
    poseBoard('happy');
    for(const s of tiles.values())s.amplitude=.4;
    await new Promise(r=>setTimeout(r,380));
  }
  document.getElementById('score').textContent=String(score);
  if(!merged)poseBoard('neutral');
  else setTimeout(()=>poseBoard('neutral'),700);
  if(isGameOver(board))showNote('Brett voll — Neu startet');
  busy=false;
}

function showNote(text){
  const n=document.getElementById('note');if(!n)return;n.textContent=text;n.hidden=false;
  clearTimeout(showNote.t);showNote.t=setTimeout(()=>{n.hidden=true;},1800);
}

function onSwipe(el,handler){
  let x0=0,y0=0,lid=false;
  el.addEventListener('pointerdown',e=>{x0=e.clientX;y0=e.clientY;lid=true;el.setPointerCapture(e.pointerId);});
  el.addEventListener('pointerup',e=>{
    if(!lid)return;lid=false;
    const dx=e.clientX-x0,dy=e.clientY-y0;
    if(Math.hypot(dx,dy)<28)return;
    const dir=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
    const rect=el.getBoundingClientRect();
    const u=((dir==='left'||dir==='right')?(e.clientY-rect.top):(e.clientX-rect.left))/((dir==='left'||dir==='right')?rect.height:rect.width);
    const line=Math.max(0,Math.min(SIZE-1,Math.floor(u*SIZE)));
    handler(dir,line);
  });
}

onSwipe(boardHost,(dir,line)=>void playMove(dir,line));
document.getElementById('restart-board')?.addEventListener('click',()=>{
  board=createStartValues().map(row=>row.map(asTile));
  queue=[1,2,3];score=0;document.getElementById('score').textContent='0';
  syncBoard();poseBoard('neutral');
});

syncBoard();

function pumpBoard(t){
  const tick0=performance.now();
  const now=t??tick0;
  const dt=boardLast==null?0:Math.min(.05,(now-boardLast)/1000);
  boardLast=now;boardTime+=dt;
  for(const s of tiles.values()){
    if(!s.press)s.press={held:!1,releaseQueued:!1,age:0,compression:0,velocity:0,hasSwipe:!1,dragX:0,dragZ:0,swipeX:0,swipeZ:0,swipeVX:0,swipeVZ:0,inputX:0,inputZ:0,directionX:0,directionZ:0};
    updateSquishy(s,boardTime,dt,true);
  }
  updateFaces([...tiles.values()]);
  boardGfx.render(dt);
  if(window.__onBoardTick)window.__onBoardTick(performance.now()-tick0);
  requestAnimationFrame(pumpBoard);
}
requestAnimationFrame(pumpBoard);

// Isolated preview hygiene: never talk to the backend, never register a SW.
try{navigator.serviceWorker?.getRegistrations?.().then(rs=>rs.forEach(r=>{if(/preview-face/.test(r.scope))r.unregister();}));}catch{}
window.addEventListener('unhandledrejection',e=>{if(/supabase|functions\/v1/.test(String(e.reason||'')))e.preventDefault();});

window.SquishFacePreview={
  hero,heroGfx,boardGfx,get tiles(){return [...tiles.values()];},
  pose:applyHero,noface,
  get board(){return board;},
  get score(){return score;},
  get busy(){return busy;},
  get queue(){return queue;},
  setBoard(grid,nextQueue){
    for(const s of tiles.values()){boardGfx.scene.remove(s.group);s.face?.dispose?.();}
    tiles.clear();
    board=grid.map(row=>row.map(v=>v==null||v===0?null:asTile(v)));
    if(nextQueue)queue=nextQueue.slice();
    score=0;
    const el=document.getElementById('score');if(el)el.textContent='0';
    syncBoard();poseBoard('neutral');
  },
  move:playMove,
  wobble(amp=.6){for(const s of tiles.values())s.amplitude=amp;},
};
