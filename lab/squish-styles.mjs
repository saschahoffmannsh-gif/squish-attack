// Squish-Stile im Vergleich: A = Material wie im Spiel, B = weiche Toon-Stufen, C = Comic (Cel + Kontur).
// Geometrie, Verformung und Federn kommen 1:1 aus dem Spiel (createGameGraphics, gleiche Squishy-Objekte);
// ausgetauscht werden nur die Materialien von Körper und Ziffer. Nicht im Spiel verlinkt.
const {createGameGraphics}=await import('../game/graphics-adapter.mjs?v=launch-5');
const q=new URLSearchParams(location.search);
const stress=(q.get('stress')||'').toUpperCase();
const still=q.has('still');
const fixedRatio=q.get('pr')?Number(q.get('pr')):null;
if(still)document.documentElement.classList.add('still');
document.querySelectorAll('#bar a').forEach(a=>{if(new URL(a.href).search===(location.search.replace(/&?(pr|still)=[^&]*/g,'').replace(/^\?$/,'')||''))a.setAttribute('aria-current','page');});

const slot=document.getElementById('slot'),host=document.getElementById('graphics'),stats=document.getElementById('stats');
// Brett-Rahmen: Vergleich = Spalten 1–3 füllen die Breite (Nahansicht), Stress = wie im Spiel.
function layoutSlot(){
  const W=innerWidth,H=innerHeight;
  if(stress){const s=W*.994;Object.assign(slot.style,{width:s+'px',height:s+'px',left:(W-s)/2+'px',top:(H-s)/2+'px'});return;}
  const s=W*5/3.45,cell=s/5;
  Object.assign(slot.style,{width:s+'px',height:s+'px',left:(W-s)/2+'px',top:(H*.5-s/2)+'px'});
  const cols=document.getElementById('cols');cols.hidden=false;cols.style.top=(H*.5-s*.43-98)+'px';
}
layoutSlot();addEventListener('resize',layoutSlot);
document.getElementById('head').textContent=stress?`Labor · 25× Stil ${stress} (Leistung)`:'Labor · Squish-Stile A / B / C';

const visual=createGameGraphics(host);window.__lab=visual;
const {graphics,internals:I}=visual,{THREE}=I,P=I.PARAMETERS;
await visual.ready;
if(fixedRatio){graphics.renderer.setPixelRatio(fixedRatio);graphics.quality.update=()=>{};graphics.renderer.shadowMap.needsUpdate=true;}

// ---------- Kacheln ----------
const tiles=[];
if(stress){for(let r=0;r<5;r++)for(let c=0;c<5;c++)tiles.push({id:`${r}:${c}`,value:1+((r*5+c)%3),row:r,col:c,style:stress});}
else{const st={1:'A',2:'B',3:'C'};for(const c of [1,2,3]){tiles.push({id:`r2-${c}`,value:2,row:1,col:c,style:st[c]});tiles.push({id:`b1-${c}`,value:1,row:3,col:c,style:st[c]});}}
visual.sync(tiles.map(({id,value,row,col})=>({id,value,row,col})));
await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

// ---------- Materialien ----------
const LIGHT=new THREE.Vector3(-.55,.9,-.3).normalize();
const PALETTE={1:['#5cc2ff','#1f7ff0','#0d3f9e','#06173f'],2:['#ff7a66','#e8291f','#a3101a','#3a0306'],3:['#9df25a','#38b81c','#1b7a10','#0a3300']};
const colorsFor=v=>PALETTE[(v-1)%3+1];
const vert=`varying vec3 vN;varying vec3 vWP;varying vec3 vP;
void main(){vP=position;vec4 wp=modelMatrix*vec4(position,1.);vWP=wp.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*wp;}`;
const fragB=`uniform vec3 uHi,uMid,uLo,uRim,uL;uniform vec4 uBox;varying vec3 vN;varying vec3 vWP;varying vec3 vP;
void main(){vec3 N=normalize(vN),V=normalize(cameraPosition-vWP),L=normalize(uL);
 float d=dot(N,L)*.5+.5;
 vec3 c=mix(uLo,uMid,smoothstep(.28,.52,d));c=mix(c,uHi,smoothstep(.70,.9,d)*.55);
 float fr=1.-max(dot(N,V),0.);c=mix(c,uRim,smoothstep(.5,.9,fr)*.4);
 c=mix(c,uHi,smoothstep(.25,-.6,N.y)*.35);
 vec2 q=(vP.xz-uBox.xy)/uBox.zw;float top=smoothstep(.55,.85,N.y);
 float g=length((q-vec2(-.46,-.4))*vec2(1.,1.8));c=mix(c,vec3(1.),(1.-smoothstep(.08,.36,g))*top*.6);
 gl_FragColor=vec4(c,1.);
 #include <colorspace_fragment>
}`;
const fragC=`uniform vec3 uMid,uLo,uL;uniform vec4 uBox;varying vec3 vN;varying vec3 vWP;varying vec3 vP;
void main(){vec3 N=normalize(vN),V=normalize(cameraPosition-vWP),L=normalize(uL);
 float d=dot(N,L)*.5+.5;
 vec3 c=mix(uLo,uMid,step(.5,d));
 vec2 q=(vP.xz-uBox.xy)/uBox.zw;float top=step(.6,N.y);
 float g=length((q-vec2(-.52,-.46))*vec2(1.,1.7)),g2=length(q-vec2(-.2,-.62));
 c=mix(c,vec3(1.),max(1.-step(.17,g),1.-step(.065,g2))*top);
 gl_FragColor=vec4(c,1.);
 #include <colorspace_fragment>
}`;
const outlineVert=`uniform float uT;void main(){vec3 p=position+normal*uT;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`;
const outlineFrag=`uniform vec3 uC;void main(){gl_FragColor=vec4(uC,1.);
 #include <colorspace_fragment>
}`;
const labelVert=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const labelFrag=`uniform sampler2D map;uniform vec3 uInk,uFace;uniform vec2 uOff;varying vec2 vUv;
void main(){float a=texture2D(map,vUv).r,o=0.;
 for(int i=0;i<12;i++){float t=float(i)*0.5235988;o=max(o,texture2D(map,vUv+vec2(cos(t),sin(t))*uOff).r);}
 float face=smoothstep(.3,.6,a),edge=smoothstep(.15,.45,o);
 vec3 c=mix(uInk,uFace,face);gl_FragColor=vec4(c,max(face,edge));
 #include <colorspace_fragment>
}`;
const col=h=>new THREE.Color(h);
function bodyMaterial(style,value,geometry){
  const [hi,mid,lo,ink]=colorsFor(value);
  geometry.computeBoundingBox();const b=geometry.boundingBox,box=new THREE.Vector4((b.min.x+b.max.x)/2,(b.min.z+b.max.z)/2,(b.max.x-b.min.x)/2,(b.max.z-b.min.z)/2);
  if(style==='B')return new THREE.ShaderMaterial({vertexShader:vert,fragmentShader:fragB,toneMapped:false,
    uniforms:{uHi:{value:col(hi)},uMid:{value:col(mid)},uLo:{value:col(lo)},uRim:{value:col(hi).lerp(col('#ffffff'),.55)},uL:{value:LIGHT},uBox:{value:box}}});
  return new THREE.ShaderMaterial({vertexShader:vert,fragmentShader:fragC,toneMapped:false,
    uniforms:{uMid:{value:col(mid).lerp(col(hi),.12)},uLo:{value:col(lo).lerp(col(mid),.35)},uL:{value:LIGHT},uBox:{value:box}}});
}
function outline(style,value,geometry){
  const ink=colorsFor(value)[3];
  const m=new THREE.ShaderMaterial({vertexShader:outlineVert,fragmentShader:outlineFrag,side:THREE.BackSide,toneMapped:false,
    uniforms:{uT:{value:style==='C'?.05:.022},uC:{value:style==='C'?col('#140a10'):col(colorsFor(value)[2]).lerp(col('#000'),.45)}}});
  const mesh=new THREE.Mesh(geometry,m);mesh.name='Lab_outline';mesh.castShadow=false;mesh.receiveShadow=false;return mesh;
}
function labelMaterial(style,old){
  const map=old.alphaMap;
  return new THREE.ShaderMaterial({vertexShader:labelVert,fragmentShader:labelFrag,transparent:true,depthWrite:false,toneMapped:false,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
    uniforms:{map:{value:map},uInk:{value:col(style==='C'?'#140a10':'#2a1a30')},uFace:{value:col(style==='C'?'#ffffff':'#fffbea')},uOff:{value:new THREE.Vector2(style==='C'?.06:.02,style==='C'?.04:.013)}}});
}
for(const t of tiles){
  if(t.style==='A')continue;
  const s=graphics.getTile(t.id);
  s.body.material=bodyMaterial(t.style,t.value,s.body.geometry);
  s.body.add(outline(t.style,t.value,s.body.geometry));
  if(s.bubbles)s.bubbles.visible=false;
  const old=s.label.material;s.label.material=labelMaterial(t.style,old);
}
// Vergleich: Spalten etwas auseinanderrücken (nur Position, Form unverändert).
const spread=stress?1:Number(q.get('spread')||1.22);
if(spread!==1){const cx=graphics.getTile(tiles.find(t=>t.col===2).id).group.position.x;
  for(const t of tiles){const g=graphics.getTile(t.id).group;g.position.x=cx+(g.position.x-cx)*spread;}}
graphics.renderer.shadowMap.needsUpdate=true;

// ---------- Animation: gleiche Federn wie im Spiel (wobble), gleicher Takt pro Reihe ----------
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let beat=0;
function kick(){
  beat++;
  for(const t of tiles){const lag=stress?((t.row+t.col)%5)*.06:t.row*.18;visual.scheduleWobble(t.id,stress?.3:(beat%3===0?.42:.26),lag);}
}
if(!reduced){kick();setInterval(kick,stress?900:2000);}

// ---------- Messung ----------
const gl=graphics.renderer.getContext(),px=new Uint8Array(4);
const baseRender=graphics.render.bind(graphics);let renderMs=0,renders=0;
graphics.render=dt=>{const t0=performance.now();baseRender(dt);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);renderMs+=performance.now()-t0;renders++;};
let frames=0,acc=0,last=performance.now(),report={};
function tick(now){
  if(stress||q.has('measure'))I.requestFrame();
  frames++;acc+=now-last;last=now;
  if(acc>1000){
    report={style:stress||'ABC',frameMs:+(acc/frames).toFixed(2),fps:+(frames*1000/acc).toFixed(1),renderMs:renders?+(renderMs/renders).toFixed(2):0,
      pixelRatio:graphics.renderer.getPixelRatio(),canvas:`${graphics.renderer.domElement.width}×${graphics.renderer.domElement.height}`};
    window.__labReport=report;
    stats.textContent=`Stil ${report.style} · ${report.fps} fps · Frame ${report.frameMs} ms · Render ${report.renderMs} ms · PR ${report.pixelRatio} (${report.canvas})`;
    frames=0;acc=0;renderMs=0;renders=0;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
window.__labReady=true;
