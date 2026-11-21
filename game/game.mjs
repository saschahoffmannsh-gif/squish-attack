import {apiFetch,hasSaveToken} from './api.mjs?v=launch-38';
import { SIZE, START_VALUES, createStartValues, insertTile, settlePass, settle, isGameOver } from './game-logic.mjs?v=launch-38';
import { nextSpawn, spawnProfile } from './balance.mjs';
import {canContinueRun} from './run-availability.mjs?v=launch-38';
import { createMergeEffects } from './merge-effects.mjs?v=launch-38';
import { createGameGraphics } from './graphics-adapter.mjs?v=launch-38';
import { installDeviceMotion } from './device-motion.mjs?v=launch-38';
import { createGameSound } from './sound.mjs?v=launch-38';
import { installSettings } from './settings.mjs?v=woodland-menu-1';
import { createDuelClient } from './duel-client.mjs?v=launch-38';
import {installFullscreen} from './fullscreen.mjs?v=timed-duel-1';
import {createHomeMenu} from './home-menu.mjs?v=launch-38';
import {createConfetti} from './confetti.mjs?v=launch-38';
import {createHaptics} from './haptics.mjs?v=launch-38';
import {planMergeRipple} from './merge-ripple.mjs?v=swarm-fx-3';
import * as Camp from './campaign.mjs?v=launch-38';
import {createCampaignUI} from './campaign-ui.mjs?v=launch-38';
import {createToolFx} from './tool-fx.mjs?v=launch-38';
import {createGhostFinger} from './ghost-finger.mjs?v=launch-38';
import * as Shop from './shop.mjs?v=launch-38';
import {createShopUI} from './shop-ui.mjs?v=launch-38';
import {createGiftFx} from './gift-fx.mjs?v=launch-38';
import {GIFT_SVG,SHOP_SVG} from './tool-icons.mjs?v=launch-38';
import {createAdUI} from './ad-ui.mjs?v=launch-38';
import {isOffline} from './native-ads.mjs?v=launch-38';
import {createStatsUI} from './stats-ui.mjs?v=launch-38';
import * as ToolLog from './tool-log.mjs?v=launch-38';
import {createProgressSync} from './progress-sync.mjs?v=launch-38';
import {epochOf} from './progress-merge.mjs?v=launch-38';
import {createAdPacing} from './ad-pacing.mjs?v=launch-38';
import {isAdFree,canOfferAdFree,purchaseAdFree,adFreePriceLabel} from './ad-free.mjs?v=launch-38';
import {t, fmtNum, hasKey, onLangChange} from './i18n.mjs?v=launch-38';
import {createExplainer} from './explain.mjs?v=launch-38';
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
const toMenuButton = document.getElementById('to-menu');
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
  onClose:()=>document.querySelector('#home-screen button')?.focus({preventScroll:true}),
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
let moveCombo=0;
const confetti=createConfetti();
let celebrating=false;
// Menüs sind reine 2D-Bildschirme; die 3D-Szene pausiert, solange sie offen sind.
const worldMenu=createHomeMenu({sound,reduceMotion,hooks:{
  pauseScene:on=>{if(on){if(!started)graphics.pause(true);}else graphics.pause(false);},
  endlessStats:()=>({best,bestTile:campaignMode&&stashedBestTile!=null?stashedBestTile:bestTile}),
  haptics,
  canContinue:()=>canContinueRun(hasSavedGame,board),
  gesture:()=>{void fullscreen.enter();sound.unlock();phoneMotion.restoreFromGesture();},
  launch:async()=>{},
  duel,
  setMode:mode=>{try{localStorage.setItem(MODE_KEY,mode);}catch{}},
  icons:{gift:GIFT_SVG,shop:SHOP_SVG},
  explain:{topics:()=>explainer.topics(),show:topic=>explainer.show(topic,topic==='gates'?gatesCtx():null)},   // launch-28: Regeln-Bildschirm
  consumeUnlockCelebration:()=>{
    if(!Camp.modesUnlocked(campaignProgress))return false;
    try{if(localStorage.getItem(Camp.MODES_UNLOCK_SEEN_KEY)==='1')return false;localStorage.setItem(Camp.MODES_UNLOCK_SEEN_KEY,'1');}
    catch{return true;}
    return true;
  },
  campaign:{
    summary:()=>campaignSummary(),
    openShop:()=>openShop(null),
    openGift:()=>void openGift(),
    openLab:()=>{void loadLab().then(()=>worldMenu.play({campaign:1,lab:true})).catch(()=>showNote(t('boot.labFail'),3000));},
    openSelect:()=>{if(levels)campaignUI.openSelect({levels,progress:campaignProgress});else void loadLevels().then(()=>campaignUI.openSelect({levels,progress:campaignProgress})).catch(()=>showNote(t('boot.levelsFail'),3000));},
  },
  soundButton:document.getElementById('sound-toggle'),
  motionButton:document.getElementById('phone-motion'),
  motionStatus:document.getElementById('phone-motion-status'),
}});


const newTile = value => ({ id: nextId++, value });

// ---------- Kampagne ----------
// Feste Rätsel-Level (levels/levels-001-100.json). Der Endlos-Spielstand bleibt
// in localStorage unangetastet: während der Kampagne wird nichts davon gespeichert,
// beim Verlassen wird er wieder geladen.
const MODE_KEY='squish-mode-v1';
const LEVELS_URL=new URL('../levels/levels-001-100.json?v=launch-38',import.meta.url);
// launch-16: Test-Level für die neuen Squishes (Eis, Ketten, Bombe) – eigener kleiner Satz, kein Fortschritt/Protokoll.
const LAB_URL=new URL('../levels/levels-lab.json?v=launch-38',import.meta.url);
let labMode=false,labLevels=null,labLoading=null;
function loadLab(){
  return labLoading||=fetch(LAB_URL,{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('lab '+r.status);return r.json();})
    .then(data=>{data.levels.forEach(Camp.validateLevel);labLevels=data.levels;return labLevels;})
    .catch(error=>{labLoading=null;throw error;});
}
const levelList=()=>labMode?labLevels:levels;
const labHudLabel=()=>{const title=hasKey('lab.title.'+camp.n)?t('lab.title.'+camp.n):(camp.level.title||'');return t('campaign.hudLab',{n:camp.n,title:title.toUpperCase()});};
function levelNote(){
  if(!camp)return '';
  const goals=camp.level.goals.map(Camp.goalText).join(' + ');
  if(labMode){
    const title=hasKey('lab.title.'+camp.n)?t('lab.title.'+camp.n):(camp.level.title||'');
    const note=hasKey('lab.note.'+camp.n)?t('lab.note.'+camp.n):(camp.level.meta?.note??'');
    return t('campaign.note.lab',{n:camp.n,title,note,goals});
  }
  const tl=camp.level.tool;
  if(tl==='extraMoves')return t('campaign.note.toolExtra',{n:camp.n,goals});
  if(tl)return t('campaign.note.tool',{n:camp.n,goals,tool:Camp.toolName(tl)});
  return t('campaign.note.plain',{n:camp.n,goals});
}
function storedMode(){try{return localStorage.getItem(MODE_KEY)||'';}catch{return '';}}
let campaignMode=false,camp=null,levels=null,levelsLoading=null,stashedBestTile=null,needsEntry=false,armedTool=null;
let campaignProgress=Camp.loadProgress(),inventory=Camp.loadInventory();
// launch-13 (Testphase): Vorrat einmalig leeren; Werkzeug-Protokoll nur lokal (tool-log.mjs).
if(Camp.TOOL_STOCK_RESET)inventory=Camp.resetStockOnce(inventory).inventory;
// launch-14: Abenteuer-Fortschritt + Geschenke einmalig zurücksetzen (Merker gegen Wiederholung); Endlos usw. bleibt.
if(Camp.CAMPAIGN_RESET){const r=Camp.resetCampaignOnce(campaignProgress,inventory);campaignProgress=r.progress;inventory=r.inventory;}
// launch-18: Sterne der umgebauten Level 11–100 einmalig zurücksetzen; 1–10 bleiben.
if(Camp.STARS_RESET){const s=Camp.resetChangedStarsOnce(campaignProgress);campaignProgress=s.progress;}
// launch-22: Abenteuer (Sterne, Vorrat, Geschenke, Freischaltungen) einmalig leeren für die Tutorials.
// Endlos-Spielstand, Rekord und Endlos-Vorrat bleiben. Epoche 22, damit die Cloud den alten Stand nicht zurückbringt.
// launch-30: noch einmal für alle (neue Kapitel-Hürden 24★): Abenteuer, Geschenke, Freischaltungen und gesehene
// Erklär-Fenster leer, Start ab Level 1. Endlos, Rekord und Einstellungen bleiben. Epoche 30.
if(Camp.TUTORIAL_RESET){const t=Camp.resetAdventureForTutorialsOnce(campaignProgress,inventory);campaignProgress=t.progress;inventory=t.inventory;}
if(Camp.CURVE_STARS_RESET){const c=Camp.resetCurveStarsOnce(campaignProgress);campaignProgress=c.progress;}
// launch-28: neue Regeln (Hilfen kosten Sterne, strengere Kapitel-Hürden). Sterne werden einmalig nach den neuen
// Schwellen neu bewertet – nie gelöscht, gelöste Level bleiben gelöst, schon offene Kapitel bleiben offen
// (openChapters). Alter Werkzeug-Vorrat entfällt (Hilfen sind jetzt unbegrenzt), Gold-Geschenke bleiben. Epoche 28.
{const m=Camp.migrateRules28Once(campaignProgress,inventory);if(m.migrated){campaignProgress=m.progress;inventory=m.inventory;Camp.saveProgress(campaignProgress);}}
// launch-19: Abenteuer-Fortschritt + Vorrat zusätzlich in der Cloud sichern (anonym, gleicher Geräte-Token).
// Offline zuerst: lokal bleibt die Wahrheit, der Abgleich läuft still im Hintergrund (progress-sync.mjs).
const progressSync=createProgressSync({fetch:apiFetch,epoch:epochOf(Camp.PROGRESS_EPOCH),hasToken:hasSaveToken,
  getLocal:()=>({progress:campaignProgress,inventory}),
  setLocal:(p,inv)=>{campaignProgress=p;Camp.saveProgress(p);if(inv!==inventory){inventory=inv;Camp.saveInventory(inv,undefined,false);}try{renderCampaign();void worldMenu.refresh?.();}catch{}}});
const cloudSync=()=>{if(!labMode)progressSync.schedule();};
progressSync.attach(window);
const BUILD_LABEL='launch-36';
let toolLog=ToolLog.loadLog(),logAttempt=null;
// Versuche, die beim letzten Mal offen blieben (Seite geschlossen), gelten als abgebrochen.
if(toolLog.attempts.some(a=>!a.outcome)){for(const a of toolLog.attempts)if(!a.outcome)ToolLog.endAttempt(toolLog,a.id,{outcome:'quit',moves:a.moves});ToolLog.saveLog(toolLog);}
function loadLevels(){
  return levelsLoading||=fetch(LEVELS_URL,{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('levels '+r.status);return r.json();})
    .then(data=>{data.levels.forEach(Camp.validateLevel);levels=data.levels;void worldMenu.refresh?.();return levels;})
    .catch(error=>{levelsLoading=null;throw error;});
}
function campaignSummary(){
  const count=levels?.length||25,next=Camp.nextLevel(campaignProgress,count),total=Camp.totalStars(campaignProgress);
  let caption='';
  const open=Array.from({length:count},(_,i)=>i+1).find(n=>!campaignProgress.levels[String(n)]);
  const lock=open?Camp.lockReason(campaignProgress,open):null;
  if(lock?.reason==='stars')caption=t('campaign.chapterNeed',{chapter:lock.chapter,need:lock.need});
  else if(!open&&levels)caption=t('campaign.allDone');
  else caption=t('campaign.chapterCaption',{chapter:Camp.chapterOf(next),n:next});
  return {next,ready:!!levels,caption,total,count,inventory:Camp.goldStock(inventory),gold:true,pendingGifts:Camp.TOOL_GIFTS?inventory.pending.length:0,shop:shopEnabled(),allDone:!open&&!!levels,modesUnlocked:Camp.modesUnlocked(campaignProgress)};
}
const campaignUI=createCampaignUI({
  onPlay:n=>{void worldMenu.play({campaign:n});},
  onNext:()=>{if(camp)void playLevel(camp.n+1);},
  onRetry:()=>{if(camp)void playLevel(camp.n);},
  onExtra:()=>{void useExtraMoves('result');},
  onMenu:()=>void backToMenu(),
  onTool:type=>{if(type==='extraMoves')void useExtraMoves();else toggleTool(type);},
  onGift:()=>void openGift(),
  onStar:i=>{sound.play('star',i+1);haptics.pulse(i===2?'big':'merge');},
  reduceMotion,
});
onLangChange(()=>{if(labMode&&camp&&campaignMode)campaignUI.renderHud(camp.run,camp.n,labHudLabel());});
// launch-28: Hilfsmittel (+3 Züge, Rakete) beliebig oft. Gold-Geschenke werden zuerst verbraucht (ohne Werbung).
// launch-32: keine Hilfe kostet Sterne (Sterne = übrige Züge); ohne Werbefrei kommt vor jedem Einsatz ein Belohnungsclip.
const goldNow=()=>Camp.goldStock(inventory);
// launch-29/32: Reihenfolge der Bild-Lektionen: erst „Hilfe ist okay, Sterne kommen von übrigen Zügen“ (L6), dann „Gold = Hilfe ohne Werbung“.
// Gold bleibt im Vorrat, bis die Stern-Lektion gesehen ist (Tutorial L6 oder erste normale Hilfe), und im Tutorial-Level selbst.
// Bestand: wer L6 schon gelöst oder die launch-28-Erklärung gesehen hat, gilt als belehrt.
const costLessonDone=()=>explainer.seen('tool-cost')||explainer.seen('tools')||!!campaignProgress?.levels?.['6'];
const goldBlocked=()=>!!(campaignMode&&(camp?.tutorialRun||!costLessonDone()));
const hasGold=type=>!goldBlocked()&&(inventory?.[type]|0)>0;
// launch-32: Hilfen kosten keine Sterne – nach einem Einsatz nur bei Gold ein kurzer Hinweis „ohne Werbung“.
function announceToolCap(gold=false,type='rocket'){if(gold)showNote(t('note.goldUsed',{tool:Camp.toolName(type)}),2800);}
/** Einsatz verbuchen: Gold aus dem Vorrat nehmen (falls Gold), protokollieren. ctx = Stand VOR dem Einsatz. */
function commitTool(type,gold,ctx){
  if(gold){const g=Camp.spendGold(inventory,type);if(g){inventory=g;Camp.saveInventory(inventory);cloudSync();}}
  logTool('use',type,{...ctx,gold:!!gold});
}
/** launch-32: Bild-Lektionen. Nach der Tutorial-Hilfe: Sterne bleiben (übrige Züge zählen). Beim ersten Gold-Einsatz: gratis, ohne Werbung. */
function toolLesson(type,{free=false,gold=false}={}){
  if(gold)return explainer.showOnceAs('gold-used','gifts',{used:type});
  if(free){explainer.mark('tool-cost');return explainer.show('tools',{used:type});}
  return explainer.showOnceAs('tool-cost','tools',{used:type});
}
// Tutorial (Level 6, bis es einmal gelöst ist): erst ein Hilfsmittel ausprobieren – gratis, ohne Werbung.
const TOOL_TUTORIAL_LEVEL=6;
const tutorialToolPending=()=>!!(campaignMode&&camp?.tutorialTool&&!camp.run.toolsUsed.length&&!(camp.run.giftsUsed?.length));
function tutorialToolDone(){if(camp?.tutorialTool){camp.tutorialTool=false;campaignUI.toolButton('rocket')?.classList.remove('is-tutor');campaignUI.toolButton('extraMoves')?.classList.remove('is-tutor');camp.tutorialDone=true;}}
// ---------- Werbung (Dummy) + Werkzeug-Protokoll ----------
// launch-28: Jeder Einsatz eines Abenteuer-Hilfsmittels verlangt einen Belohnungsclip, außer der Spieler
// hat Werbefrei (App) oder setzt ein Gold-Geschenk ein. Im Web bleibt der Dummy-Clip als Testpfad.
const adsEnabled=()=>Camp.AD_TOOLS;
const refillMode=()=>adsEnabled()?'ad':shopEnabled()?'shop':null;
const toolAdRequired=()=>campaignMode&&!!camp&&!labMode&&!isAdFree();
function logCtx(where){
  const r=camp?.run;if(!r)return {where};
  return {level:camp.n,move:r.moves,movesLeft:Camp.movesLeft(r),where,
    progress:r.level.goals.map(g=>{const p=Camp.goalProgress(g,r);return {type:g.type,current:p.current,target:p.target};})};
}
function logTool(kind,type,ctx){ToolLog.logEvent(toolLog,logAttempt?.id,kind,type,ctx);ToolLog.saveLog(toolLog);}
function beginAttempt(){
  if(labMode){logAttempt=null;return;}   // Test-Level: kein Werkzeug-Protokoll
  if(logAttempt)ToolLog.endAttempt(toolLog,logAttempt.id,{outcome:'quit',moves:camp?.run?.moves??0});   // nur wenn noch offen
  logAttempt=ToolLog.startAttempt(toolLog,camp.n,{limit:camp.run.level.moves});ToolLog.saveLog(toolLog);
}
function endLogAttempt(outcome,extra={}){if(!logAttempt)return;ToolLog.endAttempt(toolLog,logAttempt.id,{outcome,...extra});ToolLog.saveLog(toolLog);}
const adUI=createAdUI({sound,haptics,onWatch:type=>{
  const f=adFollow;adFollow=null;
  lastAd={type,where:f?.where||'tool'};
  logTool('ad',type,logCtx(f?.where||'tool'));
  if(f?.then)f.then();else renderCampaign();
},onClose:()=>{const f=adFollow;adFollow=null;f?.cancel?.();renderCampaign();},onUnavailable:()=>helpUnavailable('noAd')});
const adPacing=createAdPacing({isAdFree});
// launch-28: bebilderte Erklär-Fenster (Regeln, Hilfsmittel, Gold-Geschenke, Kapitel, Werbung).
const explainer=createExplainer({sound,haptics});
let adFollow=null,lastAd=null;
/** Belohnungsclip vor dem Einsatz. Werbefrei oder kein Abenteuer → sofort true. Abbruch → false. */
/** launch-31: Hilfe braucht einen Clip, aber keiner ist zu haben (offline / kein Clip geladen) → gesperrt, kurzer Hinweis.
 *  Werbefrei, Gold-Geschenke und die freie Tutorial-Hilfe brauchen keinen Clip und bleiben nutzbar. */
function helpUnavailable(why='offline'){showNote(t(why==='offline'?'tool.offline':'tool.noAd'),2800);haptics.pulse?.('tap');}
const helpOffline=()=>toolAdRequired()&&isOffline();
function requestToolAd(type,where='tool'){
  if(!toolAdRequired())return Promise.resolve(true);
  if(isOffline()){helpUnavailable('offline');return Promise.resolve(false);}
  if(adUI.isOpen)return Promise.resolve(false);
  return explainer.showOnce('ads').then(()=>new Promise(resolve=>{
    let done=false;
    const finish=ok=>{if(done)return;done=true;adFollow=null;resolve(!!ok);};
    adFollow={type,where,then:()=>finish(true),cancel:()=>finish(false)};
    adUI.open(type);
  }));
}
function refreshAdFreeSettings(){
  const buy=document.getElementById('adfree-buy');
  const desc=document.getElementById('adfree-desc');
  const owned=document.getElementById('adfree-owned');
  if(!buy)return;
  const offer=canOfferAdFree(),have=isAdFree();
  buy.hidden=!offer;
  if(desc)desc.hidden=!offer;
  if(owned)owned.hidden=!have;
  const price=buy.querySelector('[data-adfree-price]');
  if(price)price.textContent=adFreePriceLabel();
  buy.setAttribute('aria-label',t('settings.adFreeAria',{price:adFreePriceLabel()}));
}
function installAdFreeSettings(){
  const buy=document.getElementById('adfree-buy');
  if(!buy||buy.dataset.ready)return;
  buy.dataset.ready='1';
  buy.addEventListener('click',async()=>{
    if(!canOfferAdFree())return;
    buy.disabled=true;
    const r=await purchaseAdFree();
    buy.disabled=false;
    refreshAdFreeSettings();
    if(r.ok)showNote(t('settings.adFreeThanks'),2800);
    else if(r.reason==='cancelled')showNote(t('shop.cancelled'),2200);
    else showNote(t('shop.unavail'),2200);
  });
  document.querySelectorAll('[data-open-settings]').forEach(b=>b.addEventListener('click',refreshAdFreeSettings));
  onLangChange(refreshAdFreeSettings);
  refreshAdFreeSettings();
}
installAdFreeSettings();
const statsUI=createStatsUI({getLog:()=>toolLog,build:BUILD_LABEL,sound,onReset:()=>{
  toolLog=ToolLog.emptyLog();logAttempt=null;
  if(campaignMode&&camp&&camp.run.status==='playing')logAttempt=ToolLog.startAttempt(toolLog,camp.n,{limit:camp.run.level.moves});
  ToolLog.saveLog(toolLog);
}});
document.getElementById('tool-stats-open')?.addEventListener('click',()=>statsUI.open());
// ---------- Shop + Geschenke (launch-12) ----------
const shopEnabled=()=>Camp.TOOL_STOCK&&Shop.SHOP_CONFIG.enabled;
const shopUI=createShopUI({
  getStock:()=>inventory,sound,haptics,reduceMotion,
  onBuy:async id=>{
    const r=await Shop.purchase(id);
    if(r.ok){inventory=Camp.addToStock(inventory,r.items);Camp.saveInventory(inventory);cloudSync();lastPurchase={id,items:r.items,test:r.test};renderCampaign();}
    return r;
  },
  onClose:()=>{renderCampaign();void worldMenu.refresh?.();},
});
let lastPurchase=null;
function openShop(type){
  if(!shopEnabled())return;
  if(armedTool)toggleTool(null);
  shopUI.open({focus:type});
}
const giftFx=createGiftFx({reduceMotion,sound,haptics});
/** Ältestes offenes Geschenk öffnen: Blase → Platzen → Gutschrift → Symbole fliegen in Leiste/Karte. */
async function openGift(){
  if(!Camp.TOOL_GIFTS||giftFx.active||explainer.isOpen||!inventory.pending.length)return false;
  const gift=inventory.pending[0];
  // launch-29: keine Erklärung beim Öffnen – „Gold kostet keinen Stern“ kommt beim ersten Gold-Einsatz (toolLesson).
  if(giftFx.active||!inventory.pending.some(g=>g.id===gift.id))return false;
  const target=type=>{
    const b=campaignMode&&!campaignUI.resultOpen?campaignUI.toolButton(type):null;
    if(b&&b.offsetWidth)return b;
    return document.querySelector(`#home-menu:not([hidden]) .aw-chip[data-type="${type}"]`)||(campaignUI.resultOpen?campaignUI.giftButton:null);
  };
  await giftFx.open({items:[{type:gift.type,count:1}],gold:true,targetFor:target,onPop:()=>{
    const c=Camp.collectGift(inventory,gift.id);if(!c)return;
    inventory=c.inventory;Camp.saveInventory(inventory);cloudSync();
    logTool('gift',gift.type,{...logCtx(campaignUI.resultOpen?'result':campaignMode?'level':'menu'),giftId:gift.id,giftLevel:Camp.giftLevel(gift.id)});   // launch-14: Geschenke im Protokoll
    renderCampaign();if(campaignUI.resultOpen)campaignUI.setGifts(inventory.pending);
  }});
  if(campaignUI.resultOpen)campaignUI.setGifts(inventory.pending);
  void worldMenu.refresh?.();
  return true;
}
// launch-31: Verbindung weg/da → Hilfe-Knöpfe neu zeichnen (Sperr-Abzeichen).
for(const ev of ['online','offline'])addEventListener(ev,()=>{try{if(campaignMode&&camp)renderCampaign();}catch{}});
function renderCampaign(){
  if(!campaignMode||!camp)return;
  campaignUI.renderHud(camp.run,camp.n,labMode?labHudLabel():null);   // launch-28: Test-Titel nur im Testmodus
  const tutor=tutorialToolPending();
  campaignUI.renderTools(goldBlocked()?{extraMoves:0,rocket:0}:goldNow(),{needsAd:toolAdRequired(),offline:helpOffline(),canExtra:camp.run.status==='playing',armed:armedTool,locked:camp.run.status!=='playing',
    toolsUsed:camp.run.toolsUsed.length,giftsUsed:camp.run.giftsUsed?.length|0,freeTry:tutor||null});
  for(const ty of Camp.ADVENTURE_TOOLS)campaignUI.toolButton(ty)?.classList.toggle('is-tutor',tutor);
}
async function prepareLevel(n){
  if(labMode)await loadLab();else await loadLevels();
  const level=levelList()[n-1];
  if(!level)throw new Error('Level fehlt: '+n);
  if(!campaignMode){stashedBestTile=bestTile;campaignMode=true;}
  generation++;pendingMove=null;disarmTools();bombLast=0;
  moveCombo=0;mergeEffects.streak?.(0,{silent:true});
  camp={n,level,run:Camp.createLevelRun(level),tutorialTool:!labMode&&n===TOOL_TUTORIAL_LEVEL&&!campaignProgress.levels[String(n)],tutorialDone:false};
  camp.tutorialRun=camp.tutorialTool;
  beginAttempt();
  board=camp.run.board.map(row=>row.map(tile=>tile?{...tile}:null));
  nextId=camp.run.ctx.nextId;queue=Camp.queueOf(camp.run);score=0;moves=0;
  gameElement.classList.add('is-campaign');
  mergeEffects.clear();visual.clear();renderBest();visual.hideHud('best',true);
  renderCampaign();
  await prepareEntryScene();
  needsEntry=false;
  scheduleBombTick();
}
function leaveCampaign(){
  if(!campaignMode)return;
  adPacing.endlessPause();
  ghostFinger.hide();
  endLogAttempt('quit',{moves:camp?.run?.moves??0});logAttempt=null;adUI.close({silent:true});
  disarmTools();campaignMode=false;camp=null;labMode=false;renderBombBadges();
  gameElement.classList.remove('is-campaign');campaignUI.hide();visual.hideHud('best',false);
  if(stashedBestTile!=null)bestTile=stashedBestTile;
  hasSavedGame=loadState()||hasSavedGame;
  renderBest();
  needsEntry=true;
}
async function playLevel(n){
  if(!campaignMode||busy)return;
  const list=levelList();
  if(list&&n>list.length)return;
  const lock=labMode?null:Camp.lockReason(campaignProgress,n);
  if(lock){showNote(lock.reason==='stars'?t('note.needStars',{chapter:lock.chapter,need:lock.need}):t('campaign.locked'),3000);if(lock.reason==='stars')void explainer.show('gates',gatesCtx());return;}
  campaignUI.hideResult();confetti.stop();veil.hidden=true;paused=false;gameElement.classList.remove('is-paused');
  pauseButton.textContent='Ⅱ';pauseButton.setAttribute('aria-pressed','false');pauseButton.setAttribute('aria-label',t('hud.pauseAria'));
  graphics.pause(false);sound.resume();
  started=false;
  await prepareLevel(n);
  await enterGame();
  if(labMode)showNote(levelNote(),5200);
  else if(camp.level.tool)showNote(levelNote(),4200);
  else if(!camp.level.tip)showNote(levelNote(),2600);
  scheduleBombTick();
  await levelExplainers();
  showTutorialFinger(true);
}
// launch-28: Erklär-Fenster, wenn ein Thema zum ersten Mal wichtig wird (später unter Regeln nachlesbar).
const gatesCtx=()=>{const n=Camp.nextLevel(campaignProgress,levels?.length||100),k=Camp.chapterOf(n)+1;return {chapter:k,need:Camp.starGate(k),have:Camp.totalStars(campaignProgress)};};
const LEVEL_TOPICS={1:'merge',4:'merge5',5:'street',10:'gates'};
async function levelExplainers(){
  if(!campaignMode||!camp||labMode)return;
  const n=camp.n,topic=LEVEL_TOPICS[n];
  if(topic)await explainer.showOnce(topic,topic==='gates'?gatesCtx():undefined);
  // launch-29: erst benutzen, dann erklären – die Bild-Lektion „kostet einen Stern“ kommt direkt nach dem Einsatz (toolLesson).
  if(camp?.n===n&&tutorialToolPending()){showNote(t('note.tutorialTool'),0);renderCampaign();}
}
async function moveCampaign(direction,line){
  const r=camp.run;
  if(r.status!=='playing')return;
  if(tutorialToolPending()){showNote(t('note.tutorialTool'),3000);haptics.pulse('tap');for(const ty of Camp.ADVENTURE_TOOLS){const b=campaignUI.toolButton(ty);if(b){b.classList.remove('is-nudge');void b.offsetWidth;b.classList.add('is-nudge');}}return;}
  ghostFinger.hide();
  if(armedTool)toggleTool(null);
  const value=Camp.queueOf(r)[0];
  if(value==null)return;
  const tile={id:nextId,value};
  const inserted=insertTile(board,direction,line,tile);
  if(!inserted.accepted){showNote(t('note.rowFull'));haptics.pulse('tap');return;}
  const result=Camp.applyLevelMove(r,direction,line);
  if(!result.ok)return;
  scheduleBombTick();
  const turn=generation;busy=true;
  try{
    sound.play('slide');haptics.pulse('move');phoneMotion.reset();
    nextId++;board=inserted.board;queue=Camp.queueOf(r);note.hidden=true;
    renderBoard({id:tile.id,direction});
    if(!reduceMotion.matches)await new Promise(resolve=>{
      function done(){if(graphics.tiles.some(t=>t.motion))requestAnimationFrame(done);else resolve();}
      requestAnimationFrame(done);
    });
    if(turn!==generation)return;
    await resolveMerges(turn,{streak:true});
    if(turn!==generation)return;
    moves=r.moves;
    // The animated board and campaign.mjs use the same rules; keep campaign.mjs authoritative.
    const vals=b=>b.map(row=>row.map(t=>t?t.id+':'+t.value:'.').join(',')).join(';');
    if(vals(board)!==vals(r.board)){console.warn('[campaign] board resync');board=r.board.map(row=>row.map(t=>t?{...t}:null));renderBoard();}
    renderQueue();renderCampaign();
  }finally{if(turn===generation)busy=false;}
  if(turn!==generation)return;
  if(r.status!=='playing'){await finishLevel();return;}
  showTutorialFinger();
  const queued=pendingMove;pendingMove=null;
  if(queued)void move(queued.direction,queued.line).catch(()=>{});
}
async function finishLevel(){
  ghostFinger.hide();
  const r=camp.run,won=r.status==='won',n=camp.n,turn=generation;
  let stars=0,gifts=[];
  endLogAttempt(won?'won':'lost',{moves:r.moves,stars:won?Camp.starsOfRun(r):0,lostReason:r.lostReason});
  if(won){
    stars=Camp.starsOfRun(r);
    if(!labMode){campaignProgress=Camp.recordResult(campaignProgress,camp.level.id,{stars,moves:r.moves});Camp.saveProgress(campaignProgress);cloudSync();adPacing.levelWon();}
    if(!labMode&&Camp.TOOL_GIFTS){const g=Camp.queueGifts(inventory,campaignProgress);if(g.queued.length){inventory=g.inventory;Camp.saveInventory(inventory);cloudSync();}}
    sound.play('record');haptics.pulse('big');
    if(!reduceMotion.matches)visual.celebrateHud?.('queue-0',.3);
    // Erst kurz Konfetti über dem Brett, dann der Dialog mit den Sternen.
    celebrating=true;campaignUI.mark('confetti');
    try{await confetti.burst(boardRect(),{reduced:reduceMotion.matches,burstMs:reduceMotion.matches?450:1200});}
    finally{celebrating=false;}
  } else {haptics.pulse('tap');await wait(350);}
  if(turn!==generation||!campaignMode){confetti.stop();return;}
  paused=true;releaseGesture();phoneMotion.reset();
  const count=levelList().length,nextLock=n<count&&!labMode?Camp.lockReason(campaignProgress,n+1):null;
  campaignUI.showResult({n,won,stars,moves:r.moves,limit:Camp.moveLimit(r),base:r.level.moves,left:Camp.starMovesLeft(r),lostReason:r.lostReason,toolLevel:r.level.tool||null,
    canNext:won&&n<count&&!nextLock,nextLock,gifts:Camp.TOOL_GIFTS&&!labMode?inventory.pending.slice():gifts,extraAvailable:1,extraGold:inventory.extraMoves|0,extraAd:toolAdRequired()&&!hasGold('extraMoves'),toolsUsed:r.toolsUsed.length,giftsUsed:r.giftsUsed?.length|0,tutorialTool:won&&!!camp.tutorialDone,
    unlockModes:won&&!labMode&&n===Camp.MODES_UNLOCK_LEVEL&&Camp.modesUnlocked(campaignProgress)});
  renderCampaign();
  // launch-32: Signal für die App-Hülle (z. B. ATT-Vorfrage erst nach dem ersten gelösten Level). Im Web ohne Zuhörer.
  if(won&&!labMode){try{dispatchEvent(new CustomEvent('squish:level-won',{detail:{level:n,stars}}));}catch{}}
}
async function useExtraMoves(where='tool'){
  if(!campaignMode||!camp||busy)return;
  const r=camp.run;
  if(r.status==='won'||(r.status==='lost'&&r.lostReason!=='moves')){if(r.status==='lost')showNote(t('note.extraNoHelp'),2600);return;}
  const gold=hasGold('extraMoves'),free=tutorialToolPending();
  if(!gold&&!free&&!await requestToolAd('extraMoves',where==='result'?'result':'tool'))return;
  if(!campaignMode||camp?.run!==r||busy)return;
  const ctx=logCtx(campaignUI.resultOpen?'result':'level');
  const wasLost=r.status==='lost';
  const added=Camp.addExtraMoves(r,3,{gift:gold});
  if(!added){showNote(t('note.extraNoHelp'),2600);return;}
  if(wasLost&&logAttempt){ToolLog.reopenAttempt(toolLog,logAttempt.id);ToolLog.saveLog(toolLog);}   // Weiterspielen: Ausgang folgt später
  commitTool('extraMoves',gold,ctx);
  if(free)tutorialToolDone();
  queue=Camp.queueOf(r);renderQueue();
  if(campaignUI.resultOpen){campaignUI.hideResult();paused=false;}
  renderCampaign();haptics.pulse('merge');sound.play('record');
  showNote(gold?t('note.goldUsed',{tool:Camp.toolName('extraMoves')}):t('note.extraUsed',{n:added}),2800);
  showTutorialFinger();
  await toolLesson('extraMoves',{free,gold});
}
// ---------- Hilfsmittel: Rakete und +3 Züge ----------
const toolFx=createToolFx({reduceMotion,shakeTarget:()=>document.getElementById('playfield')});
const ghostFinger=createGhostFinger({reduceMotion});
function showTutorialFinger(afterEntry=false){
  if(!campaignMode||!camp||camp.level.kind!=='tutorial'||camp.run.status!=='playing'||campaignUI.resultOpen||paused){ghostFinger.hide();return;}
  const place=()=>{
    if(!campaignMode||!camp||camp.run.status!=='playing')return;
    const m=Camp.tutorialHintMove(camp.run);
    if(!m){ghostFinger.hide();return;}
    ghostFinger.show(hintLane(m.direction,m.line),{reduced:reduceMotion.matches});
  };
  if(afterEntry)requestAnimationFrame(()=>requestAnimationFrame(place));
  else place();
}

function disarmTools(){armedTool=null;}
function toggleTool(type){
  if(!campaignMode||!camp)return;
  if(type!=null&&type!=='rocket')return;
  const on=type!=null&&armedTool!==type;
  if(on&&(camp.run.status!=='playing'||busy))return;
  if(on&&helpOffline()&&!hasGold(type)&&!tutorialToolPending()){helpUnavailable('offline');return;}   // launch-31: gar nicht erst scharf
  armedTool=on?type:null;renderCampaign();
  if(on)showNote(t(hasGold('rocket')?'tool.note.rocketGold':'tool.note.rocket'),0);else if(!tutorialToolPending())note.hidden=true;else showNote(t('note.tutorialTool'),0);
}
function cellOf(tileId){let cell=null;board.forEach((row,r)=>row.forEach((t,c)=>{if(t&&t.id===tileId)cell=[r,c];}));return cell;}
// Bildschirmposition (Client-Pixel) einer Brettzelle.
function cellPoint(row,col){
  const host=document.getElementById('graphics').getBoundingClientRect(),loc=visual.location(row,col);
  return {x:host.left+host.width*loc.x/100,y:host.top+host.height*(loc.y+1.5)/100,size:host.width*loc.size/100};
}
function toolOrigin(type){const r=campaignUI.toolButton(type)?.getBoundingClientRect();return r?{x:r.left+r.width/2,y:r.top+r.height/2}:{x:innerWidth/2,y:innerHeight};}
async function rocketAt(tileId){
  const cell=cellOf(tileId);
  if(!cell||!camp||busy)return false;
  if(camp.run.board[cell[0]][cell[1]]?.bound){showNote(t('note.chainVsRocket'),2200);return false;}
  const gold=hasGold('rocket'),free=tutorialToolPending(),run=camp.run;
  if(!gold&&!free&&!await requestToolAd('rocket'))return false;
  if(!campaignMode||camp?.run!==run||busy||!cellOf(tileId))return false;
  const ctx=logCtx('level');
  if(!Camp.useRocket(run,cell[0],cell[1],{gift:gold}))return false;
  commitTool('rocket',gold,ctx);if(free)tutorialToolDone();
  armedTool=null;note.hidden=true;
  const turn=generation;busy=true;renderCampaign();
  try{
    const target=cellPoint(cell[0],cell[1]);
    sound.play('launch');
    await toolFx.rocket(toolOrigin('rocket'),target,target.size);
    if(turn!==generation)return true;
    // Einschlag: der echte Stein platzt wie ein Merge-Ballon, dazu der Comic-BOOM.
    visual.popTile?.(tileId);
    toolFx.boom(target,target.size);sound.play('boom');haptics.pulse('big');
    if(!reduceMotion.matches)for(const [dr,dc] of [[0,1],[0,-1],[1,0],[-1,0]]){
      const n=board[cell[0]+dr]?.[cell[1]+dc];if(n)visual.scheduleWobble?.(n.id,.42,.06);
    }
    board=board.map(row=>row.slice());board[cell[0]][cell[1]]=null;
    renderBoard();
  }finally{if(turn===generation){busy=false;renderCampaign();announceToolCap(gold,'rocket');}}
  if(turn===generation&&camp?.run===run&&run.status==='playing')await toolLesson('rocket',{free,gold});
  // launch-15: „höchstens N Steine übrig“ kann direkt durch die Rakete erfüllt werden
  if(turn===generation&&camp?.run?.status==='won')await finishLevel();
  return true;
}
// Einschubseite → Zellen der Bahn in Laufrichtung (left = von rechts, down = von oben …).
function hintLane(direction,line){
  const idx=[0,1,2,3,4];
  const cells=direction==='right'?idx.map(c=>[line,c]):direction==='left'?idx.map(c=>[line,4-c]):direction==='down'?idx.map(r=>[r,line]):idx.map(r=>[4-r,line]);
  return cells.map(([r,c])=>cellPoint(r,c));
}
async function backToMenu(){
  if(booting||!started||duelMode)return;
  if(busy&&!paused)return;
  campaignUI.hideResult();confetti.stop();
  if(campaignMode)leaveCampaign();
  else{saveState({now:true});hasSavedGame=board.flat().some(Boolean);}
  generation++;pendingMove=null;releaseGesture();disarmTools();busy=false;
  paused=false;veil.hidden=true;gameElement.classList.remove('is-paused');
  pauseButton.textContent='Ⅱ';pauseButton.setAttribute('aria-pressed','false');pauseButton.setAttribute('aria-label',t('hud.pauseAria'));
  started=false;mergeEffects.clear();visual.clear();needsEntry=true;note.hidden=true;
  for(let index=0;index<3;index++)visual.hideHud('queue-'+index,true);
  gameElement.classList.add('is-start');gameElement.inert=true;gameElement.setAttribute('aria-hidden','true');
  graphics.pause(false);sound.resume();
  const overlay=document.getElementById('loading-screen');
  overlay.hidden=false;overlay.inert=false;overlay.dataset.phase='menu';
  const unlocked=Camp.modesUnlocked(campaignProgress);
  const pref=storedMode();
  await worldMenu.open({screen:pref==='campaign'?'campaign':pref==='endless'&&unlocked?'endless':'home'});
}

// Endlos-Steine kommen zufällig (keine Bestenliste mehr, also keine Server-Seeds/Replays).
const random=()=>Math.random;
const wait = ms => reduceMotion.matches ? Promise.resolve() : visual.wait(ms / 1000);
const format = value => fmtNum(value);

function freshState() {
  generation++;pendingMove=null;
  moveCombo=0;mergeEffects.streak?.(0,{silent:true});
  nextId = 1;
  const values=createStartValues(random());
  board = values.map(row => row.map(value => value === null ? null : newTile(value)));
  queue = Array.from({length:3},()=>nextSpawn({board,moves:0,highest:4,random:random()}));
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
    return true;
  } catch {
    freshState();
    return false;
  }
}


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
      board: resolved.board, moves: futureMoves, highest: futurePeak, random: Math.random,
    })], score: futureScore, best: Math.max(best, futureScore),
      bestTile: Math.max(bestTile, futurePeak), moves: futureMoves,
      peak: futurePeak, revision: ++revision };
  }
  return { board, queue, score, best, bestTile: Math.max(bestTile, peak),
    moves, peak, revision: ++revision };
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
    showNote(t('note.offlineSync'), 3500);
  } finally {
    saving = false;
  }
}

function saveState({ now = false } = {}) {
  if(duelMode||campaignMode)return;
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
    showNote(t('note.offlineLocal'), 3500);
  } finally {
    booting = false;
    note.hidden = true;
  }
  await prepareEntryScene();
}

async function prepareEntryScene() {
  renderBoard();renderQueue();
  await visual.prepareEntry();
  try{await mergeEffects.warm?.();}catch{}
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
  if (!campaignMode && isGameOver(board)) showDialog(true);
  }
  }
}

function location(row,col) { return visual.location(row,col); }
// Bildschirm-Rechteck des 5×5-Bretts (für das Konfetti).
function boardRect(){
  const host=document.getElementById('graphics').getBoundingClientRect();
  const pt=(r,c)=>{const l=location(r,c);return {x:host.left+l.x/100*host.width,y:host.top+l.y/100*host.height};};
  const a=pt(0,0),b=pt(4,4),pad=Math.abs(b.x-a.x)/8;
  return {left:Math.min(a.x,b.x)-pad,top:Math.min(a.y,b.y)-pad,width:Math.abs(b.x-a.x)+2*pad,height:Math.abs(b.y-a.y)+2*pad};
}
function graphicsTiles(incoming) {
  return board.flatMap((line,row)=>line.flatMap((tile,col)=> {
    if(!tile)return [];
    // launch-17: besondere Squishes (Eis, Schloss, Bombe) – Zahl immer sichtbar.
    const data={id:tile.id,value:Math.max(1,tile.value),row,col,special:tile.bound?'bound':tile.ice?'ice':tile.bomb!=null?'bomb':tile.joker?'joker':null};
    if(freedNow.has(tile.id))data.freed=true;   // launch-17: gerade befreit → Abzeichen poppt weg
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
let freedNow=new Set();
function renderBoard(incoming) {
  // Reduced motion: no slide-in, so no off-board start position either
  // (the new stone used to stay outside the board at its entry point).
  const animate=!!incoming&&!reduceMotion.matches;
  visual.sync(graphicsTiles(animate?incoming:null),{animate,duration:.12,incoming:animate?incoming:null});
  if(campaignMode||bombBadges.size)renderBombBadges();
}
// ---------- launch-16: Bomben-Countdown ----------
// Echtzeit, 20 s ab dem ersten Zug. Die Uhr steht bei Pause, verdeckter Seite, offenem Dialog/Menü/Shop/
// Werbung/Statistik, während Animationen (busy).
// Anzeige: kleine DOM-Abzeichen über den Bomben (Text ändert sich 1×/s) – kein WebGL-Frame nötig.
const bombBadges=new Map();let bombLayer=null,bombTimer=0,bombLast=0,bombBlast=false;
function bombPaused(){
  return paused||document.hidden||busy||celebrating||!started||explainer.isOpen||campaignUI.resultOpen||shopUI.isOpen||adUI.isOpen||giftFx.active||statsUI.isOpen||worldMenu.active;
}
function renderBombBadges(){
  const list=[];
  if(campaignMode&&camp&&!worldMenu.active&&started)camp.run.board.forEach((row,r)=>row.forEach((t,c)=>{if(t&&t.bomb!=null)list.push({t,r,c});}));
  const keep=new Set(list.map(x=>x.t.id));
  for(const [id,el] of bombBadges)if(!keep.has(id)){el.remove();bombBadges.delete(id);}
  if(!list.length)return;
  if(!bombLayer){bombLayer=document.createElement('div');bombLayer.className='bomb-layer';bombLayer.setAttribute('aria-hidden','true');document.body.append(bombLayer);}
  const hide=paused||campaignUI.resultOpen||shopUI.isOpen||adUI.isOpen||statsUI.isOpen||giftFx.active;
  if(bombLayer.hidden!==hide)bombLayer.hidden=hide;
  for(const {t,r,c} of list){
    let el=bombBadges.get(t.id);
    if(!el){el=document.createElement('span');el.className='bomb-badge';el.innerHTML='<b></b>';bombLayer.append(el);bombBadges.set(t.id,el);}
    const sec=String(Math.ceil(t.bomb/1000));if(el.firstChild.textContent!==sec)el.firstChild.textContent=sec;
    el.classList.toggle('is-low',t.bomb<=5000);el.classList.toggle('is-waiting',!camp.run.bombClock);
    const p=cellPoint(r,c),k=p.size||40;
    const x=Math.round(p.x+k*.3),y=Math.round(p.y-k*.42);
    if(el.dataset.at!==x+','+y){el.dataset.at=x+','+y;el.style.transform=`translate(${x}px,${y}px)`;}
  }
}
function scheduleBombTick(){if(!bombTimer)bombTimer=setTimeout(bombTick,200);}
function bombTick(){
  bombTimer=0;
  if(!campaignMode||!camp||!Camp.hasBomb(camp.run.board)){bombLast=0;renderBombBadges();return;}
  const r=camp.run,now=performance.now(),running=r.status==='playing'&&r.bombClock&&!bombPaused()&&!bombBlast;
  if(running&&bombLast){
    const ex=Camp.tickLevelBombs(r,Math.min(1000,now-bombLast));
    if(ex.length)void explodeBombs(ex);
  }
  bombLast=running?now:0;
  renderBombBadges();
  bombTimer=setTimeout(bombTick,running?200:400);
}
async function explodeBombs(list){
  const turn=generation;bombBlast=true;busy=true;
  try{
    for(const e of list){
      const at=cellPoint(e.at[0],e.at[1]);
      for(const [rr,cc] of e.removed){const t=board[rr]?.[cc];if(t)visual.popTile?.(t.id);}
      toolFx.boom(at,at.size*1.5);
    }
    sound.play('boom');haptics.pulse('big');
    if(!reduceMotion.matches)for(const e of list)for(const [dr,dc] of [[0,2],[0,-2],[2,0],[-2,0]]){const n=board[e.at[0]+dr]?.[e.at[1]+dc];if(n)visual.scheduleWobble?.(n.id,.5,.05);}
    board=camp.run.board.map(row=>row.map(t=>t?{...t}:null));
    renderBoard();renderCampaign();
    showNote(list.length>1?t('bomb.other',{n:list.length}):t('bomb.one'),1800);
    await wait(reduceMotion.matches?150:420);
  }finally{bombBlast=false;if(turn===generation)busy=false;}
  if(turn!==generation)return;
  if(camp?.run.status!=='playing')await finishLevel();
}
addEventListener('resize',()=>{if(bombBadges.size)renderBombBadges();});
function renderQueue() {
  if(queueElement.children.length!==3) {
    queueElement.replaceChildren(...Array.from({length:3},()=> {
      const slot=document.createElement('div');slot.className='preview-tile';return slot;
    }));
  }
  for(let index=0;index<3;index++)visual.hideHud('queue-'+index,index>=queue.length);
  queue.forEach((value,index)=> {
    const slot=queueElement.children[index];visual.setHud('queue-'+index,value,slot);
    slot.setAttribute('aria-label',t(index===0?'hud.queueNext':'hud.queueAfter',{n:value}));
  });
}
function renderBest() {
  mergeEffects.syncScore(score);
  let slot=bestElement.firstElementChild;
  if(!slot){slot=document.createElement('div');slot.className='best-tile';bestElement.append(slot);}
  visual.setHud('best',bestTile,slot);
  bestElement.setAttribute('aria-label',t('hud.bestTileAria',{n:format(bestTile)}));
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
  adPacing.endlessPause();
  sound.pause();
  phoneMotion.reset();
  gameElement.classList.add('is-paused');
  releaseGesture();
  graphics.pause(!duelMode);
  veil.hidden = false;
  pauseButton.textContent = '▶';
  pauseButton.setAttribute('aria-pressed', 'true');
  pauseButton.setAttribute('aria-label', t('hud.resumeAria'));
  dialogTitle.textContent = over ? t('dialog.full') : t('dialog.pause');
  dialogMessage.textContent = over ? t('dialog.fullMsg',{n:format(peak)}) : t('dialog.wait');
  restartButton.textContent=campaignMode?t('dialog.retryLevel'):t('dialog.newGame');
  toMenuButton.hidden=duelMode;
  if(campaignMode&&over)return;
  if(duelMode){dialogTitle.textContent=t('dialog.duelTitle');dialogMessage.textContent=t('dialog.duelMsg');restartButton.textContent=t('dialog.duelLeave');}
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
  pauseButton.setAttribute('aria-label', t('hud.pauseAria'));
  graphics.pause(false);
  pauseButton.focus();
}

async function restart() {
  if(duelMode){void duel.exit();return;}
  if(campaignMode&&camp){void playLevel(camp.n);return;}
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

async function applyMerge(pass,turn,combo,hold=new Set()) {
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
  // launch-17: befreite Squishes (aufgetaut / entkettet) bleiben liegen – nur ihre Hülle geht ab.
  const freedCells=[...(pass.thawed||[]),...(pass.unchained||[])];
  freedNow=new Set(freedCells.map(([r,c])=>board[r][c]?.id).filter(id=>id!=null));
  if(freedCells.length){haptics.pulse('merge');for(const [r,c] of freedCells){const t=board[r][c];if(t&&!reduceMotion.matches)visual.scheduleWobble?.(t.id,.55,.06);}}
  const lead=pass.groups.reduce((a,b)=>b.cells.length>a.cells.length?b:a);
  sound.play(lead.street?'flow':'merge',lead.cells.length,{combo,pan:(lead.target[1]-2)*.13});
  if(!campaignMode)bestTile=Math.max(bestTile,...board.flat().filter(Boolean).map(t=>t.value));
  const rewards=pass.groups.map((group,index)=>({...group,position:location(...group.target),sources:sources[index],combo}));
  mergeEffects.award(rewards,previousScore,score);
  try{renderBoard();}finally{freedNow=new Set();}
  renderBest();mergeEffects.combo(combo);
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
  const more=settlePass(board,new Set(hold));
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
  const hold=new Set();   // launch-17: in diesem Zug befreite Zellen verschmelzen erst im nächsten Zug
  for(let count=0;count<SIZE*SIZE;count++) {
    const pass=settlePass(board,hold);if(!pass.groups.length)break;
    chains++;totalMerges+=pass.groups.length;
    if(streak&&chains===1)updateCombo(true);
    if(pass.groups.some(g=>!g.street&&g.cells.length>=5))hadUpgrade=true;
    if(pass.groups.some(g=>g.street))hadStreet=true;
    await applyMerge(pass,turn,totalMerges,hold);
    if(turn!==generation)return;
  }
  if(streak&&!chains)updateCombo(false);
  if(chains)showNote(hadUpgrade?t('combo.super'):totalMerges>1?t('combo.n',{n:totalMerges}):hadStreet?t('combo.street'):t('combo.merge'),1500);
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
  duelMode=true;pendingSave=null;generation++;busy=true;moveCombo=0;mergeEffects.streak?.(0,{silent:true});
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
  const status=duelFinished?t('duel.statusEnded'):!duelConnected?t('duel.statusLink'):countdown?t('duel.statusStartIn',{n:countdown}):seconds===0?t('duel.statusTally'):data.game.blocked?t('duel.statusFull'):data.opponent?.online?t('duel.statusOn'):t('duel.statusOffline');
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
    track.setAttribute('aria-valuetext',total===0||mine===theirs?t('duel.tied'):`${t('duel.you')} ${myText}, ${t('duel.opp')} ${oppText}`);
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
  dialogTitle.textContent=tie?t('duel.draw'):won?t('duel.win'):t('duel.lose');
  dialogMessage.textContent=(data.reason==='left'?t('duel.reasonLeft'):data.reason==='time'?t('duel.reasonTime'):t('duel.reasonDone'))+t('duel.resultScores',{you:format(data.game.score),foe:format(data.opponent?.score??0)});
  resumeButton.hidden=true;restartButton.textContent=t('dialog.toMenu');restartButton.focus();updateDuelHud();
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
  if(!duel.canMove){showNote(duel.view&&duel.serverNow>=duel.view.endsAt?t('note.timeUp'):duelConnected?t('note.duelMoment'):t('note.duelReconnect'),1200);return;}
  const tile={id:nextId,value:queue[0]};
  const inserted=insertTile(board,direction,line,tile);
  if(!inserted.accepted){
    showNote(isGameOver(board)?t('note.boardFullStay'):t('note.rowFull'));
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
    if(!data){showNote(t('note.duelDropped'),3000);return;}
    if(!data.result?.accepted){
      if(data.result?.reason==='full')showNote(data.game.blocked?t('note.boardFullStay'):t('note.rowFull'));
      else if(data.result?.reason==='changed')showNote(t('note.boardUpdated'));
      if(data.game)reconcileDuelState(data.game);
      return;
    }
    reconcileDuelState(data.game);
  } finally {
    if(turn===generation)busy=false;
    if(data)await receiveDuel(data);
  }
}

async function move(direction, line, {fromHint=false}={}) {
  if(shopUI.isOpen||giftFx.active)return;
  if(busy&&started&&!booting&&!paused&&visual.fusion?.active){
    // A swipe during a merge speeds the gel up and plays right after it.
    pendingMove={direction,line};visual.hurryMerges();return;
  }
  if (!started || booting || busy || paused) return;
  if(campaignMode&&camp){await moveCampaign(direction,line);return;}
  if(duelMode) {
    await moveDuel(direction,line);
    const queued=pendingMove;pendingMove=null;
    if(queued)void move(queued.direction,queued.line).catch(()=>{});
    return;
  }
  const tile = { id: nextId, value: queue[0] };
  const inserted = insertTile(board, direction, line, tile);
  if (!inserted.accepted) {
    showNote(t('note.rowFull'));
    haptics.pulse('tap');
    return;
  }
  const turn=generation;
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
    showNote(t('note.newValues'), 2200);
  }
  if (isGameOver(board)) {showDialog(true);return;}
  if(queued)void move(queued.direction,queued.line).catch(()=>{});
}

function releaseGesture() {
  if(pointerStart?.tileId!=null)graphics.release(pointerStart.tileId);
  pointerStart=null;
}
playfield.addEventListener('pointerdown',event=> {
  if(armedTool&&campaignMode&&started&&!busy&&!paused&&event.isPrimary){
    const id=visual.pick(event);
    if(id!=null){event.preventDefault();if(armedTool==='rocket')void rocketAt(id);return;}
  }
  const merging=busy&&!duelMode&&visual.fusion?.active;
  if(!started||booting||(busy&&!merging)||paused||!event.isPrimary)return;
  ghostFinger.hide();
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
  if(Math.max(Math.abs(dx),Math.abs(dy))<Math.max(24,playfield.clientWidth*.065)){showTutorialFinger();return;}
  if(Math.abs(dx)>Math.abs(dy)*1.15)void move(dx>0?'right':'left',cell.row).catch(()=>{});
  else if(Math.abs(dy)>Math.abs(dx)*1.15)void move(dy>0?'down':'up',cell.col).catch(()=>{});
  else showTutorialFinger();
});
playfield.addEventListener('pointercancel',releaseGesture);
playfield.addEventListener('lostpointercapture',releaseGesture);
window.addEventListener('blur',releaseGesture);

pauseButton.addEventListener('click', () => {
  if (!started || booting || busy || duelFinished || campaignUI.resultOpen || celebrating) return;
  if (paused) resume(); else showDialog(false);
});
resumeButton.addEventListener('click', resume);
restartButton.addEventListener('click', restart);
toMenuButton.addEventListener('click', () => void backToMenu());

document.addEventListener('visibilitychange', () => {
  if (document.hidden && !booting && !duelMode) { saveState(); adPacing.endlessPause(); void flushPending({ keepalive: true }); }
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
window.SquishGame={graphics,move,restart,get state(){return {board,queue,score,best,bestTile,moves,peak,busy,paused,booting,started,hasSavedGame,duelMode,duelRevision};},get effects(){return mergeEffects.stats;},get sound(){return sound.stats;},get menu(){return worldMenu.stats;},get fusion(){return visual.fusion?.stats||null;},
  get campaign(){return {mode:campaignMode,lab:labMode,bombMs:camp?Camp.nextBombMs(camp.run):null,bombClock:!!camp?.run.bombClock,exploded:camp?.run.exploded??0,specials:camp?camp.run.board.flatMap((row,r)=>row.map((t,c)=>t&&Camp.specialOf(t)?{kind:Camp.specialOf(t),r,c,value:t.value,id:t.id}:null)).filter(Boolean):[],bombBadges:[...bombBadges.values()].map(e=>e.textContent),level:camp?.n??null,status:camp?.run.status??null,moves:camp?.run.moves??0,movesLeft:camp?Camp.movesLeft(camp.run):null,
    toolsUsed:camp?.run.toolsUsed.slice()??[],progress:campaignProgress,inventory,sync:progressSync.stats,shopOpen:shopUI.isOpen,shopStats:shopUI.stats,gift:{active:giftFx.active,phase:giftFx.phase,...giftFx.stats},lastPurchase,adOpen:adUI.isOpen,adType:adUI.type,adStats:adUI.stats,lastAd,adFree:isAdFree(),adFreeOffer:canOfferAdFree(),statsOpen:statsUI.isOpen,statsStats:{opens:statsUI.stats.opens,exports:statsUI.stats.exports,resets:statsUI.stats.resets,lastExportMode:statsUI.stats.lastExportMode},toolLog:{attempts:toolLog.attempts.length,events:toolLog.events.length,current:logAttempt?{...logAttempt}:null,summary:ToolLog.summarize(toolLog)},gold:goldNow(),giftsUsed:camp?.run.giftsUsed?.slice()??[],tutorialTool:tutorialToolPending(),explain:{open:explainer.isOpen,topic:explainer.topic,seen:explainer.topics().map(x=>x.topic).filter(x=>explainer.seen(x))},levelsLoaded:!!levels,resultOpen:campaignUI.resultOpen,armedTool,toolFx:toolFx.stats,celebrating,timeline:campaignUI.timeline.slice()};},
  // Screen point of a board cell (for input tests).
  cellPoint(row,col){const host=document.getElementById('graphics').getBoundingClientRect(),loc=location(row,col);return {x:host.left+loc.x/100*host.width,y:host.top+(loc.y+1.5)/100*host.height};}};
// QA only (?vfxdemo=1): stage a board, then swipe with SquishGame.move().
if(new URLSearchParams(globalThis.location.search).has('vfxdemo'))window.SquishVFX={
  setBoard(grid,next=[1,2,3]){
    if(busy)return false;
    board=grid.map(row=>row.map(value=>value&&typeof value==='object'?{id:nextId++,...value}:value?{id:nextId++,value}:null));queue=next.slice(0,3);
    renderBoard();renderQueue();renderBest();return true;
  },
  slow(v=1){mergeEffects.vfx.timeScale=v;},
  confetti(ms=4000,speed=1){return confetti.burst(boardRect(),{burstMs:ms,speed});},
  get fusion(){return visual.fusion.stats;},
  get fusionDebug(){return visual.fusion.debug;},
  bench(...a){return visual.fusion.bench(...a);},
  resetStats(){visual.fusion.resetStats();},
  get stats(){return mergeEffects.stats;},
  // QA: drive the 2D effect layer directly (combo, record, headline).
  get effects(){return mergeEffects;},
  popTile(id){return visual.popTile?.(id);},
};
export const menuActions={
  get canContinue() {return canContinueRun(hasSavedGame,board);},
  prepare() {void fullscreen.enter();sound.unlock();phoneMotion.restoreFromGesture();},
  multiplayer(){return duel.open();},
  world:worldMenu,
  async start(){
    await enterGame();
    if(campaignMode&&camp){
      if(labMode)showNote(levelNote(),5200);
      else if(camp.level.tool)showNote(levelNote(),4200);
      else if(!camp.level.tip)showNote(levelNote(),2600);
      scheduleBombTick();
      await levelExplainers();
      showTutorialFinger(true);
    }
  },
  async select(newGame=false) {
    if (booting || started || busy) return;
    if (newGame && typeof newGame === 'object' && newGame.campaign) {
      if(campaignMode&&!!newGame.lab!==labMode)leaveCampaign();
      labMode=!!newGame.lab;
      await prepareLevel(newGame.campaign);
      return;
    }
    if (campaignMode) leaveCampaign();
    if (newGame) {
      mergeEffects.clear();visual.clear();freshState();renderBest();saveState();
      await prepareEntryScene();
    } else if (needsEntry) {
      mergeEffects.clear();visual.clear();renderBest();
      await prepareEntryScene();
    }
    needsEntry=false;
  },
};
export const ready=start();
// Erster Abgleich nach dem Laden, ohne den Start zu bremsen (nur wenn nötig, siehe progress-sync.mjs).
void ready.then(()=>setTimeout(()=>{if(!duelMode)void progressSync.flush();},2500)).catch(()=>{});
void ready.then(()=>loadLevels()).catch(()=>{});
void ready.catch(()=> {booting=true;showNote(t('boot.graphicsFail'),60000);});
