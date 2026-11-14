import {apiFetch,hasSaveToken} from './api.mjs?v=launch-2';
import {createRng,encodeMove,replayRun,MAX_LOG} from './ranked.mjs?v=launch-2';
import {createLeaderboard} from './leaderboard.mjs?v=launch-2';
import { SIZE, START_VALUES, createStartValues, insertTile, nextMergePass, settle, isGameOver } from './game-logic.mjs?v=automatic-streets-2';
import { nextSpawn, spawnProfile } from './balance.mjs';
import {canContinueRun} from './run-availability.mjs?v=splash-plate-1';
import { createMergeEffects } from './merge-effects.mjs?v=fuse-3';
import { createGameGraphics } from './graphics-adapter.mjs?v=fuse-6';
import { installDeviceMotion } from './device-motion.mjs';
import { createGameSound } from './sound.mjs?v=launch-2';
import { installSettings } from './settings.mjs?v=woodland-menu-1';
import { createDuelClient } from './duel-client.mjs?v=launch-2';
import {installFullscreen} from './fullscreen.mjs?v=timed-duel-1';
import {createWorldMenu} from './world-menu.mjs?v=launch-2';
import {createHaptics} from './haptics.mjs?v=launch-2';
import {planMergeRipple} from './merge-ripple.mjs?v=swarm-fx-3';
const playfield = document.getElementById('playfield');
const gameElement = document.querySelector('.game');
const visual = createGameGraphics(document.getElementById('graphics'));
const graphics = visual.graphics;
const queueElement = document.getElementById('queue');
const bestElement = document.getElementById('best');
const note = document.getElementById('note');
const pauseButton = document.getElementById('pause');
const veil = document.getElementById('veil');
const dialogTitle = document.getElementById('dialog-title');
const dialogMessage = document.getElementById('dialog-message');
const resumeButton = document.getElementById('resume');
const restartButton = document.getElementById('restart');
const storageKey = 'shift3-play-v1';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const mergeEffects = createMergeEffects(document.getElementById('effects'), reduceMotion,{
  onCollect:progress=>sound.collect(progress),
  onCountEnd:()=>sound.endCollect(true),
  onCountCancel:()=>sound.endCollect(false),
  onRecord:()=>{if(!reduceMotion.matches)visual.celebrateHud('best');sound.play('record');},
  onRecordCollect:()=>{if(!reduceMotion.matches)visual.celebrateHud('best',.24);},
});
let nextId = 1;
let board;
let queue;
let score = 0;
let best = 0;
let bestTile = 4;
let moves = 0;
let peak = 4;
let revision = 0;
let booting = true;
let started = false;
let pendingSave = null;
let saving = false;
let busy = false;
let pendingMove = null;
let paused = false;
let pointerStart = null;
let noteTimer;
let generation=0;
let hasSavedGame=false;
let duelMode=false;
let duelRevision=-1;
let duelConnected=true;
let duelFinished=false;
const sound=createGameSound(document.getElementById('sound-toggle'));
installSettings();
const fullscreen=installFullscreen();
const duel=createDuelClient({
  canSync:()=>!busy,
  onPrepare:prepareDuel,
  onBegin:beginDuel,
  onView:receiveDuel,
  onConnection:(ok,message)=>{duelConnected=ok;if(message)showNote(message,0);},
  onStatus:text=>worldMenu?.status(text),
  onCode:room=>worldMenu?.code(room),
});
setInterval(updateDuelHud,200);

const phoneMotion = installDeviceMotion({
  button: document.getElementById('phone-motion'),
  status: document.getElementById('phone-motion-status'),
  onImpulse: power => visual.phoneWobble(power),
  clearImpulses: () => visual.clearPhoneWobble(),
  canReact: () => started && !booting && !busy && !paused,
  reducedMotion: reduceMotion,
});
// The start menu lives on the glass: wide cushions for buttons, standard
// squishes for the duel code. It drives the same save, settings and duel logic.
const haptics=createHaptics();
const leaderboard=createLeaderboard({
  get ranked(){return !!run;},
  get playing(){return started&&moves>0;},
  name:storedName,
  setName(name){try{localStorage.setItem(NAME_KEY,name);}catch{}},
  ranks(){try{return JSON.parse(localStorage.getItem(RANK_KEY));}catch{return null;}},
  storeRanks,
});
let moveCombo=0;
const worldMenu=createWorldMenu({visual,effects:mergeEffects,sound,reduceMotion,hooks:{
  haptics,
  canContinue:()=>canContinueRun(hasSavedGame,board),
  gesture:()=>{void fullscreen.enter();sound.unlock();phoneMotion.restoreFromGesture();void prefetchRun();},
  launch:async()=>{},
  duel,
  leaderboard:()=>leaderboard.open(),
  soundButton:document.getElementById('sound-toggle'),
  motionButton:document.getElementById('phone-motion'),
  motionStatus:document.getElementById('phone-motion-status'),
}});


const newTile = value => ({ id: nextId++, value });

// ---------- Ranked runs (leaderboard) ----------
// A ranked run starts from a server-issued seed; every accepted move is logged
// as one character. The server replays seed + log to verify the score, so the
// leaderboard only ever shows results that the real game rules produce.
const RUN_KEY='squish-next-run-v1',RANK_KEY='squish-rank-v1',NAME_KEY='squish-name-v1';
const SUBMIT_EVERY_MS=5*60*1000;
let run=null,rng=null,lastSubmit=0,prefetching=null;
const random=()=>rng||Math.random;
function takeTicket(){
  try{const t=JSON.parse(localStorage.getItem(RUN_KEY));localStorage.removeItem(RUN_KEY);
    if(t&&typeof t.id==='string'&&Number.isSafeInteger(t.seed))return t;}catch{}
  return null;
}
// Tickets are only fetched once someone actually plays (menu gesture / new game),
// so people who just open the page or the leaderboard cost no function call.
function prefetchRun(){
  if(duelMode)return Promise.resolve();
  try{if(localStorage.getItem(RUN_KEY))return Promise.resolve();}catch{return Promise.resolve();}
  return prefetching||=(async()=>{
    try{
      const r=await apiFetch('/run',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(8000)});
      if(r.ok){const t=await r.json();if(t?.id&&Number.isSafeInteger(t.seed))localStorage.setItem(RUN_KEY,JSON.stringify({id:t.id,seed:t.seed}));}
    }catch{}finally{prefetching=null;}
  })();
}
const ensureTicket=(ms=2000)=>Promise.race([prefetchRun(),new Promise(r=>setTimeout(r,ms))]);
function storedName(){try{return localStorage.getItem(NAME_KEY)||'';}catch{return '';}}
function storeRanks(ranks){try{localStorage.setItem(RANK_KEY,JSON.stringify({...ranks,at:Date.now()}));}catch{}}
async function submitScore({keepalive=false}={}){
  if(duelMode||!run||!run.log.length||score<=run.sub)return;
  const target=run,body=JSON.stringify({run:run.id,log:run.log,score,name:storedName()||undefined});
  lastSubmit=Date.now();
  try{
    const r=await apiFetch('/score',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive});
    if(r.ok){const data=await r.json();target.sub=Math.max(target.sub,data.verified?.score||0);if(data.ranks)storeRanks(data.ranks);return;}
    if(r.status===404&&run===target){run=null;return;}
    if(r.status===422){
      const msg=(await r.json().catch(()=>({}))).error||'';
      // "zu schnell" heals itself later; anything else means this run cannot be verified.
      if(!/schnell/.test(msg)&&run===target){console.warn('[ranked] run rejected:',msg);run=null;}
    }
  }catch{}
}
const wait = ms => reduceMotion.matches ? Promise.resolve() : visual.wait(ms / 1000);
const format = value => value.toLocaleString('de-DE');

function freshState() {
  generation++;pendingMove=null;
  moveCombo=0;mergeEffects.streak?.(0,{silent:true});
  nextId = 1;
  const ticket=takeTicket();
  run=ticket?{id:ticket.id,seed:ticket.seed,log:'',sub:0}:null;
  rng=ticket?createRng(ticket.seed):null;
  lastSubmit=Date.now();
  const values=createStartValues(random());
  board = values.map(row => row.map(value => value === null ? null : newTile(value)));
  queue = Array.from({length:3},()=>nextSpawn({board,moves:0,highest:4,random:random()}));
  if(!booting)setTimeout(()=>void prefetchRun(),0);
  score = 0;
  moves = 0;
  peak = Math.max(...values.flat().filter(value => value !== null));
  bestTile = Math.max(bestTile, peak);
}

function loadState(saved) {
  moveCombo=0;mergeEffects.streak?.(0,{silent:true});
  try {
    if (saved === undefined) saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved || !Array.isArray(saved.board) || saved.board.length !== SIZE ||
        !saved.board.every(row => Array.isArray(row) && row.length === SIZE &&
          row.every(tile => tile === null || (Number.isInteger(tile.id) && tile.id > 0 && Number.isInteger(tile.value) && tile.value > 0))) ||
        !Array.isArray(saved.queue) || saved.queue.length !== 3 ||
        !saved.queue.every(value => Number.isSafeInteger(value) && value >= 1) ||
        !Number.isSafeInteger(saved.score) || saved.score < 0) throw new Error('Invalid save');
    const ids = saved.board.flat().filter(Boolean).map(tile => tile.id);
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate tile');
    board = saved.board;
    queue = saved.queue;
    score = saved.score;
    best = Math.max(score, Number.isSafeInteger(saved.best) ? saved.best : 0);
    nextId = Math.max(0, ...ids) + 1;
    moves = Number.isSafeInteger(saved.moves) && saved.moves >= 0
      ? saved.moves : Math.max(0, nextId - 1 - START_VALUES.flat().filter(value => value !== null).length);
    peak = Math.max(...saved.board.flat().filter(Boolean).map(tile => tile.value),
      Number.isSafeInteger(saved.peak) && saved.peak > 0 ? saved.peak : 1);
    // Older saves only tracked the current run's peak; their point record
    // cannot reveal a tile reached in a previous, completed run.
    bestTile = Math.max(bestTile, peak,
      Number.isSafeInteger(saved.bestTile) && saved.bestTile > 0 ? saved.bestTile : 0);
    revision = Number.isSafeInteger(saved.revision) && saved.revision > 0 ? saved.revision : 0;
    resumeRun(saved.run);
    return true;
  } catch {
    freshState();
    return false;
  }
}

// Re-derive the RNG by replaying the logged moves; only resume the ranked run if
// the replay lands on exactly the saved board (otherwise keep playing unranked).
function resumeRun(saved) {
  run=null;rng=null;
  if(!saved||typeof saved.id!=='string'||typeof saved.log!=='string')return;
  const rep=replayRun(saved.seed,saved.log);
  if(!rep.ok)return;
  const vals=b=>b.map(row=>row.map(t=>t?t.value:0).join(',')).join(';');
  if(vals(rep.state.board)!==vals(board)||rep.state.queue.join()!==queue.join()||rep.state.score!==score||rep.state.moves!==moves)return;
  run={id:saved.id,seed:saved.seed,log:saved.log,sub:Number.isSafeInteger(saved.sub)?saved.sub:0};
  rng=rep.run.random;
  lastSubmit=Date.now();
}
const runSnapshot=()=>run?{id:run.id,seed:run.seed,log:run.log,sub:run.sub}:undefined;

function snapshot() {
  // A tab can close in the middle of a merge animation. Finish that turn in
  // the saved copy without changing the board currently being animated.
  if (queue.length === 2) {
    const resolved = settle(board);
    const futurePeak = Math.max(peak, ...resolved.board.flat().filter(Boolean).map(tile => tile.value));
    const futureMoves = moves + 1;
    const futureScore = score + resolved.points;
    // Draw the preview from a clone so the live RNG stays in step with the replay.
    return { board: resolved.board, queue: [...queue, nextSpawn({
      board: resolved.board, moves: futureMoves, highest: futurePeak, random: rng ? rng.clone() : Math.random,
    })], score: futureScore, best: Math.max(best, futureScore),
      bestTile: Math.max(bestTile, futurePeak), moves: futureMoves,
      peak: futurePeak, revision: ++revision, run: runSnapshot() };
  }
  return { board, queue, score, best, bestTile: Math.max(bestTile, peak),
    moves, peak, revision: ++revision, run: runSnapshot() };
}

// Server saves are batched: every move still lands in localStorage right away,
// but the cloud copy is sent at most once per SAVE_DEBOUNCE_MS (60 s), plus immediately
// when the tab is hidden or closed (fetch keepalive). Cuts Edge Function calls ~10x.
const SAVE_DEBOUNCE_MS = 60000;
let saveTimer = 0;
let cloudDirty = false;

function scheduleFlush(delay = SAVE_DEBOUNCE_MS) {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = 0; void flushPending(); }, delay);
}

async function flushPending({ keepalive = false } = {}) {
  if(duelMode)return;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
  if (!pendingSave) return;
  if (keepalive) {
    // Page is going away: fire and forget, do not wait for a running request.
    const current = pendingSave;
    pendingSave = null; cloudDirty = false;
    apiFetch('/save', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current), keepalive: true }).catch(() => {});
    return;
  }
  if (saving) return;
  saving = true;
  try {
    while (pendingSave) {
      const current = pendingSave;
      const result = await apiFetch('/save', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(current), credentials: 'same-origin',
      });
      if (result.status === 429) { scheduleFlush(60000); return; } // rate limited: retry quietly later
      if (!result.ok) throw new Error('Save unavailable');
      if (pendingSave === current) { pendingSave = null; cloudDirty = false; }
    }
  } catch {
    // The local copy stays available; reconnecting retries the newest state.
    showNote('Offline gespeichert – wird später synchronisiert', 3500);
  } finally {
    saving = false;
  }
}

function saveState({ now = false } = {}) {
  if(duelMode)return;
  const state = snapshot();
  try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* browser storage can be blocked */ }
  pendingSave = state; cloudDirty = true;
  if (now) void flushPending(); else scheduleFlush();
}

async function start() {
  const hadLocal = loadState();
  hasSavedGame = hadLocal;
  renderBest();
  await visual.ready;
  try {
    // The cloud copy is keyed by this browser's token, so it can only hold something
    // the local copy lacks when there is a token but no local save. Everyone else
    // (new visitors, returning players) boots without any function call.
    sync: {
    if (hadLocal || !hasSaveToken()) break sync;
    const response = await apiFetch('/save', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error('Save unavailable');
    const remote = await response.json();
    if (remote) bestTile = Math.max(bestTile,
      Number.isSafeInteger(remote.bestTile) ? remote.bestTile : 0,
      Number.isSafeInteger(remote.peak) ? remote.peak : 0);
    if (remote && (!hadLocal || (remote.revision ?? 0) >= revision)) {
      visual.clear();
      if (!loadState(remote)) throw new Error('Invalid saved game');
      hasSavedGame = true;
      try { localStorage.setItem(storageKey, JSON.stringify({ ...remote, bestTile })); } catch {}
      renderBest();
      if (!Number.isSafeInteger(remote.bestTile) || bestTile > remote.bestTile) saveState();
    } else {
      renderBest();
    }
    }
  } catch {
    if (hadLocal) {
      pendingSave = snapshot();
      try { localStorage.setItem(storageKey, JSON.stringify(pendingSave)); } catch {}
    }
    showNote('Offline: Spielstand auf diesem Gerät gesichert', 3500);
  } finally {
    booting = false;
    note.hidden = true;
  }
  await prepareEntryScene();
}

async function prepareEntryScene() {
  renderBoard();renderQueue();
  await visual.prepareEntry();
}

async function enterGame() {
  if (booting || started || busy) return;
  started = true;
  busy = true;
  paused = false;veil.hidden = true;gameElement.classList.remove('is-paused');
  graphics.pause(false);
  sound.resume();
  sound.unlock();
  const turn = generation;
  note.hidden = true;
  gameElement.classList.remove('is-start');
  gameElement.classList.add('is-entering');
  visual.onLand=info=>sound.play('land',info.queue?1:2,{pan:info.pan||0});
  try {
  renderBoard();
  renderQueue();
  await visual.dropIn(reduceMotion.matches,{onLand:info=>sound.play('land',info.queue?1:2,{pan:info.pan||0})});
  if (turn !== generation) return;
  const entryScore=score;
  await resolveMerges(turn);
  if (turn !== generation) return;
  if(score!==entryScore){peak=Math.max(peak,...board.flat().filter(Boolean).map(tile=>tile.value));saveState();}
  } finally {
  if (turn === generation) {
  busy = false;
  gameElement.classList.remove('is-entering');
  if (isGameOver(board)) showDialog(true);
  }
  }
}

function location(row,col) { return visual.location(row,col); }
function graphicsTiles(incoming) {
  return board.flatMap((line,row)=>line.flatMap((tile,col)=> {
    if(!tile)return [];
    const data={...tile,row,col};
    if(incoming?.id===tile.id) {
      const pitch=graphics.parameters.board.pitch;
      data.fromPosition=[(col-2)*pitch,.08,(row-2)*pitch];
      if(incoming.direction==='right')data.fromPosition[0]=-3*pitch;
      if(incoming.direction==='left')data.fromPosition[0]=3*pitch;
      if(incoming.direction==='down')data.fromPosition[2]=-3*pitch;
      if(incoming.direction==='up')data.fromPosition[2]=3*pitch;
    }
    return [data];
  }));
}
function renderBoard(incoming) {
  visual.sync(graphicsTiles(incoming),{animate:!!incoming&&!reduceMotion.matches,duration:.12,incoming});
}
function renderQueue() {
  if(queueElement.children.length!==3) {
    queueElement.replaceChildren(...Array.from({length:3},()=> {
      const slot=document.createElement('div');slot.className='preview-tile';return slot;
    }));
  }
  for(let index=0;index<3;index++)visual.hideHud('queue-'+index,index>=queue.length);
  queue.forEach((value,index)=> {
    const slot=queueElement.children[index];visual.setHud('queue-'+index,value,slot);
    slot.setAttribute('aria-label',`${index===0?'Nächster':'Danach'} Stein: ${value}`);
  });
}
function renderBest() {
  mergeEffects.syncScore(score);
  let slot=bestElement.firstElementChild;
  if(!slot){slot=document.createElement('div');slot.className='best-tile';bestElement.append(slot);}
  visual.setHud('best',bestTile,slot);
  bestElement.setAttribute('aria-label',`Höchster Squishy: ${format(bestTile)}`);
}

function showNote(message, duration = 2200) {
  clearTimeout(noteTimer);
  note.textContent = message;
  note.hidden = false;
  if(duration>0)noteTimer = setTimeout(() => { note.hidden = true; }, duration);
}

function showDialog(over) {
  if(duelMode&&over)return;
  paused = true;
  sound.pause();
  phoneMotion.reset();
  gameElement.classList.add('is-paused');
  releaseGesture();
  graphics.pause(!duelMode);
  veil.hidden = false;
  pauseButton.textContent = '▶';
  pauseButton.setAttribute('aria-pressed', 'true');
  pauseButton.setAttribute('aria-label', 'Spiel fortsetzen');
  dialogTitle.textContent = over ? 'Kein Platz mehr' : 'Pause';
  dialogMessage.textContent = over ? `Höchster Stein in diesem Spiel: ${format(peak)}.` : 'Dein Spielfeld wartet auf dich.';
  if(duelMode){dialogTitle.textContent='Duell läuft weiter';dialogMessage.textContent='Die fünf Minuten laufen auch bei geöffnetem Menü weiter.';restartButton.textContent='Duell verlassen';}
  resumeButton.hidden = over;
  (over ? restartButton : resumeButton).focus();
}

function resume() {
  if(duelFinished)return;
  paused = false;
  sound.resume();sound.unlock();
  phoneMotion.reset();
  gameElement.classList.remove('is-paused');
  veil.hidden = true;
  pauseButton.textContent = 'Ⅱ';
  pauseButton.setAttribute('aria-pressed', 'false');
  pauseButton.setAttribute('aria-label', 'Spiel pausieren');
  graphics.pause(false);
  pauseButton.focus();
}

async function restart() {
  if(duelMode){void duel.exit();return;}
  void submitScore();
  releaseGesture();pendingMove=null;
  mergeEffects.clear();
  visual.clear();
  freshState();
  busy = false;
  renderBoard();
  renderQueue();
  renderBest();
  saveState();
  resume();
}

function wobbleMergeNeighbors(groups,combo=1) {
  if(reduceMotion.matches)return;
  for(const pulse of planMergeRipple(board,groups,{combo,moves}))visual.scheduleWobble(pulse.id,pulse.power,pulse.delay);
}

async function applyMerge(pass,turn,combo) {
  const sources=pass.groups.map(group=>group.cells.map(([r,c])=>({...location(r,c),value:board[r][c].value})));
  const upgraded=pass.groups.filter(g=>!g.street&&g.cells.length>=5);
  // The group's real cushions melt into one gel body, swell and pop; the
  // logic below runs at the pop, while the new stone drops in.
  await visual.mergeIn(pass.groups.map(group=>({
    ids:group.cells.map(([r,c])=>board[r][c].id),
    resultId:board[group.target[0]][group.target[1]].id,
    cells:group.cells.map(([r,c])=>({id:board[r][c].id,row:r,col:c,value:board[r][c].value})),
    target:group.target,value:board[group.target[0]][group.target[1]].value,nextValue:group.nextValue,street:!!group.street,
  })),reduceMotion.matches,{tempo:pendingMove?3:combo>1?1.25:1});
  if(turn!==generation)return;
  // Highest stone this run before this pass (peak updates after the move).
  const previousPeak=Math.max(peak,...board.flat().filter(Boolean).map(t=>t.value));
  const previousScore=score,previousRecord=bestTile;
  board=pass.board;score+=pass.points;best=Math.max(best,score);
  const lead=pass.groups.reduce((a,b)=>b.cells.length>a.cells.length?b:a);
  sound.play(lead.street?'flow':'merge',lead.cells.length,{combo,pan:(lead.target[1]-2)*.13});
  bestTile=Math.max(bestTile,...board.flat().filter(Boolean).map(t=>t.value));
  const rewards=pass.groups.map((group,index)=>({...group,position:location(...group.target),sources:sources[index],combo}));
  mergeEffects.award(rewards,previousScore,score);
  renderBoard();renderBest();mergeEffects.combo(combo);
  if(bestTile>previousRecord){const record=rewards.find(group=>group.nextValue===bestTile);if(record)mergeEffects.record(record.position,bestTile,record);}
  haptics.pulse(upgraded.length||lead.cells.length>=4||bestTile>previousRecord||moveCombo>=4||combo>=3?'big':'merge');
  for(const group of pass.groups) {
    const [r,c]=group.target;
    if(!reduceMotion.matches)graphics.release(board[r][c].id);
    graphics.wobble(board[r][c].id,group.cells.length>=5?.72:group.cells.length===4?.62:.50);
    const value=group.nextValue,recordStone=bestTile>previousRecord&&value===bestTile;
    mergeEffects.merge({...group,position:location(r,c)},combo,{record:recordStone,peak:!recordStone&&value>previousPeak});
    if(!group.street&&group.cells.length>=5)mergeEffects.upgrade(location(r,c),group.value,group.nextValue);
  }
  graphics.scene.userData.mergeAnimation={phase:'pop',elapsed:0};
  // Start the ripple with the pop; only the short distance-based stagger
  // separates the surrounding bodies, without an extra pause beforehand.
  wobbleMergeNeighbors(pass.groups,combo);
  // Wait only if another pass will follow, so the next swipe is accepted
  // as soon as this pop has updated the board.
  const more=nextMergePass(board);
  if(more.groups.length)await wait(upgraded.length?110:80);
  if(turn!==generation)return;
}

// A combo counts consecutive moves that merge at least once; a move
// without a merge ends it. Chain merges inside one move stay "Kette".
function updateCombo(merged) {
  if(merged){moveCombo++;mergeEffects.streak(moveCombo);}
  else if(moveCombo){moveCombo=0;mergeEffects.streak(0);}
}

async function resolveMerges(turn,{streak=false}={}) {
  let chains=0,totalMerges=0,hadUpgrade=false,hadStreet=false;
  for(let count=0;count<SIZE*SIZE;count++) {
    const pass=nextMergePass(board);if(!pass.groups.length)break;
    chains++;totalMerges+=pass.groups.length;
    if(streak&&chains===1)updateCombo(true);
    if(pass.groups.some(g=>!g.street&&g.cells.length>=5))hadUpgrade=true;
    if(pass.groups.some(g=>g.street))hadStreet=true;
    await applyMerge(pass,turn,totalMerges);
    if(turn!==generation)return;
  }
  if(streak&&!chains)updateCombo(false);
  if(chains)showNote(hadUpgrade?'Super-Merge! +2 Stufen':totalMerges>1?`${totalMerges}er-Kombo!`:hadStreet?'Straßen-Merge!':'Merge!',1500);
}

function boardKey(stateBoard) {
  return (stateBoard||[]).map(row=>(row||[]).map(tile=>tile?tile.id+':'+tile.value:'').join(',')).join(';');
}
function applyDuelState(state) {
  board=state.board.map(row=>row.map(tile=>tile?{...tile}:null));
  queue=state.queue.slice();score=state.score;moves=state.moves;peak=state.peak;nextId=state.nextId;
  best=Math.max(best,score);bestTile=Math.max(bestTile,peak);duelRevision=state.revision;
}
function reconcileDuelState(state) {
  if(!state)return;
  const same=boardKey(board)===boardKey(state.board);
  const queueSame=queue.length===state.queue.length&&queue.every((v,i)=>v===state.queue[i]);
  applyDuelState(state);
  if(!same)renderBoard();
  if(!queueSame)renderQueue();
  renderBest();
}
async function prepareDuel(state) {
  if(worldMenu.active||worldMenu.stats.items)await worldMenu.dismiss();
  duelMode=true;pendingSave=null;generation++;busy=true;moveCombo=0;run=null;rng=null;mergeEffects.streak?.(0,{silent:true});
  releaseGesture();phoneMotion.reset();mergeEffects.clear();visual.clear();
  try{applyDuelState(state);renderBest();await prepareEntryScene();}finally{busy=false;}
}
async function beginDuel(data) {
  if(!duelMode)await prepareDuel(data.game);
  const splash=document.getElementById('loading-screen');splash.hidden=true;splash.dataset.phase='complete';
  gameElement.inert=false;gameElement.removeAttribute('aria-hidden');
  document.getElementById('duel-hud').hidden=false;updateDuelHud();
  await enterGame();
  if(data.status==='finished')finishDuel(data);
}
let lastHudKey='';
function updateDuelHud() {
  if(!duelMode||!duel.view)return;
  const data=duel.view;
  const countdown=Math.max(0,Math.ceil((data.startsAt-duel.serverNow)/1000));
  const seconds=Math.min(300,Math.max(0,Math.ceil((data.endsAt-duel.serverNow)/1000)));
  const mine=data.game?.score??0,theirs=data.opponent?.score??0,total=mine+theirs,ratio=total===0?.5:mine/total;
  const status=duelFinished?'Duell beendet':!duelConnected?'Verbindung …':countdown?`Start in ${countdown} …`:seconds===0?'Auswertung …':data.game.blocked?'Brett voll':data.opponent?.online?'● Verbunden':'Gegner offline';
  const timerText=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  const key=`${timerText}|${status}|${mine}|${theirs}|${seconds<=30}|${ratio.toFixed(4)}`;
  if(key===lastHudKey)return;
  lastHudKey=key;
  const timer=document.getElementById('duel-timer');
  if(timer.textContent!==timerText)timer.textContent=timerText;
  timer.classList.toggle('is-urgent',seconds<=30&&!countdown&&!duelFinished);
  const statusEl=document.getElementById('duel-hud-status');
  if(statusEl.textContent!==status)statusEl.textContent=status;
  const myEl=document.getElementById('duel-my-score'),oppEl=document.getElementById('duel-opponent-score');
  const myText=format(mine),oppText=format(theirs);
  if(myEl.textContent!==myText)myEl.textContent=myText;
  if(oppEl.textContent!==oppText)oppEl.textContent=oppText;
  const track=document.getElementById('duel-tug');
  if(track){
    track.style.setProperty('--tug',String(ratio));
    track.setAttribute('aria-valuenow',String(Math.round(ratio*100)));
    track.setAttribute('aria-valuetext',total===0||mine===theirs?'Gleichauf':`Du ${myText}, Gegner ${oppText}`);
    track.classList.toggle('is-lead',mine>theirs);
    track.classList.toggle('is-trail',mine<theirs);
    track.classList.toggle('is-tied',mine===theirs);
  }
}
function finishDuel(data) {
  if(duelFinished)return;
  duelFinished=true;paused=true;sound.pause();releaseGesture();phoneMotion.reset();
  mergeEffects.syncScore(data.game.score,true);mergeEffects.finish();
  gameElement.classList.add('is-paused');graphics.pause(false);veil.hidden=false;
  const won=data.winner===data.you,tie=data.winner===null;
  dialogTitle.textContent=tie?'Unentschieden!':won?'Du gewinnst!':'Duell verloren';
  dialogMessage.textContent=(data.reason==='left'?'Ein Spieler hat das Duell verlassen.':data.reason==='time'?'Die fünf Minuten sind um.': 'Das Duell ist beendet.')+` Du: ${format(data.game.score)} · Gegner: ${format(data.opponent?.score??0)} Punkte.`;
  resumeButton.hidden=true;restartButton.textContent='Zum Menü';restartButton.focus();updateDuelHud();
}
async function receiveDuel(data) {
  if(!duelMode||!data)return;
  updateDuelHud();
  if(data.status==='finished')finishDuel(data);
  if(busy||!data.game)return;
  if(Number(data.game.revision)<=duelRevision)return;
  if(boardKey(board)===boardKey(data.game.board)&&queue.length===data.game.queue.length&&queue.every((v,i)=>v===data.game.queue[i])&&score===data.game.score){
    duelRevision=data.game.revision;nextId=data.game.nextId;moves=data.game.moves;peak=data.game.peak;return;
  }
  busy=true;releaseGesture();
  try{reconcileDuelState(data.game);}finally{busy=false;}
}
async function moveDuel(direction,line) {
  if(!duel.canMove){showNote(duel.view&&duel.serverNow>=duel.view.endsAt?'Zeit abgelaufen – Ergebnis wird abgeglichen …':duelConnected?'Einen Moment …':'Verbindung wird wiederhergestellt …',1200);return;}
  const tile={id:nextId,value:queue[0]};
  const inserted=insertTile(board,direction,line,tile);
  if(!inserted.accepted){
    showNote(isGameOver(board)?'Brett voll – dein Punktestand bleibt bestehen.':'Diese Reihe ist voll');
    haptics.pulse('tap');
    return;
  }
  // Animate immediately, like single player. The server call runs in parallel.
  const net=duel.move(direction,line);
  busy=true;phoneMotion.reset();releaseGesture();haptics.pulse('move');
  const turn=generation;
  let data;
  try {
    nextId++;board=inserted.board;queue=queue.slice(1);sound.play('slide');note.hidden=true;
    renderBoard({id:tile.id,direction});
    if(!reduceMotion.matches)await new Promise(resolve=>{
      function done(){if(graphics.tiles.some(t=>t.motion))requestAnimationFrame(done);else resolve();}
      requestAnimationFrame(done);
    });
    if(turn!==generation)return;
    await resolveMerges(turn,{streak:true});
    if(turn!==generation)return;
    data=await net;
    if(!data){showNote('Verbindung unterbrochen – Zug wird abgeglichen',3000);return;}
    if(!data.result?.accepted){
      if(data.result?.reason==='full')showNote(data.game.blocked?'Brett voll – dein Punktestand bleibt bestehen.':'Diese Reihe ist voll');
      else if(data.result?.reason==='changed')showNote('Brett aktualisiert');
      if(data.game)reconcileDuelState(data.game);
      return;
    }
    reconcileDuelState(data.game);
  } finally {
    if(turn===generation)busy=false;
    if(data)await receiveDuel(data);
  }
}

async function move(direction, line) {
  if(busy&&started&&!booting&&!paused&&visual.fusion?.active){
    // A swipe during a merge speeds the gel up and plays right after it.
    pendingMove={direction,line};visual.hurryMerges();return;
  }
  if (!started || booting || busy || paused) return;
  if(duelMode) {
    await moveDuel(direction,line);
    const queued=pendingMove;pendingMove=null;
    if(queued)void move(queued.direction,queued.line).catch(()=>{});
    return;
  }
  const tile = { id: nextId, value: queue[0] };
  const inserted = insertTile(board, direction, line, tile);
  if (!inserted.accepted) {
    showNote('Diese Reihe ist voll');
    haptics.pulse('tap');
    return;
  }
  const turn=generation;
  if(run){run.log+=encodeMove(direction,line);if(run.log.length>=MAX_LOG){void submitScore();run=null;}}
  let previousProfile=spawnProfile(moves, peak);
  busy = true;
  try {
  sound.play('slide');haptics.pulse('move');
  phoneMotion.reset();
  nextId++;
  board = inserted.board;
  queue = queue.slice(1);
  note.hidden = true;
  renderBoard({id:tile.id,direction});
  // Don't resolve a merge before all shifted original models reach their cells.
  if(!reduceMotion.matches)await new Promise(resolve=> {
    function done(){if(graphics.tiles.some(t=>t.motion))requestAnimationFrame(done);else resolve();}
    requestAnimationFrame(done);
  });
  if(turn!==generation)return;
  await resolveMerges(turn,{streak:true});
  if(turn!==generation)return;
  moves++;
  peak = Math.max(peak, ...board.flat().filter(Boolean).map(tile => tile.value));
  bestTile = Math.max(bestTile, peak);
  renderBest();
  queue.push(nextSpawn({ board, moves, highest: peak, random: random() }));
  renderQueue();
  saveState();
  } finally {
    if(turn===generation)busy=false;
  }
  if(turn!==generation)return;
  const queued=pendingMove;pendingMove=null;
  const currentProfile = spawnProfile(moves, peak);
  if (currentProfile.floor > previousProfile.floor || currentProfile.ceiling > previousProfile.ceiling) {
    showNote('Neue Steinwerte freigeschaltet', 2200);
  }
  if (isGameOver(board)) {void submitScore();showDialog(true);return;}
  if (run && score > run.sub && Date.now() - lastSubmit > SUBMIT_EVERY_MS) void submitScore();
  if(queued)void move(queued.direction,queued.line).catch(()=>{});
}

function releaseGesture() {
  if(pointerStart?.tileId!=null)graphics.release(pointerStart.tileId);
  pointerStart=null;
}
playfield.addEventListener('pointerdown',event=> {
  const merging=busy&&!duelMode&&visual.fusion?.active;
  if(!started||booting||(busy&&!merging)||paused||!event.isPrimary)return;
  sound.unlock();
  const cell=visual.gestureCell(event),tileId=merging?null:visual.pick(event);
  pointerStart={id:event.pointerId,x:event.clientX,y:event.clientY,cell,tileId,
    local:tileId==null?null:visual.localPoint(event,tileId)};
  if(tileId!=null)graphics.press(tileId);
  playfield.setPointerCapture(event.pointerId);
});
playfield.addEventListener('pointermove',event=> {
  if(!pointerStart||event.pointerId!==pointerStart.id||pointerStart.tileId==null)return;
  const p=visual.localPoint(event,pointerStart.tileId),start=pointerStart.local;
  if(p&&start)graphics.drag(pointerStart.tileId,p.x-start.x,p.z-start.z);
});
playfield.addEventListener('pointerup',event=> {
  if(!pointerStart||event.pointerId!==pointerStart.id)return;
  const {x,y,cell}=pointerStart;releaseGesture();
  const dx=event.clientX-x,dy=event.clientY-y;
  if(Math.max(Math.abs(dx),Math.abs(dy))<Math.max(24,playfield.clientWidth*.065))return;
  if(Math.abs(dx)>Math.abs(dy)*1.15)void move(dx>0?'right':'left',cell.row).catch(()=>{});
  else if(Math.abs(dy)>Math.abs(dx)*1.15)void move(dy>0?'down':'up',cell.col).catch(()=>{});
});
playfield.addEventListener('pointercancel',releaseGesture);
playfield.addEventListener('lostpointercapture',releaseGesture);
window.addEventListener('blur',releaseGesture);

pauseButton.addEventListener('click', () => {
  if (!started || booting || busy || duelFinished) return;
  if (paused) resume(); else showDialog(false);
});
resumeButton.addEventListener('click', resume);
restartButton.addEventListener('click', restart);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && !booting && !duelMode) { saveState(); void flushPending({ keepalive: true }); void submitScore({ keepalive: true }); }
  else if (!document.hidden && pendingSave) scheduleFlush(2000);
});
window.addEventListener('pagehide', event => {
  if (!event.persisted) {phoneMotion.dispose();sound.dispose();}
  if (booting || duelMode) return;
  // visibilitychange usually fired just before and already sent everything;
  // only send again if something changed since (or a move is mid-animation).
  if (!cloudDirty && !pendingSave && !busy) return;
  saveState();
  void flushPending({ keepalive: true });
});
window.addEventListener('online', () => void flushPending());
// Read-only inspection for integration checks; game state still belongs here.
window.SquishGame={graphics,move,restart,get state(){return {board,queue,score,best,bestTile,moves,peak,busy,paused,booting,started,hasSavedGame,duelMode,duelRevision,ranked:run?{id:run.id,logLength:run.log.length,submitted:run.sub}:null};},get effects(){return mergeEffects.stats;},get sound(){return sound.stats;},get menu(){return worldMenu.stats;},get fusion(){return visual.fusion?.stats||null;}};
// QA only (?vfxdemo=1): stage a board, then swipe with SquishGame.move().
if(new URLSearchParams(globalThis.location.search).has('vfxdemo'))window.SquishVFX={
  setBoard(grid,next=[1,2,3]){
    if(busy)return false;
    board=grid.map(row=>row.map(value=>value?{id:nextId++,value}:null));queue=next.slice(0,3);run=null;rng=null;
    renderBoard();renderQueue();renderBest();return true;
  },
  slow(v=1){mergeEffects.vfx.timeScale=v;},
  get fusion(){return visual.fusion.stats;},
  get fusionDebug(){return visual.fusion.debug;},
  bench(...a){return visual.fusion.bench(...a);},
  resetStats(){visual.fusion.resetStats();},
  get stats(){return mergeEffects.stats;},
};
export const menuActions={
  get canContinue() {return canContinueRun(hasSavedGame,board);},
  prepare() {void fullscreen.enter();sound.unlock();phoneMotion.restoreFromGesture();},
  multiplayer(){return duel.open();},
  world:worldMenu,
  start(){return enterGame();},
  async select(newGame=false) {
    if (booting || started || busy) return;
    if (newGame) {
      void submitScore();
      await ensureTicket();
      mergeEffects.clear();visual.clear();freshState();renderBest();saveState();
      await prepareEntryScene();
    }
  },
};
export const ready=start();
void ready.catch(()=> {booting=true;showNote('Die 3D-Grafik konnte nicht geladen werden. Bitte lade die Seite neu.',60000);});
