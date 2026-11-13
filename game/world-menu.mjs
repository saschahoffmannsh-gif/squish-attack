import {getLabelShapes,pillowTopHeight} from './original-gel-models.js?v=menu-1';
import {BUILD} from './flags.mjs?v=speed-2';

// In-world start menu: wide gel cushions (the original squish body with a
// lengthened straight middle) drop onto the glass, one per grid row, and burst
// like a merge when pressed. Settings and the duel lobby reuse the same bodies.
const HEX=['#00b5ff','#f31954','#00dc45','#ff850c','#9239ff','#ffc829','#f44ebd','#20d8ce'];
const C={blue:1,red:2,green:3,orange:4,violet:5,yellow:6,pink:7,turquoise:8};
const digitColor=d=>d===0?8:(d-1)%8+1;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
// One calm line under the logo for the lobby's longer status texts.
const SHORT={'Warte auf den zweiten Spieler … Code 10 Minuten gültig.':'Code teilen · Warte auf Mitspieler (10 Min. gültig)',
  'Verbunden! Beide Spielfelder werden vorbereitet …':'Verbunden! Das Duell beginnt …'};

export function createWorldMenu({visual,effects,sound,page=document,reduceMotion,hooks}) {
  const I=visual.internals,{THREE,PARAMETERS:P,setting}=I,camera=visual.graphics.camera;
  const pitch=P.board.pitch,gelW=P.gel.width;
  // Outer ends meet the outer wells' edges once the board footprint scale applies.
  const EXT=2*pitch/1.02,STRETCH=(gelW+2*EXT)/gelW,MAXW=2*EXT*.96;
  const BOARD=new THREE.Vector3(1.02,1.02/.92,1.02);
  const keypadElement=page.getElementById('world-keypad'),caption=page.getElementById('world-caption');
  const a11y=page.getElementById('world-menu'),live=page.getElementById('world-live');
  const textures=new Map(),items=new Set();
  let serial=0,active=false,screen=null,busy=false,pressed=null,multi=null,captionTimer=0,warm=null;

  // ---------- labels in the numerals' own typeface ----------
  function coverage(text) {
    let entry=textures.get(text);if(entry)return entry;
    const shapes=getLabelShapes(text),contours=shapes.map(shape=>({outline:shape.getPoints(24),holes:shape.holes.map(h=>h.getPoints(24))}));
    const points=contours.flatMap(s=>s.outline),pad=.035;
    const minX=Math.min(...points.map(p=>p.x))-pad,maxX=Math.max(...points.map(p=>p.x))+pad;
    const minY=Math.min(...points.map(p=>p.y))-pad,maxY=Math.max(...points.map(p=>p.y))+pad;
    const width=maxX-minX,height=maxY-minY,res=Math.min(512/height,2048/width);
    const canvas=page.createElement('canvas');canvas.width=Math.ceil(width*res);canvas.height=Math.ceil(height*res);
    const ctx=canvas.getContext('2d');
    ctx.imageSmoothingEnabled=true;if('imageSmoothingQuality' in ctx)ctx.imageSmoothingQuality='high';
    ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.setTransform(canvas.width/width,0,0,-canvas.height/height,-minX*canvas.width/width,maxY*canvas.height/height);
    ctx.fillStyle='#fff';ctx.beginPath();
    for(const contour of contours)for(const path of [contour.outline,...contour.holes]){
      ctx.moveTo(path[0].x,path[0].y);for(let i=1;i<path.length;i++)ctx.lineTo(path[i].x,path[i].y);ctx.closePath();
    }
    ctx.fill('evenodd');
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.NoColorSpace;
    texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=true;
    texture.anisotropy=Math.max(8,visual.graphics.renderer.capabilities.getMaxAnisotropy());
    entry={texture,width,height,minY,refs:0};textures.set(text,entry);return entry;
  }
  function textLabel(text,dim=false) {
    const entry=coverage(text),fit=Math.min(1,MAXW/entry.width),w=entry.width*fit,h=entry.height*fit;
    entry.refs++;
    const geometry=new THREE.PlaneGeometry(w,h,Math.ceil(w/.065),Math.ceil(h/.065)),position=geometry.attributes.position;
    for(let i=0;i<position.count;i++){
      const x=position.getX(i),glyphY=position.getY(i)+h/2+entry.minY*fit,z=.29+.25*fit-glyphY;
      // The straight middle shares the centre cross-section of the cushion top.
      const xc=Math.sign(x)*Math.max(0,Math.abs(x)-EXT);
      position.setXYZ(i,x,pillowTopHeight(xc,z)+.018,z);
    }
    geometry.computeVertexNormals();geometry.computeBoundingSphere();
    const material=new THREE.MeshBasicMaterial({color:dim?0xa9b1b8:0xfff7df,alphaMap:entry.texture,transparent:true,opacity:dim?.62:1,depthWrite:false,
      polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    let gone=false;
    material.addEventListener('dispose',()=>{if(gone)return;gone=true;if(--entry.refs===0){entry.texture.dispose();textures.delete(text);}});
    const mesh=new THREE.Mesh(geometry,material);mesh.name='Editable_number';mesh.castShadow=false;
    mesh.userData.rest=position.array.slice();mesh.userData.labelCoverage=true;
    return mesh;
  }

  // ---------- bodies ----------
  function shadowProxy(s,stretch) {
    const matrix=new THREE.Matrix4(),scale=new THREE.Vector3(),ground=new THREE.Vector3(),factor=new THREE.Vector3(stretch,1,1);
    const groundFactor=new THREE.Vector3((gelW*stretch+.84)/2.7,1,1),spillFactor=new THREE.Vector3((gelW*stretch+.99)/2.85,1,1),spill=new THREE.Matrix4();
    return {get value(){return s.value;},get deformation(){return s.deformation;},group:{
      get visible(){return s.group.visible;},get userData(){return s.group.userData;},
      get scale(){return scale.copy(s.group.scale).multiply(factor);},
      // The ground glow keeps its original margin around the long footprint.
      get groundScale(){return ground.copy(s.group.scale).multiply(groundFactor);},
      get matrixWorld(){return matrix.compose(s.group.position,s.group.quaternion,this.scale);},
      get spillMatrix(){return spill.compose(s.group.position,s.group.quaternion,ground.copy(s.group.scale).multiply(spillFactor));},
    }};
  }
  function wideBody(value,text,dim) {
    I.ensureColor(value);
    const material=I.createHudMaterial(value,EXT);
    if(dim){material.attenuationColor.lerp(new THREE.Color(.62,.65,.68),.72);material.userData.optics?.uGelReflectionTint?.value.lerp(new THREE.Color(.8,.82,.84),.7);}
    const s=I.buildSquishy(value,material),geometry=s.body.geometry,position=geometry.attributes.position;
    for(let i=0;i<position.count;i++){const x=position.getX(i);if(Math.abs(x)>1e-6)position.setX(i,x+Math.sign(x)*EXT);}
    position.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();
    s.group.remove(s.label);s.label.geometry.dispose();s.label.material.dispose();
    s.label=textLabel(text,dim);s.group.add(s.label);
    // Keep the air cavities spread along the long body instead of one cluster.
    s.bubbles.children.forEach((bubble,i)=>{const c=bubble.userData.cavity;bubble.position.x=c[0]=c[0]+(i%3-1)*EXT*.62;});
    I.initializeMotion(s);I.bindGelOptics(s);
    return s;
  }
  function digitBody(digit) {
    const value=digitColor(digit);I.ensureColor(value);
    const s=I.buildSquishy(digit,I.createHudMaterial(value));s.value=value;
    I.initializeMotion(s);I.bindGelOptics(s);return s;
  }
  function add(kind,{row=0,x=0,z,value,text,digit,action,dim=false,label,explodes=false}) {
    const s=kind==='wide'?wideBody(value,text,dim):digitBody(digit);
    s.group.name=`HUD_menu_${serial++}`;s.group.visible=false;
    const it={kind,s,row,value:kind==='wide'?value:s.value,text,digit,action,dim,explodes,interactive:false,landed:false,bursting:false,
      base:BOARD.clone(),proxy:kind==='wide'?shadowProxy(s,STRETCH):s,label:label||text||String(digit)};
    s.group.position.set(x,P.board.floor,z??(row-2)*pitch);s.group.scale.copy(it.base);
    I.addBody(s);setting.addHudShadow(it.proxy);items.add(it);
    if(action){
      const button=page.createElement('button');button.type='button';button.textContent=it.label;
      button.addEventListener('click',()=>{if(!busy||it.kind!=='wide')activate(it);});
      button.addEventListener('focus',()=>{if(items.has(it)&&it.landed)kick(it,.22);});
      it.button=button;a11y.append(button);
    }
    return it;
  }
  function remove(it) {
    if(!items.delete(it))return;
    setting.removeHudShadow(it.proxy);I.removeBody(it.s);it.button?.remove();
    if(pressed?.it===it)pressed=null;
  }
  function relabel(it,text) {
    const s=it.s;s.group.remove(s.label);s.label.geometry.dispose();s.label.material.dispose();
    s.label=textLabel(text,it.dim);s.group.add(s.label);s.forceUpdate=true;it.text=text;
    if(it.button)it.button.textContent=text;
    kick(it,.42);
  }
  function kick(it,power=.4) {
    const s=it.s;s.amplitude=Math.max(s.amplitude,I.softWobblePower(power));
    s.press.compression=Math.max(s.press.compression,.10);s.press.velocity=Math.max(s.press.velocity,1.4);I.requestFrame();
  }

  // ---------- motion ----------
  function drop(list,{spacing=.14}={}) {
    if(!list.length)return Promise.resolve();
    if(reduceMotion.matches){
      for(const it of list){
        it.s.group.visible=true;delete it.s.group.userData.entryProgress;it.landed=true;it.interactive=!!it.action;it.s.forceUpdate=true;
        sound.play('land',it.kind==='wide'?3:2,{pan:clamp(it.s.group.position.x/10,-.3,.3)});
      }
      I.requestFrame({shadows:true});return Promise.resolve();
    }
    const start=I.time,entries=list.map((it,index)=>{
      it.s.group.visible=false;it.s.group.userData.entryProgress=0;it.s.amplitude=0;
      return {it,delay:index*spacing,duration:.62+((index*17)%31)/31*.1,landed:false};
    });
    const end=Math.max(...entries.map(e=>e.delay+e.duration))+.05;
    return new Promise(resolve=>I.job({update(time){
      const elapsed=time-start;
      for(const entry of entries){
        const {it,delay,duration}=entry;if(!items.has(it)){entry.landed=true;continue;}
        const p=clamp((elapsed-delay)/duration);
        it.s.group.visible=elapsed>=delay;
        if(!entry.landed)it.s.group.userData.entryProgress=p;
        if(p===1&&!entry.landed){
          entry.landed=true;it.landed=true;it.interactive=!!it.action;delete it.s.group.userData.entryProgress;
          const s=it.s;s.press.compression=.17;s.press.velocity=2.5;s.amplitude=I.softWobblePower(it.kind==='wide'?.40:.32);
          sound.play('land',it.kind==='wide'?3:2,{pan:clamp(s.group.position.x/10,-.3,.3)});
          I.requestFrame({shadows:true});
        }
      }
      if(elapsed<end)return false;resolve();return true;
    },cancel(){for(const {it} of entries){it.s.group.visible=true;delete it.s.group.userData.entryProgress;it.landed=true;it.interactive=!!it.action;}resolve();}}));
  }
  function screenPoint(x,z) {
    const v=new THREE.Vector3(x,P.board.floor,z).project(camera);
    return {x:(v.x+1)/2*100,y:(1-v.y)/2*100-1.5};
  }
  function burstPoints(it) {
    const size=visual.location(Math.min(4,Math.max(0,it.row)),2).size*it.s.group.scale.x/1.02;
    const {x,z}=it.s.group.position;
    const xs=it.kind==='wide'?[-1.62*pitch,0,1.62*pitch]:[0];
    return xs.map(dx=>({...screenPoint(x+dx,z),size}));
  }
  function burst(it,{primary=false}={}) {
    if(it.bursting)return it.bursting;
    it.interactive=false;it.button?.remove();
    if(reduceMotion.matches){remove(it);return it.bursting=Promise.resolve();}
    const start=I.time,s=it.s;let fired=false;
    s.press.held=false;s.press.releaseQueued=false;
    return it.bursting=new Promise(resolve=>I.job({update(time){
      if(!items.has(it)){resolve();return true;}
      const t=time-start;
      if(t<.075){s.press.compression=Math.max(s.press.compression,.24*t/.075);s.press.velocity=0;}
      if(t>=.075&&!fired){
        fired=true;visual.fusion?.popBody(s,{value:it.value,power:it.kind==='wide'?(primary?5:3.5):2,amount:it.kind==='wide'?1:.6});
        sound.play('land',it.kind==='wide'?(primary?4:3):2,{pan:clamp(s.group.position.x/10,-.3,.3)});
      }
      const p=clamp((t-.075)/.06),snap=p*p*p,k=1-.94*snap;
      s.group.scale.set(it.base.x*k,it.base.y*k,it.base.z*k);
      if(p<1)return false;
      remove(it);resolve();return true;
    },cancel(){remove(it);resolve();}}));
  }
  // The pressed body bursts first, then the rest one after another.
  async function burstAll(first,list=[...items]) {
    const rest=list.filter(it=>it!==first&&!it.bursting).sort((a,b)=>
      (first?Math.abs(a.row-first.row)-Math.abs(b.row-first.row):0)||a.row-b.row||a.s.group.position.x-b.s.group.position.x);
    const order=first?[first,...rest]:rest,jobs=[];
    for(let i=0;i<order.length;i++){
      jobs.push(burst(order[i],{primary:order[i]===first}));
      if(i<order.length-1&&!reduceMotion.matches)await visual.wait(order[i].kind==='wide'?.13:.07);
    }
    await Promise.all(jobs);
  }

  // ---------- input ----------
  function pickKey(clientX,clientY) {
    if(!multi?.keys?.length||!keypadElement?.classList.contains('is-active'))return null;
    const slots=[...keypadElement.children];
    for(let i=0;i<multi.keys.length;i++){
      const it=multi.keys[i],r=slots[i]?.getBoundingClientRect();
      if(!it?.interactive||!r?.width)continue;
      if(clientX>=r.left-12&&clientX<=r.right+12&&clientY>=r.top-12&&clientY<=r.bottom+12)return it;
    }
    return null;
  }
  function pick(clientX,clientY) {
    const byKey=pickKey(clientX,clientY);if(byKey)return byKey;
    const candidates=[...items].filter(it=>it.interactive);
    if(!candidates.length)return null;
    I.screenRay(clientX,clientY);
    const hit=I.ray.intersectObjects(candidates.map(it=>it.s.body),false)[0];
    if(hit)return candidates.find(it=>it.s.body===hit.object);
    // Generous fallback: the projected footprint of each body on screen.
    const rect=visual.graphics.renderer.domElement.getBoundingClientRect(),box=new THREE.Box3(),v=new THREE.Vector3();
    let best=null,distance=Infinity;
    for(const it of candidates){
      box.setFromObject(it.s.body);let l=Infinity,r=-Infinity,t=Infinity,b=-Infinity;
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
        v.set(x,y,z).project(camera);const sx=rect.left+(v.x+1)/2*rect.width,sy=rect.top+(1-v.y)/2*rect.height;
        l=Math.min(l,sx);r=Math.max(r,sx);t=Math.min(t,sy);b=Math.max(b,sy);
      }
      const inside=clientX>=l-8&&clientX<=r+8&&clientY>=t-8&&clientY<=b+8;
      const d=Math.hypot(clientX-(l+r)/2,clientY-(t+b)/2);
      if(inside&&d<distance){distance=d;best=it;}
    }
    return best;
  }
  function down(event) {
    if(!active||!event.isPrimary||(event.pointerType==='mouse'&&event.button!==0))return;
    if(event.target?.closest?.('dialog,.settings-screen:not([hidden]),.veil:not([hidden])'))return;
    // HTML keypad slots handle their own pointer stream.
    if(event.target?.closest?.('#world-keypad'))return;
    const it=pick(event.clientX,event.clientY);if(!it)return;
    sound.unlock();
    pressed={it,id:event.pointerId,x:event.clientX,y:event.clientY};
    const p=it.s.press;p.held=true;p.releaseQueued=false;p.age=0;I.requestFrame();
    event.preventDefault?.();
  }
  function finishPress(event,force=false) {
    if(!pressed)return;
    const {it,id,x,y}=pressed;
    if(event&&event.pointerId!=null&&event.pointerId!==id)return;
    pressed=null;it.s.press.releaseQueued=true;I.requestFrame();
    if(!active||!items.has(it)||!it.interactive)return;
    const cx=event&&event.clientX!=null?event.clientX:x,cy=event&&event.clientY!=null?event.clientY:y;
    const moved=Math.hypot(cx-x,cy-y);
    if(force||(moved<40&&(pick(cx,cy)===it||moved<16)))activate(it);
  }
  function up(event){finishPress(event);}
  function cancelPress(event){
    // iOS often fires pointercancel near the home indicator; keep a short press as a tap.
    if(pressed&&event)finishPress(event,true);
    else if(pressed){pressed.it.s.press.releaseQueued=true;pressed=null;}
  }
  function activate(it) {
    if(!active||!items.has(it)||it.bursting)return;
    if(busy&&it.kind==='wide')return;
    sound.unlock();hooks.haptics?.pulse(it.kind==='wide'?'move':'tap');
    // Items that burst play suction in burst() already; a second play here
    // stacked a click on the cup.
    if(!it.explodes)sound.play('land',it.kind==='wide'?2:1,{pan:clamp(it.s.group.position.x/10,-.3,.3)});
    it.action(it);
  }
  function keydown(event) {
    if(!active||screen!=='multi'||multi?.mode!=='join'||event.metaKey||event.ctrlKey||event.altKey)return;
    if(/^\d$/.test(event.key)){event.preventDefault();typeDigit(+event.key);}
    else if(event.key==='Backspace'){event.preventDefault();eraseDigit();}
    else if(event.key==='Enter'&&multi.connect){event.preventDefault();activate(multi.connect);}
  }
  page.addEventListener('pointerdown',down,{passive:false});
  page.addEventListener('pointerup',up);
  page.addEventListener('pointercancel',cancelPress);
  page.addEventListener('keydown',keydown);

  // ---------- caption ----------
  function say(text,duration=0) {
    clearTimeout(captionTimer);
    if(live)live.textContent=text||'';
    if(!caption)return;
    caption.textContent=text||'';caption.hidden=!text;
    if(text&&duration)captionTimer=setTimeout(()=>{caption.hidden=true;},duration);
  }

  // ---------- screens ----------
  const wide=(row,text,value,action,options={})=>add('wide',{row,text,value,action,...options});
  async function transition(from,next) {
    if(busy)return;busy=true;cancelPress();
    try{await burstAll(from);say('');await next();}
    finally{busy=false;}
  }
  function focusFirst(){a11y.querySelector('button')?.focus({preventScroll:true});}
  async function showMain() {
    showBuild(false);
    screen='main';multi=null;keypadElement?.classList.remove('is-active');
    const canContinue=hooks.canContinue();
    const list=[
      wide(0,'Neues Spiel',C.green,it=>{hooks.gesture();void launch(it,true);},{explodes:true}),
      wide(1,'Weiterspielen',C.blue,it=>{
        if(!hooks.canContinue()){kick(it,.55);say('Noch kein Spielstand – starte ein neues Spiel.',2600);return;}
        hooks.gesture();void launch(it,false);
      },{dim:!canContinue,explodes:true}),
      wide(2,'Mehrspieler',C.violet,it=>void transition(it,showMulti),{explodes:true}),
      wide(3,'Einstellungen',C.orange,it=>void transition(it,showSettings),{explodes:true}),
    ];
    await drop(list);focusFirst();
  }
  async function launch(it,newGame) {
    if(busy)return;busy=true;cancelPress();
    try{await burstAll(it);active=false;page.documentElement.classList.remove('world-menu-open');say('');await hooks.launch(newGame);}
    finally{busy=false;}
  }
  // Settings reuse the original switches, so storage and permissions stay put.
  const toggleText={sound:()=>`Ton: ${hooks.soundButton?.getAttribute('aria-checked')==='false'?'Aus':'An'}`,
    motion:()=>`Handybewegung: ${hooks.motionButton?.getAttribute('aria-checked')==='true'?'An':'Aus'}`,
    vibration:()=>`Vibration: ${hooks.haptics?.enabled===false?'Aus':'An'}`};
  let toggles=null;
  const observer=new MutationObserver(()=>{
    if(screen!=='settings'||!toggles)return;
    for(const [key,it] of Object.entries(toggles))if(items.has(it)&&it.text!==toggleText[key]())relabel(it,toggleText[key]());
  });
  for(const button of [hooks.soundButton,hooks.motionButton])if(button)observer.observe(button,{attributes:true,attributeFilter:['aria-checked','disabled']});
  hooks.haptics?.onChange(()=>{if(screen==='settings'&&toggles)for(const [key,it] of Object.entries(toggles))if(items.has(it)&&it.text!==toggleText[key]())relabel(it,toggleText[key]());});
  const motionStatus=hooks.motionStatus;
  if(motionStatus)new MutationObserver(()=>{if(screen==='settings'&&motionStatus.textContent.trim())say(motionStatus.textContent.trim(),3200);})
    .observe(motionStatus,{childList:true,characterData:true,subtree:true});
  function showBuild(on) {
    let el=page.getElementById('squish-build');
    if(!el){
      el=page.createElement('div');el.id='squish-build';el.setAttribute('aria-hidden','true');
      Object.assign(el.style,{position:'fixed',left:'0',right:'0',bottom:'8px',textAlign:'center',
        font:'11px/1.2 ui-sans-serif,system-ui,sans-serif',color:'rgba(255,255,255,.4)',
        pointerEvents:'none',zIndex:'30',letterSpacing:'.04em'});
      page.body.append(el);
    }
    el.textContent='Squish '+BUILD;
    el.hidden=!on;
  }
  async function showSettings() {
    screen='settings';showBuild(true);
    toggles={
      sound:wide(0,toggleText.sound(),C.turquoise,it=>{hooks.soundButton?.click();kick(it,.45);}),
      motion:wide(1,toggleText.motion(),C.pink,it=>{
        if(!hooks.motionButton||hooks.motionButton.disabled){kick(it,.5);say('Handybewegung ist auf diesem Gerät nicht verfügbar.',2800);return;}
        hooks.motionButton.click();kick(it,.45);
      }),
      vibration:wide(2,toggleText.vibration(),C.violet,it=>{if(hooks.haptics)hooks.haptics.toggle();kick(it,.45);}),
    };
    const back=wide(3,'Zurück',C.red,it=>void transition(it,showMain),{explodes:true});
    await drop([toggles.sound,toggles.motion,toggles.vibration,back]);focusFirst();
  }
  // ---------- duel lobby ----------
  const codeX=i=>(i-1.5)*pitch;
  function showCode(room) {
    if(screen!=='multi'||multi.mode!=='host'||!room||room===multi.room)return;
    const old=multi.code;multi.room=room;
    multi.code=[...room].map((d,i)=>add('digit',{row:3,x:codeX(i),digit:+d,label:`Code-Ziffer ${d}`}));
    void burstAll(null,old||[]).then(()=>drop(multi.code,{spacing:.11}));
    say('Dein Code: '+room+' · Warte auf Mitspieler (10 Min.)');
  }
  function placeKeys() {
    if(!multi?.keys?.length||!keypadElement)return;
    const slots=[...keypadElement.children];
    multi.keys.forEach((it,i)=>{
      const r=slots[i]?.getBoundingClientRect();if(!r?.width)return;
      const half=Math.min(r.width*.41,r.height*.54),cx=r.left+r.width/2,cy=r.top+r.height*.62,center=I.project(cx,cy),left=I.project(cx-half,cy),right=I.project(cx+half,cy);
      if(!center||!left||!right)return;
      const scale=left.distanceTo(right)/gelW;
      it.base.set(scale,scale,scale);if(!it.bursting)it.s.group.scale.setScalar(scale);
      it.s.group.position.copy(center);it.row=5;
    });
    I.requestFrame({shadows:true});
  }
  new ResizeObserver(()=>placeKeys()).observe(keypadElement||page.body);
  page.visualViewport?.addEventListener('resize',()=>placeKeys());
  page.visualViewport?.addEventListener('scroll',()=>placeKeys());
  function bindKeypad() {
    if(!keypadElement||keypadElement.dataset.bound)return;
    keypadElement.dataset.bound='1';
    const digits=[1,2,3,4,5,6,7,8,9,0];
    [...keypadElement.children].forEach((slot,i)=>{
      slot.addEventListener('pointerdown',event=>{
        event.preventDefault();event.stopPropagation();
        try{slot.setPointerCapture(event.pointerId);}catch{}
        slot._sx=event.clientX;slot._sy=event.clientY;slot._tapped=false;
      },{passive:false});
      const release=event=>{
        event.preventDefault();event.stopPropagation();
        if(slot._tapped)return;
        const dx=event.clientX-(slot._sx??event.clientX),dy=event.clientY-(slot._sy??event.clientY);
        if(Math.hypot(dx,dy)<36){slot._tapped=true;typeDigit(digits[i]);}
      };
      slot.addEventListener('pointerup',release,{passive:false});
      slot.addEventListener('pointercancel',release,{passive:false});
    });
  }
  bindKeypad();
  function typeDigit(d) {
    if(!multi||multi.mode!=='join'||multi.connecting)return;
    if(multi.typed.length>=4){kick(multi.connect,.4);return;}
    const i=multi.typed.length,it=add('digit',{row:3,x:codeX(i),digit:d,label:'Letzte Ziffer löschen',action:()=>eraseDigit()});
    multi.typed.push(it);void drop([it]);
    const typed=multi.typed.map(tile=>tile.digit).join('');
    if(multi.typed.length===4){say('Code '+typed+' – tippe auf Verbinden.');setTimeout(()=>multi?.connect&&kick(multi.connect,.35),700);}
    else say('Code '+typed+'·'.repeat(4-typed.length)+' – weiter tippen.');
  }
  function eraseDigit() {
    if(!multi||multi.mode!=='join'||multi.connecting||!multi.typed.length)return;
    void burst(multi.typed.pop());
  }
  async function enterJoin(from) {
    if(multi.mode==='join'){kick(from,.4);return;}
    busy=true;
    try{
      multi.mode='join';multi.room=null;const old=multi.code||[];multi.code=null;
      const leaving=hooks.duel.joinMode();
      await burstAll(null,old);
      multi.typed=[];say('Gib den Code des Hosts ein.');
      multi.connect=add('wide',{row:4,text:'Verbinden',value:C.yellow,action:it=>void connect(it),explodes:true});
      keypadElement?.classList.add('is-active');
      multi.keys=[1,2,3,4,5,6,7,8,9,0].map(d=>add('digit',{digit:d,label:`Ziffer ${d}`,action:()=>typeDigit(d)}));
      placeKeys();
      await drop([multi.connect,...multi.keys],{spacing:.07});
    }finally{busy=false;}
    try{await leaving;}catch{}
  }
  async function enterHost(from) {
    if(multi.mode==='host'){
      kick(from,.4);
      if(multi.room||hooks.duel.room){
        const room=multi.room||hooks.duel.room;
        showCode(room);
        say('Dein Code: '+room+' · Warte auf Mitspieler (10 Min.)');
        return;
      }
      say('Spielcode wird erstellt …');
      try{
        await hooks.duel.host();
        if(hooks.duel.room&&multi?.mode==='host')showCode(hooks.duel.room);
        else if(multi?.mode==='host'&&!hooks.duel.room)say(document.getElementById('duel-status')?.textContent||'Code konnte nicht erstellt werden. Bitte nochmal auf Host tippen.');
      }catch(e){say(e?.message||'Code konnte nicht erstellt werden. Bitte nochmal auf Host tippen.');}
      return;
    }
    if(multi.mode==='join'){
      busy=true;
      try{
        const old=[...(multi.typed||[]),...(multi.keys||[]),...(multi.connect?[multi.connect]:[])];
        multi.mode='host';multi.typed=[];multi.keys=[];multi.connect=null;keypadElement?.classList.remove('is-active');
        await burstAll(null,old);say('Spielcode wird erstellt …');
      }finally{busy=false;}
      try{
        await hooks.duel.host();
        if(hooks.duel.room&&multi?.mode==='host')showCode(hooks.duel.room);
        else if(multi?.mode==='host'&&!hooks.duel.room)say(document.getElementById('duel-status')?.textContent||'Code konnte nicht erstellt werden. Bitte nochmal auf Host tippen.');
      }catch(e){say(e?.message||'Code konnte nicht erstellt werden. Bitte nochmal auf Host tippen.');}
      return;
    }
    // First tap on Host: create the code now, without blocking the button on the network.
    kick(from,.3);
    multi.mode='host';
    say('Spielcode wird erstellt …');
    try{
      await hooks.duel.host();
      if(hooks.duel.room&&multi?.mode==='host')showCode(hooks.duel.room);
      else if(multi?.mode==='host'&&!hooks.duel.room)say(document.getElementById('duel-status')?.textContent||'Code konnte nicht erstellt werden. Bitte nochmal auf Host tippen.');
    }catch(e){say(e?.message||'Code konnte nicht erstellt werden. Bitte nochmal auf Host tippen.');}
  }
  async function connect(it) {
    if(multi.connecting)return;
    if(multi.typed.length<4){kick(it,.5);say('Bitte den vierstelligen Code eingeben.',2600);return;}
    multi.connecting=true;kick(it,.3);
    let ok=false;
    try{ok=await hooks.duel.join(multi.typed.map(tile=>tile.digit).join(''));}
    catch(e){say(e?.message||'Beitreten fehlgeschlagen.');}
    if(multi)multi.connecting=false;
    if(!ok&&multi){
      kick(it,.55);
      const err=document.getElementById('duel-status')?.textContent;
      if(err)say(err);
    }
  }
  async function showMulti() {
    screen='multi';multi={mode:null,room:null,code:null,typed:[],keys:[],connect:null,connecting:false};
    const list=[
      wide(0,'Host',C.green,it=>void enterHost(it),{explodes:true}),
      wide(1,'Beitreten',C.blue,it=>void enterJoin(it),{explodes:true}),
      wide(2,'Zurück',C.red,it=>void transition(it,async()=>{keypadElement?.classList.remove('is-active');await hooks.duel.cancel();await showMain();}),{explodes:true}),
    ];
    // Do not auto-create a room: Host must be a real action, and Beitreten
    // must not have to cancel a half-created host game first.
    say('Tippe auf Host, um einen Code zu erstellen, oder auf Beitreten.');
    await drop(list);focusFirst();
  }

  return {
    get active(){return active;},get screen(){return screen;},get stats(){return {items:items.size,textures:textures.size,busy,screen};},
    // Compile the wide gel program and label path behind the splash.
    preload() {
      return warm||=(async()=>{
        const probe=[add('wide',{row:0,text:'Neues Spiel',value:C.green}),add('digit',{row:3,digit:1})];
        try{await I.compile(probe.map(it=>it.s));}catch{}finally{probe.forEach(remove);}
      })();
    },
    async open({launch}={}) {
      if(launch)hooks.launch=launch;
      if(active)return;active=true;page.documentElement.classList.add('world-menu-open');
      if(visual.graphics.state.paused)visual.graphics.pause(false);
      await this.preload();
      await showMain();
    },
    code:showCode,
    status(text){if(!active||screen!=='multi'||!text)return;if(multi?.mode==='host'&&multi.room){say('Dein Code: '+multi.room+' · Warte auf Mitspieler (10 Min.)');return;}say(SHORT[text]||text);},
    // A duel partner connected: clear the lobby with the same bursts.
    async dismiss() {
      if(!items.size){active=false;say('');return;}
      active=false;cancelPress();say('');keypadElement?.classList.remove('is-active');page.documentElement.classList.remove('world-menu-open');
      if(visual.graphics.state.paused)visual.graphics.pause(false);
      await burstAll(null);screen=null;multi=null;
    },
    dispose(){active=false;I.cancelJobs();[...items].forEach(remove);observer.disconnect();
      page.removeEventListener('pointerdown',down);page.removeEventListener('pointerup',up);page.removeEventListener('pointercancel',cancelPress);page.removeEventListener('keydown',keydown);},
  };
}
