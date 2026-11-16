// squish-art: Eis, Schloss, Bombe und Joker als ein nahtloser Squish.
//  Der Körper behält Silhouette, Kantenradius, Tiefe, Schatten und Kontur
//  der normalen Squishes. Das Material liegt als undurchsichtige Textur auf
//  dem ganzen Gel (XZ-UV), inklusive der Seiten – kein Aufkleber, kein
//  quadratischer Hintergrund. Die Zahl bleibt versteckt. Keine Idle-Animation.
import {THREE} from '../squish/squish-graphics.js?v=play-sharp-1';
import {applyComic,LIGHT} from './comic-style.mjs?v=squish-art-3';

const ART='squish-art-3';
const URLS={
  ice:new URL(`./assets/specials/ice.webp?v=${ART}`,import.meta.url).href,
  bound:new URL(`./assets/specials/bound.webp?v=${ART}`,import.meta.url).href,
  bomb:new URL(`./assets/specials/bomb.webp?v=${ART}`,import.meta.url).href,
  joker:new URL(`./assets/specials/joker.webp?v=${ART}`,import.meta.url).href,
};

const textures=new Map();
function tex(kind){
  let t=textures.get(kind);if(t)return t;
  t=new THREE.TextureLoader().load(URLS[kind]);
  t.colorSpace=THREE.SRGBColorSpace;
  t.flipY=false; // Gel-UV: +Z liegt vorn; die Textur-Oberseite soll nach hinten (oben auf dem Brett).
  t.generateMipmaps=true;
  t.minFilter=THREE.LinearMipmapLinearFilter;
  t.magFilter=THREE.LinearFilter;
  t.anisotropy=8;
  textures.set(kind,t);return t;
}
tex('ice');tex('bound');tex('bomb');tex('joker');

const bodyVert=`varying vec3 vN;varying vec3 vP;varying vec2 vUv;
void main(){vP=position;vUv=uv;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
// Cel-ähnliche Modellierung der Form, Albedo kommt aus der Konzept-Textur.
const bodyFrag=`uniform sampler2D uMap;uniform vec3 uL;uniform float uSpot;varying vec3 vN;varying vec3 vP;varying vec2 vUv;
float aastep(float e,float x){float w=max(fwidth(x),1e-4)*.75;return smoothstep(e-w,e+w,x);}
void main(){
  float nl=length(vN);vec3 N=nl>1e-5?vN/nl:vec3(0.,1.,0.);
  vec3 tex=texture2D(uMap,vUv).rgb;
  float d=dot(N,normalize(uL))*.5+.5;
  float lit=mix(.62,1.,aastep(.42,d));
  float top=smoothstep(-.05,.95,N.y);
  vec3 c=tex*mix(.7,1.,top)*lit;
  vec2 q=vP.xz*vec2(1.05,1.15);
  float g=length((q-vec2(-.45,-.4))*vec2(1.,1.6)),g2=length(q-vec2(-.16,-.55));
  float spot=max(1.-aastep(.16*uSpot,g),1.-aastep(.06*uSpot,g2))*aastep(.45,N.y);
  gl_FragColor=vec4(c,1.);
  #include <tonemapping_fragment>
  gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(1.),spot*.55);
  #include <colorspace_fragment>
}`;

function specialBodyMaterial(kind){
  const mat=new THREE.ShaderMaterial({
    uniforms:{uMap:{value:tex(kind)},uL:{value:LIGHT.clone()},uSpot:{value:.85}},
    vertexShader:bodyVert,fragmentShader:bodyFrag,
  });
  mat.toneMapped=false;
  mat.userData.special=kind;
  return mat;
}

function outlineOf(s){return s.body?.children?.find(o=>o.name==='Comic_outline')||null;}

function setBody(s,kind){
  const body=s.body;if(!body)return;
  const prev=body.material;
  if(prev?.userData?.special===kind)return;
  body.material=specialBodyMaterial(kind);
  if(prev&&prev!==body.material){
    // Comic-Material nicht zerstören, wenn wir es später wieder brauchen? applyComic legt ein neues an.
    // Spezial-Material entsorgen; Comic ebenfalls, applyComic erzeugt es neu.
    const old=prev;setTimeout(()=>old.dispose(),0);
  }
  const o=outlineOf(s);if(o)o.visible=true;
}

function restoreBody(s){
  const body=s.body;if(!body)return;
  if(body.material?.userData)body.material.userData.special=null;
  applyComic(s,s.value);
  const o=outlineOf(s);if(o)o.visible=true;
}

let runtime={job:null,reduced:()=>false};
export function setSpecialRuntime(r){runtime={job:r.job||null,reduced:r.reduced||(()=>false)};}

function disposeDecor(mesh){
  if(!mesh)return;mesh.parent?.remove(mesh);mesh.geometry?.dispose?.();mesh.material?.dispose?.();
}
function cancelFree(s){
  const j=s.userData?.freeJob;if(!j)return;s.userData.freeJob=null;j.cancel?.();
}

function finishFree(s){
  restoreBody(s);
  if(s.label){s.label.visible=true;if(s.label.material&&s.label.material.opacity!=null)s.label.material.opacity=1;}
}

/** Kurzes Einblenden der normalen Zahl, wenn ein Joker/Spezialstein zum normalen Squish wird. */
function popFree(s){
  cancelFree(s);
  if(!runtime.job||runtime.reduced()||s.group?.visible===false){finishFree(s);return;}
  restoreBody(s);
  if(s.label){s.label.visible=true;if(s.label.material&&s.label.material.opacity!=null)s.label.material.opacity=0;}
  const job={
    t0:null,
    update(time){
      if(this.t0==null)this.t0=time;
      const t=Math.min(1,(time-this.t0)/.35),e=t*t*(3-2*t);
      if(s.label?.material&&s.label.material.opacity!=null)s.label.material.opacity=e;
      if(e>=1){if(s.userData?.freeJob===job)s.userData.freeJob=null;return true;}
      return false;
    },
    cancel(){if(s.label?.material&&s.label.material.opacity!=null)s.label.material.opacity=1;if(s.label)s.label.visible=true;}
  };
  (s.userData||={}).freeJob=job;runtime.job(job);
}

function labelOf(s,kind){
  if(!s.label)return;
  if(s.userData?.freeJob)return;
  s.label.visible=!kind;
  if(s.label.material&&s.label.material.opacity!=null&&!kind)s.label.material.opacity=1;
}

/** Squish auf seine Art stellen (null = normal). Billig, wenn sich nichts ändert. */
export function applySpecial(s,kind,{freed=false}={}){
  const prev=s.special||null;
  if(prev!==kind){
    // Alte Decal-Ebene (frühere Version) entfernen, falls noch vorhanden.
    if(s.specialDecor){disposeDecor(s.specialDecor);s.specialDecor=null;}
    cancelFree(s);
    if(kind)setBody(s,kind);
    else popFree(s);
    s.special=kind;
  }else if(kind){
    setBody(s,kind);
  }
  labelOf(s,kind);
  const o=outlineOf(s);if(o)o.visible=true;
  return prev!==kind;
}
