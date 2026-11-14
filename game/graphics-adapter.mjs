import {createContactSolver} from './dense-contacts.mjs?v=dense-board-1';
import {configureRenderQuality} from './render-quality.mjs?v=foley-5';
import {enqueueRippleImpulse} from './merge-ripple.mjs?v=swarm-fx-3';
import {installPressureWave} from './pressure-wave.mjs?v=soft-gel-1';
import {applyGelSoftness,softWobblePower} from './gel-softness.mjs?v=soft-gel-1';
import {applyDiffuseGelGlow,applyNeonGlassLighting} from './gel-lighting.mjs?v=menu-1';
import {installNeonBands} from './neon-bands.mjs?v=gel-clarity-c-1';
import {createCrispLabelFactory} from './crisp-labels.mjs?v=menu-1';
import {installCleanScreen} from './clean-screen.mjs?v=menu-1';
import {createFusion} from './fusion.mjs?v=fuse-6';
import {flags} from './flags.mjs?v=launch-2';
import {createSquishGraphics,THREE,PARAMETERS} from '../squish/squish-graphics.js?v=play-sharp-1';
import {buildSquishy,createLabel,createGelMaterial,installGelOptics,bindGelOptics,initializeMotion,updateSquishy,PARAMETERS as HUD_PARAMETERS} from './original-gel-models.js?v=menu-1';

// Values 1–8 keep the accepted palette; later values repeat it explicitly.
function ensureColor(value) {
  if(value>8) PARAMETERS.colors[value]=HUD_PARAMETERS.colors[value]=PARAMETERS.colors[(value-1)%8+1];
}
export function createGameGraphics(host) {
  applyNeonGlassLighting(PARAMETERS,HUD_PARAMETERS);
  applyGelSoftness(PARAMETERS,HUD_PARAMETERS);
  PARAMETERS.contactSolver=createContactSolver(PARAMETERS);
  const graphics=createSquishGraphics(host,{tiles:[],bindPointer:false,autoStart:false,alpha:true});
  let dirty=true;
  function requestFrame({shadows=false}={}){
    dirty=true;
    if(shadows){
      if(graphics.quality?.invalidateShadows)graphics.quality.invalidateShadows();
      else graphics.renderer.shadowMap.needsUpdate=true;
    }
  }
  const labelFactory=createCrispLabelFactory({anisotropy:graphics.renderer.capabilities.getMaxAnisotropy()});
  PARAMETERS.labelFactory=HUD_PARAMETERS.labelFactory=labelFactory;
  const originalWobble=graphics.wobble.bind(graphics);
  graphics.wobble=(id,power=.25)=>{requestFrame();return originalWobble(id,softWobblePower(power));};
  configureRenderQuality(graphics);
  const canvas=graphics.renderer.domElement;
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();contextLost=true;dirty=false;
    console.warn('webgl context lost');
    canvas.dispatchEvent(new CustomEvent('squish-contextlost',{bubbles:true}));
  });
  canvas.addEventListener('webglcontextrestored',()=>{
    contextLost=false;last=null;
    try{
      configureRenderQuality(graphics);
      graphics.renderer.shadowMap.needsUpdate=true;
      graphics.render(0);requestFrame({shadows:true});
    }catch(error){console.warn('webgl restore failed',error);}
  });
  const setSize=graphics.renderer.setSize.bind(graphics.renderer);
  graphics.renderer.setSize=(...args)=>{setSize(...args);requestFrame({shadows:true});};
  const setting=installCleanScreen(graphics,host);
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),floor=new THREE.Plane(new THREE.Vector3(0,1,0),-PARAMETERS.board.floor);
  const characters=new WeakMap(),impulses=[],phoneImpulses=[],mergeJobs=[],dropJobs=[],waitJobs=[];
  const hud=new Map(),extras=new Set(),extraJobs=[];let last=null,raf=0,disposed=false,hudDirty=true,warming=false,fusion=null,contextLost=false,I_onLand=null;
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const resetClock=()=>{last=null;requestFrame({shadows:true});};
  document.addEventListener('visibilitychange',resetClock);
  function screenRay(x,y) {
    const r=graphics.renderer.domElement.getBoundingClientRect();
    pointer.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);ray.setFromCamera(pointer,graphics.camera);
  }
  function project(x,y) {screenRay(x,y);return ray.ray.intersectPlane(floor,new THREE.Vector3());}
  function pick(event) {
    screenRay(event.clientX,event.clientY);
    const hit=setting.withBoardPositions(()=>ray.intersectObjects(graphics.tiles.map(s=>s.body),false)[0]);
    return hit?graphics.tiles.find(s=>s.body===hit.object).id:null;
  }
  function localPoint(event,id) {
    const p=project(event.clientX,event.clientY);return p?graphics.getTile(id).group.worldToLocal(p):null;
  }
  function location(row,col) {
    const [x,y]=setting.wells[row][col];
    return {x:x*100,y:y*100-1.5,size:Math.abs(setting.wells[row][1][0]-setting.wells[row][0][0])*95};
  }
  function gestureCell(event) {
    const rect=host.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width,
      y=(event.clientY-rect.top)/rect.height;
    let nearest={row:2,col:2},distance=Infinity;
    setting.wells.forEach((line,row)=>line.forEach(([px,py],col)=>{
      const d=(x-px)**2+(y-py)**2;if(d<distance){distance=d;nearest={row,col};}
    }));return nearest;
  }
  function disposeGel(s) {s.group.traverse(o=>{o.geometry?.dispose();for(const m of [].concat(o.material||[]))if(m!==graphics.board.children[0].material)m.dispose();o.customDepthMaterial?.dispose();});graphics.scene.remove(s.group);}
  function createHudMaterial(value,stretch=0) {
    const optics=installGelOptics(createGelMaterial(value));
    if(stretch>0) {
      // A wide body is the original cushion with a straight extruded middle.
      // Collapse that middle in the optics boundary so the ray-marched gel
      // depth, focus lobes and neon lip match the lengthened mesh exactly.
      const base=optics.onBeforeCompile,key=optics.customProgramCacheKey.bind(optics),tag=stretch.toFixed(4);
      optics.onBeforeCompile=function(shader,renderer){
        base.call(this,shader,renderer);
        shader.fragmentShader=shader.fragmentShader.replace('vec3 gelRest(vec3 p){',
          'vec3 gelRest(vec3 p){p.x=sign(p.x)*max(abs(p.x)-'+tag+',0.0);');
      };
      optics.customProgramCacheKey=()=>key()+'|wide-'+tag;
    }
    const material=installNeonBands(applyDiffuseGelGlow(optics),value);
    material.envMap=graphics.scene.environment;
    material.envMapIntensity=PARAMETERS.gel.envMapIntensity;
    return material;
  }
  function setHud(key,value,element) {
    ensureColor(value);let entry=hud.get(key);
    if(!entry) {
      const material=createHudMaterial(value);
      const s=buildSquishy(value,material);initializeMotion(s);bindGelOptics(s);s.group.name='HUD_'+key;
      // Preserve the soft contact shadow under the original HUD squishy.
      setting.addHudShadow(s);
      graphics.scene.add(s.group);entry={s,element};hud.set(key,entry);
    } else if(entry.s.value!==value) {
      const s=entry.s;s.value=value;s.body.material.dispose();s.body.material=createHudMaterial(value);
      s.group.remove(s.label);s.label.geometry.dispose();s.label.material.dispose();s.label=createLabel(value);s.group.add(s.label);
    }
    entry.element=element;element.setAttribute('aria-label',String(value));hudDirty=true;requestFrame({shadows:true});
  }
  function placeHud() {
    graphics.camera.updateMatrixWorld();
    for(const [key,{s,element}] of hud) {
      const r=element.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height*(key==='best'?.42:.58);
      const center=project(cx,cy),left=project(cx-r.width*.46,cy),right=project(cx+r.width*.46,cy);
      if(!center||!left||!right)continue;
      const scale=left.distanceTo(right)/PARAMETERS.gel.width;
      s.group.scale.setScalar(scale);
      s.group.position.copy(center);
    }
    hudDirty=false;
  }
  const resize=new ResizeObserver(()=>{hudDirty=true;requestFrame({shadows:true});});resize.observe(host);
  let entryWarmed=false;
  async function prepareEntry() {
    const bodies=[...graphics.tiles,...[...hud].filter(([key])=>key.startsWith('queue-')).map(([,entry])=>entry.s)];
    if(hudDirty)placeHud();
    // A second compile after "Neues Spiel" rebuilt the stones and re-uploaded
    // fusion programs. On iPhone that could hang or lose the WebGL context
    // just as the drop-in finished; the programs are already linked.
    if(entryWarmed){
      for(const tile of bodies){tile.group.visible=false;tile.group.userData.entryProgress=0;}
      graphics.pause(true);last=null;graphics.render(0);
      return;
    }
    warming=true;
    try {
      for(const tile of bodies){tile.group.visible=true;delete tile.group.userData.entryProgress;}
      if(!flags.noprewarm)fusion?.warm(true);
      // Compile behind the menu, then present only the empty table until play.
      // One warm render also uploads labels, geometry, shadows and textures.
      // On phones, skip compileAsync: it can hang, and programs link on first use.
      if(!flags.noprewarm){
        const compile=typeof graphics.renderer.compileAsync==='function'
          ?graphics.renderer.compileAsync(graphics.scene,graphics.camera)
          :Promise.resolve(graphics.renderer.compile(graphics.scene,graphics.camera));
        await Promise.race([compile,new Promise(resolve=>setTimeout(resolve,2500))]);
      }else{
        try{graphics.renderer.compile(graphics.scene,graphics.camera);}catch{}
      }
      graphics.render(0);
      entryWarmed=true;
    } finally {
      fusion?.warm(false);
      for(const tile of bodies){tile.group.visible=false;tile.group.userData.entryProgress=0;}
      graphics.pause(true);last=null;warming=false;graphics.render(0);
    }
  }
  function mergeIn(groups,reducedMotion=false,options={}) {
    if(reducedMotion)return Promise.resolve();
    // Merge groups that carry their cells melt into one gel body and pop.
    if(!flags.nofusion&&fusion&&groups.every(g=>g.cells?.length))return fusion.play(groups,options);
    let start=null;
    const participants=groups.flatMap(({ids,resultId})=>ids.map(id=> {
      const tile=graphics.getTile(id),p=tile.press;
      const spring={compression:p.compression,velocity:p.velocity,swipeVX:p.swipeVX,swipeVZ:p.swipeVZ};
      graphics.press(id);
      // Continue the current spring pose instead of resetting compression and
      // momentum between the slide's release and the merge's short press.
      Object.assign(tile.press,spring);
      return {tile,departing:id!==resultId};
    }));
    return new Promise(resolve=> {
      mergeJobs.push({update(time){
        // Present anticipation once, even after a delayed frame. Collapse,
        // pressure and slide now share the SDK's bounded animation clock.
        if(start===null)start=time;
        const elapsed=Math.max(0,time-start);
        graphics.scene.userData.mergeAnimation={phase:elapsed<.018?'anticipation':'flups',elapsed};
        // Fast collapse at the original feet; stable roots prevent false
        // full-size collisions between the disappearing gel bodies.
        const p=Math.min(1,Math.max(0,(elapsed-.018)/.036)),snap=p*p*p;
        for(const {tile,departing} of participants)if(departing)tile.group.scale.setScalar(1-.94*snap);
        if(p===1){graphics.scene.userData.mergeAnimation={phase:'impact',elapsed};resolve();return true;}
        return false;
      },cancel(){
        for(const {tile} of participants){tile.group.scale.setScalar(1);graphics.release(tile.id);}
        resolve();
      }});
    });
  }
  function personalize(s,time,dt) {
    let character=characters.get(s);
    if(!character) {
      const seed=String(s.id??s.group.name).split('').reduce((v,c)=>(v*31+c.charCodeAt(0))>>>0,7);
      const noise=salt=>{const n=Math.sin(seed*12.9898+salt*78.233)*43758.5453;return n-Math.floor(n);};
      character={phase:s.phase,pace:.86+noise(1)*.29,decay:.82+noise(2)*.44};
      characters.set(s,character);s.group.userData.wobbleCharacter={pace:character.pace,decay:character.decay};
    }
    // Per-body free oscillation, around the accepted overall tempo. The SDK
    // still solves press/swipe/contact springs and deforms every original mesh.
    s.phase=character.phase+time*13*PARAMETERS.motion.wobbleSpeed*(character.pace-1);
    s.amplitude*=Math.exp(-dt*2.5*PARAMETERS.motion.wobbleSpeed*(character.decay-1));
  }
  function dropIn(reducedMotion=false,options={}) {
    const bodies=[...graphics.tiles,...[...hud].filter(([key])=>key.startsWith('queue-')).map(([,entry])=>entry.s)];
    if(reducedMotion||!bodies.length)return Promise.resolve();
    if(hudDirty)placeHud();
    const start=graphics.state.time;
    // Interleave the three previews among board stones. Each launch is clearly
    // separated; cap only very dense saved boards to avoid a long forced wait.
    const previews=bodies.filter(s=>s.id===undefined),ordered=[];
    graphics.tiles.forEach((s,index)=>{ordered.push(s);if(index%3===1&&previews.length)ordered.push(previews.shift());});
    ordered.push(...previews);
    const spacing=ordered.length>16?.065:.10;
    const entries=ordered.map((tile,index)=>{
      const variation=(index*17%31)/31;
      tile.group.visible=false;tile.group.userData.entryProgress=0;tile.amplitude=0;
      return {tile,delay:index*spacing,duration:.44+variation*.08,landed:false};
    });
    const end=Math.max(...entries.map(e=>e.delay+e.duration))+.10;
    return new Promise(resolve=>{
      const finish=()=>{
        for(const {tile} of entries){tile.group.visible=true;delete tile.group.userData.entryProgress;}
        delete graphics.scene.userData.entryAnimation;resolve();
      };
      dropJobs.push({cancel:finish,update(time){
        const elapsed=time-start;
        graphics.scene.userData.entryAnimation={elapsed,landed:entries.filter(e=>e.landed).length,total:entries.length};
        for(const entry of entries){
          const {tile,delay,duration}=entry,p=Math.max(0,Math.min(1,(elapsed-delay)/duration));
          tile.group.visible=elapsed>=delay;tile.group.userData.entryProgress=p;
          if(p===1&&!entry.landed){
            entry.landed=true;
            // Kick the existing anchored spring on impact; the foot stays in
            // its well while the inflated body compresses and springs back.
            tile.press.compression=.17;tile.press.velocity=2.5;
            const power=.32+(duration-.44)*.5;
            if(tile.id!==undefined)graphics.wobble(tile.id,power);else tile.amplitude=softWobblePower(power);
            const pan=Math.max(-.3,Math.min(.3,(tile.group?.position?.x||0)/10));
            (options.onLand||I_onLand)?.({kind:'drop',tile,pan,queue:tile.id===undefined});
          }
        }
        if(elapsed<end)return false;finish();return true;
      }});
    });
  }
  function loop(now) {
    if(disposed)return;raf=requestAnimationFrame(loop);
    try{
    if(contextLost)return;
    const wall=last===null?0:(now-last)/1000;last=now;
    if(document.hidden)return;
    if(warming)return;
    setting.update();
    const dt=Math.min(PARAMETERS.motion.maximumFrameDelta,Math.max(0,wall));
    if(hudDirty)placeHud();
    const frameState=graphics.state;
    if(!frameState.paused){
      const time=frameState.time+dt,live=new Set(graphics.tiles);
      for(let i=dropJobs.length-1;i>=0;i--)if(dropJobs[i].update(time))dropJobs.splice(i,1);
      for(let i=mergeJobs.length-1;i>=0;i--)if(mergeJobs[i].update(time))mergeJobs.splice(i,1);
      for(let i=extraJobs.length-1;i>=0;i--)if(extraJobs[i].update(time,dt))extraJobs.splice(i,1);
      for(let i=impulses.length-1;i>=0;i--) {
        const impulse=impulses[i];
        if(!live.has(impulse.tile)){impulses.splice(i,1);continue;}

      }
      impulses.sort((a,b)=>a.time-b.time);
      // Slow frames must not collapse a whole ripple into one simultaneous kick.
      for(let count=0;count<2&&impulses[0]?.time<=time;count++) {
        const impulse=impulses.shift();graphics.wobble(impulse.tile.id,impulse.power);
      }
      for(let count=0;count<3&&phoneImpulses[0]?.time<=time;count++) {
        const {tile,power}=phoneImpulses.shift();
        if(live.has(tile))graphics.wobble(tile.id,power);
        else if([...hud.values()].some(entry=>entry.s===tile))tile.amplitude=Math.max(tile.amplitude,softWobblePower(power));
      }
      for(const s of live)personalize(s,time,dt);
      const sliding=[...live].some(s=>s.motion||s.press.held||s.press.releaseQueued);
      const active=dropJobs.length||mergeJobs.length||extraJobs.length||impulses.length||phoneImpulses.length||waitJobs.length||sliding||[...live].some(s=>s.amplitude>.045);
      graphics.quality.update(wall,now/1000,!active);
      if(sliding)requestFrame({shadows:true});
      else if(active)dirty=true;
      for(const {s} of hud.values())if(s.group.visible||s.group.userData.entryProgress!==undefined){
        const hudLive=s.amplitude>.045||s.press?.held||s.group.userData.entryProgress!==undefined;
        if(hudLive||active){personalize(s,time,dt);updateSquishy(s,time,dt,!reducedMotion.matches);dirty=true;}
      }
      // In-world menu bodies (wide buttons, code digits, keypad) share the
      // same gel spring; idle ones stop updating once their wobble settles.
      for(const s of extras){
        const p=s.press,live=s.amplitude>.045||p.held||p.releaseQueued||p.compression!==0||p.velocity!==0||p.swipeX!==0||s.group.userData.entryProgress!==undefined;
        if(live||active||s.forceUpdate){s.forceUpdate=false;personalize(s,time,dt);updateSquishy(s,time,dt,!reducedMotion.matches);dirty=true;}
      }
    }
    // Idle tables keep the last frame. Redraw only when a tile moves, a
    // spring is live, the HUD shifts, or something else dirtied the view.
    if(dirty){graphics.render(dt);dirty=false;}
    const settledTime=waitJobs.length&&!frameState.paused?graphics.state.time:0;
    if(!frameState.paused)for(let i=waitJobs.length-1;i>=0;i--)if(settledTime>=waitJobs[i].until){
      waitJobs.splice(i,1)[0].resolve();
    }
    }catch(error){console.warn('render loop',error);dirty=true;}
  }
  raf=requestAnimationFrame(loop);
  const internals={THREE,PARAMETERS,HUD_PARAMETERS,setting,project,screenRay,ray,requestFrame,ensureColor,
    get onLand(){return I_onLand;},
    createHudMaterial,buildSquishy,createLabel,initializeMotion,bindGelOptics,disposeGel,softWobblePower,
    get paused(){return graphics.state.paused;},get time(){return graphics.state.time;},
    addBody(s){extras.add(s);s.forceUpdate=true;graphics.scene.add(s.group);requestFrame({shadows:true});},
    removeBody(s){extras.delete(s);disposeGel(s);requestFrame({shadows:true});},
    job(job){extraJobs.push(job);requestFrame();return job;},
    cancelJobs(){extraJobs.splice(0).forEach(job=>job.cancel?.());},
    async compile(bodies){
      for(const s of bodies)s.group.visible=true;
      try{
        if(typeof graphics.renderer.compileAsync==='function')await graphics.renderer.compileAsync(graphics.scene,graphics.camera);
        else graphics.renderer.compile(graphics.scene,graphics.camera);
      }finally{for(const s of bodies)s.group.visible=false;}
    }};
  fusion=createFusion({internals,graphics});
  const ready=Promise.all([graphics.ready,setting.ready]);
  return {graphics,internals,fusion,ready,location,pick,localPoint,gestureCell,setHud,prepareEntry,mergeIn,dropIn,
    wait(seconds){return new Promise(resolve=>waitJobs.push({until:graphics.state.time+seconds,resolve}));},
    sync(tiles,options){
      tiles.forEach(t=>ensureColor(t.value));graphics.syncTiles(tiles,options);
      requestFrame({shadows:true});
      for(const tile of graphics.tiles)installNeonBands(applyDiffuseGelGlow(tile.body.material),tile.value);
      const pressure=options?.animate&&options.incoming
        ?installPressureWave(graphics.tiles,options.incoming,graphics.state.time,options.onPop):0;
      if(options?.animate&&!pressure)for(const tile of graphics.tiles)if(tile.motion)graphics.wobble(tile.id,.25);
    },
    hideHud(key,hidden){const entry=hud.get(key);if(entry){entry.s.group.visible=!hidden;requestFrame({shadows:true});}},
    celebrateHud(key,power=.58){
      const entry=hud.get(key);if(!entry||reducedMotion.matches)return;
      // Reuse the accepted gel spring; do not scale or replace its geometry.
      power=softWobblePower(Math.max(0,Math.min(.72,power)));
      entry.s.amplitude=Math.max(entry.s.amplitude,power);
      entry.s.press.compression=Math.max(entry.s.press.compression,.10*power/.58);entry.s.press.velocity=Math.max(entry.s.press.velocity,1.3*power/.58);
      requestFrame();
    },
    scheduleWobble(id,power,delay){enqueueRippleImpulse(impulses,{tile:graphics.getTile(id),power,time:graphics.state.time+delay});},
    phoneWobble(power){
      for(const tile of [...graphics.tiles,...[...hud.values()].map(entry=>entry.s)]) {
        const seed=String(tile.id??tile.group.name).split('').reduce((v,c)=>(v*31+c.charCodeAt(0))>>>0,7);
        const strength=Math.min(.18,power)*(.66+(seed%29)/85),pending=phoneImpulses.find(impulse=>impulse.tile===tile);
        // Keep waiting bodies in the queue during repeated motion on slow
        // phones. Coalescing also bounds the work to one pending kick per body.
        if(pending)pending.power=Math.max(pending.power,strength);
        else phoneImpulses.push({tile,power:strength,time:graphics.state.time+(seed%23)*.005});
      }
      phoneImpulses.sort((a,b)=>a.time-b.time);
    },
    clearPhoneWobble(){phoneImpulses.length=0;},
    hurryMerges(){fusion?.hurry();},
    set onLand(fn){I_onLand=fn;if(fusion){/* land hook lives on internals */}},
    get contextLost(){return contextLost;},
    clear(){fusion?.clear();impulses.length=0;phoneImpulses.length=0;dropJobs.splice(0).forEach(job=>job.cancel());mergeJobs.splice(0).forEach(job=>job.cancel());waitJobs.splice(0).forEach(job=>job.resolve());graphics.syncTiles([]);requestFrame({shadows:true});},
    dispose(){disposed=true;fusion?.clear();impulses.length=0;phoneImpulses.length=0;dropJobs.splice(0).forEach(job=>job.cancel());mergeJobs.splice(0).forEach(job=>job.cancel());waitJobs.splice(0).forEach(job=>job.resolve());cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',resetClock);resize.disconnect();setting.dispose();for(const {s} of hud.values())disposeGel(s);hud.clear();graphics.dispose();}
  };
}
