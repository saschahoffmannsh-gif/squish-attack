import {THREE} from '../squish/squish-graphics.js?v=play-sharp-1';

// Comic look (Stil C aus dem Labor): flaches Cel-Shading mit zwei Stufen,
// dicke dunkle Kontur (invertierte Hülle auf derselben, CPU-verformten
// Geometrie), harter weißer Glanzfleck + kleiner Punkt, weiße Ziffer mit
// dunkler Kontur. Form, Verformung und Federn bleiben die des Spiels.
export const INK='#140a10';
// [hell, mittel, dunkel] je Spielfarbe 1–8 (Blau, Rot, Grün, Orange, Violett, Gelb, Pink, Türkis).
const PALETTE={
  1:['#5cc2ff','#1f7ff0','#0d3f9e'],2:['#ff7a66','#e8291f','#a3101a'],3:['#9df25a','#38b81c','#1b7a10'],
  4:['#ffb04a','#ff7a0c','#b8460a'],5:['#b57cff','#8a3cf0','#5418a8'],6:['#ffe36b','#ffc21f','#c98a06'],
  7:['#ff8cc6','#f0459e','#a8186a'],8:['#6ff0e2','#1fc9bd','#0e8a84'],
};
const col=hex=>new THREE.Color(hex);
const cache=new Map();
// Licht- und Schattenton (wie Stil C im Labor), plus Akzent für Effekte.
export function comicColors(value){
  const key=((Math.max(1,value|0)-1)%8)+1;let c=cache.get(key);
  if(!c){const [hi,mid,lo]=PALETTE[key];c={light:col(mid).lerp(col(hi),.12),shade:col(lo).lerp(col(mid),.35),hi:col(hi),mid:col(mid),lo:col(lo),hex:{hi,mid,lo}};cache.set(key,c);}
  return c;
}
export const LIGHT=new THREE.Vector3(-.55,.9,-.3).normalize();

const bodyVert=`varying vec3 vN;varying vec3 vP;
void main(){vP=position;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
// Bandkanten und Glanzfleck werden per fwidth geglättet: hart, aber ohne Treppen.
const bodyFrag=`uniform vec3 uLight,uShade,uL;uniform vec4 uBox;uniform float uSpot;varying vec3 vN;varying vec3 vP;
float aastep(float e,float x){float w=max(fwidth(x),1e-4)*.75;return smoothstep(e-w,e+w,x);}
void main(){float nl=length(vN);vec3 N=nl>1e-5?vN/nl:vec3(0.,1.,0.);
 float d=dot(N,normalize(uL))*.5+.5;
 vec3 c=mix(uShade,uLight,aastep(.5,d));
 vec2 q=(vP.xz-uBox.xy)/uBox.zw;
 #ifdef FUSED
  // Balloon: the top cap is rounder, so the spot may sit lower on it.
  float top=aastep(.3,N.y);
 #else
  float top=aastep(.6,N.y);
 #endif
 float g=length((q-vec2(-.52,-.46))*vec2(1.,1.7)),g2=length(q-vec2(-.2,-.62));
 float spot=max(1.-aastep(.17*uSpot,g),1.-aastep(.065*uSpot,g2))*top;
 gl_FragColor=vec4(c,1.);
 #include <tonemapping_fragment>
 // The shine stays pure white after tone mapping.
 gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(1.),spot);
 #include <colorspace_fragment>
}`;
// Highlight placement uses the body's rest footprint (top face, top-left).
function fitBox(box,geometry){geometry.computeBoundingBox();const b=geometry.boundingBox;box.set((b.min.x+b.max.x)/2,(b.min.z+b.max.z)/2,(b.max.x-b.min.x)/2||1,(b.max.z-b.min.z)/2||1);}
export function comicBodyMaterial(value,geometry,{fused=false}={}){
  const {light,shade}=comicColors(value);
  const box=new THREE.Vector4(0,0,1,1);
  if(geometry&&!fused)fitBox(box,geometry);
  const m=new THREE.ShaderMaterial({vertexShader:bodyVert,fragmentShader:bodyFrag,toneMapped:true,defines:fused?{FUSED:1}:{},side:fused?THREE.DoubleSide:THREE.FrontSide,
    uniforms:{uLight:{value:light.clone()},uShade:{value:shade.clone()},uL:{value:LIGHT},uBox:{value:box},uSpot:{value:1}}});
  m.name='Comic_body';m.userData.comic={value,fused,boxed:!!geometry&&!fused};
  return m;
}
export function setComicValue(material,value){
  const u=material?.uniforms;if(!u?.uLight)return;const {light,shade}=comicColors(value);
  u.uLight.value.copy(light);u.uShade.value.copy(shade);material.userData.comic.value=value;
}

// Kontur: Rückseiten-Hülle, entlang der Normalen verschoben. Die Dicke ist in
// Weltmaß konstant (kleine Vorschau-Steine bekommen dieselbe Linie).
const hullVert=`uniform float uT,uPush;void main(){float nl=length(normal);vec3 p=position+(nl>1e-5?normal/nl:vec3(0.))*uT;vec4 v=modelViewMatrix*vec4(p,1.);v.z-=uPush;gl_Position=projectionMatrix*v;}`;
const hullFrag=`uniform vec3 uC;void main(){gl_FragColor=vec4(uC,1.);
 #include <colorspace_fragment>
}`;
export const OUTLINE_WORLD=.085;
const scaleOf=new THREE.Vector3();
// `push` moves the hull away from the camera (fused balloon: its folds must never show ink).
export function comicOutline(geometry,{world=OUTLINE_WORLD,push=0}={}){
  const m=new THREE.ShaderMaterial({vertexShader:hullVert,fragmentShader:hullFrag,side:THREE.BackSide,toneMapped:false,
    uniforms:{uT:{value:.05},uPush:{value:push},uC:{value:col(INK)}}});
  m.name='Comic_outline';
  const mesh=new THREE.Mesh(geometry,m);mesh.name='Comic_outline';mesh.castShadow=false;mesh.receiveShadow=false;
  mesh.raycast=()=>{};
  mesh.onBeforeRender=function(){
    const e=this.matrixWorld.elements,sx=Math.hypot(e[0],e[1],e[2])||1;
    m.uniforms.uT.value=Math.min(.16,world/sx);
  };
  return mesh;
}

// Ziffer: weiß mit dunkler Kontur, aus der vorhandenen Coverage-Textur
// (12 Abtastungen im Kreis). Bleibt ein MeshBasicMaterial, damit opacity,
// clone() und die Fusion unverändert funktionieren.
export function comicLabelMaterial(material,{width=.5,height=.7,thickness=.03}={}){
  material.color.set('#ffffff');material.toneMapped=false;
  material.userData.comicInk=[thickness/width,thickness/height];
  material.onBeforeCompile=function(shader){
    const [ox,oy]=this.userData.comicInk||[.06,.04];
    shader.uniforms.uComicOff={value:new THREE.Vector2(ox,oy)};shader.uniforms.uComicInk={value:col(INK)};
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec2 uComicOff;uniform vec3 uComicInk;')
      .replace('#include <alphamap_fragment>',`
        #ifdef USE_ALPHAMAP
        {float comicA=texture2D(alphaMap,vAlphaMapUv).g,comicO=0.;
         for(int i=0;i<12;i++){float t=float(i)*0.5235988;comicO=max(comicO,texture2D(alphaMap,vAlphaMapUv+vec2(cos(t),sin(t))*uComicOff).g);}
         float face=smoothstep(.3,.6,comicA),edge=smoothstep(.15,.45,comicO);
         diffuseColor.rgb=mix(uComicInk,diffuseColor.rgb,face);diffuseColor.a*=max(face,edge);}
        #endif`);
  };
  material.customProgramCacheKey=()=>'comic-label-1';
  const clone=material.clone;
  material.clone=function(){const c=clone.call(this);c.onBeforeCompile=this.onBeforeCompile;c.customProgramCacheKey=this.customProgramCacheKey;c.clone=this.clone;c.toneMapped=false;return c;};
  material.needsUpdate=true;
  return material;
}

// Einen Squish (Spielstein, Vorschau, Rekord, Fusionskörper) auf Comic umstellen.
export function applyComic(s,value=s.value,{fused=false}={}){
  const body=s.body;if(!body)return;
  const current=body.material;
  if(current?.userData?.comic){
    const info=current.userData.comic;if(info.value!==value)setComicValue(current,value);
    if(!info.fused&&!info.boxed&&body.geometry?.attributes?.position){fitBox(current.uniforms.uBox.value,body.geometry);info.boxed=true;}
  }
  else{
    const old=current;body.material=comicBodyMaterial(value,body.geometry,{fused});
    // The SDK's translucent shadow keeps working: it is a separate depth material.
    if(old&&old!==body.material)setTimeout(()=>old.dispose(),0);
  }
  if(!body.children.some(o=>o.name==='Comic_outline'))body.add(comicOutline(body.geometry));
  else for(const o of body.children)if(o.name==='Comic_outline'&&o.geometry!==body.geometry)o.geometry=body.geometry;
  if(s.bubbles)s.bubbles.visible=false;
}

// Effekte: flaches Zweiton-Material (Hautfetzen, Tropfen).
export function toonUniforms(value,{gold=false}={}){
  const c=comicColors(value),light=c.light.clone(),shade=c.shade.clone();
  if(gold){light.lerp(col('#ffd34d'),.75);shade.lerp(col('#c98a06'),.75);}
  return {uLight:{value:light},uShade:{value:shade},uL:{value:LIGHT},uInk:{value:col(INK)}};
}

// Comic-„Pop“: gezackter Stern mit dunkler Kontur (weiß, Farbe wird getönt) und Funkel-Stern.
function canvasTexture(draw,size=256){
  const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');draw(x,size);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;return t;
}
function star(x,cx,cy,spikes,outer,inner,rot=0,jag=0){
  x.beginPath();
  for(let i=0;i<spikes*2;i++){const r=i%2?inner:outer*(1-jag*((i*7)%5)/5),a=rot+i*Math.PI/spikes;x.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);}
  x.closePath();
}
let burstTex=null,sparkTex=null,ringTex=null;
export function comicBurstTexture(){
  return burstTex||=canvasTexture((x,s)=>{
    const c=s/2;x.lineJoin='round';
    star(x,c,c,12,s*.47,s*.27,-Math.PI/2,.28);x.fillStyle=INK;x.fill();
    star(x,c,c,12,s*.47-s*.05,s*.27-s*.04,-Math.PI/2,.28);x.fillStyle='#ffffff';x.fill();
    star(x,c,c,10,s*.25,s*.15,-Math.PI/2+.2,.15);x.fillStyle='#fff4b8';x.fill();
  });
}
export function comicSparkTexture(){
  return sparkTex||=canvasTexture((x,s)=>{
    const c=s/2;x.lineJoin='round';
    star(x,c,c,4,s*.48,s*.12,-Math.PI/2);x.fillStyle=INK;x.fill();
    star(x,c,c,4,s*.48-s*.07,s*.12-s*.04,-Math.PI/2);x.fillStyle='#ffffff';x.fill();
  },128);
}
export function comicRingTexture(){
  return ringTex||=canvasTexture((x,s)=>{
    const c=s/2;x.lineWidth=s*.075;x.strokeStyle=INK;x.beginPath();x.arc(c,c,s*.42,0,Math.PI*2);x.stroke();
    x.lineWidth=s*.04;x.strokeStyle='#ffffff';x.beginPath();x.arc(c,c,s*.42,0,Math.PI*2);x.stroke();
  });
}
