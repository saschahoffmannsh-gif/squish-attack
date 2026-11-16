// squish-art: Sonder-Squishes sind das komplette Konzept-Bild.
//  Kein Gel-Glanz, keine Comic-Kontur, keine Seitenleiste und kein
//  zusätzliches Shading. Die ganze Konzept-Kachel (Rand, Fase, Seite,
//  Schattierung) liegt als unbeleuchtete Sprite-Karte auf dem Footprint;
//  nur der weiche Kontakt-Schatten des Steins bleibt. Die Karte wird
//  mit derselben squash/sway-Deformation wie der Gel-Körper verformt.
import {THREE,PARAMETERS} from '../squish/squish-graphics.js?v=play-sharp-1';
import {applyComic} from './comic-style.mjs?v=squish-art-5';

const ART='squish-art-5';
const URLS={
  ice:new URL(`./assets/specials/ice.webp?v=${ART}`,import.meta.url).href,
  bound:new URL(`./assets/specials/bound.webp?v=${ART}`,import.meta.url).href,
  bomb:new URL(`./assets/specials/bomb.webp?v=${ART}`,import.meta.url).href,
  joker:new URL(`./assets/specials/joker.webp?v=${ART}`,import.meta.url).href,
};
// Fraction of the texture that is padding around the painted stone (bake_sprite.py).
const PAD={ice:.06543,bound:.06641,bomb:.06641,joker:.06641};
const SEGMENTS=24;
// Slightly larger than gel.width so the painted rim fills the visual slot of a
// normal squish (which also carries a dark comic outline).
const FOOT=PARAMETERS.gel.width*1.03;

const textures=new Map();
function tex(kind){
  let t=textures.get(kind);if(t)return t;
  t=new THREE.TextureLoader().load(URLS[kind]);
  t.colorSpace=THREE.SRGBColorSpace;
  t.generateMipmaps=true;
  t.minFilter=THREE.LinearMipmapLinearFilter;
  t.magFilter=THREE.LinearFilter;
  t.anisotropy=16;
  t.premultiplyAlpha=false;
  textures.set(kind,t);return t;
}
tex('ice');tex('bound');tex('bomb');tex('joker');

const cardVert=`varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const cardFrag=`uniform sampler2D uMap;varying vec2 vUv;
void main(){
  vec4 t=texture2D(uMap,vUv);
  if(t.a<0.04)discard;
  gl_FragColor=t;
  #include <colorspace_fragment>
}`;

function cardMaterial(kind){
  const m=new THREE.ShaderMaterial({
    uniforms:{uMap:{value:tex(kind)}},
    vertexShader:cardVert,fragmentShader:cardFrag,
    transparent:true,depthWrite:true,toneMapped:false,side:THREE.DoubleSide,
  });
  m.userData.special=kind;
  return m;
}

function cameraFacingQuat(){
  const c=PARAMETERS.camera,p=c.position,t=c.target||[0,.1,0];
  const normal=new THREE.Vector3(p[0]-t[0],p[1]-t[1],p[2]-t[2]).normalize();
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),normal);
}

function makeCardGeometry(kind){
  const pad=PAD[kind]??PAD.bound;
  const span=FOOT/(1-2*pad);
  const geo=new THREE.PlaneGeometry(span,span,SEGMENTS,SEGMENTS);
  const q=cameraFacingQuat();
  const lift=PARAMETERS.gel.height*.52;
  const pos=geo.attributes.position;
  const v=new THREE.Vector3();
  for(let i=0;i<pos.count;i++){
    v.set(pos.getX(i),pos.getY(i),pos.getZ(i)).applyQuaternion(q);
    v.y+=lift;
    pos.setXYZ(i,v.x,v.y,v.z);
  }
  pos.needsUpdate=true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function deformGeometry(geometry,rest,pose){
  if(!pose||!rest)return;
  const out=geometry.attributes.position.array;
  const squash=pose.squash||0,sway=pose.sway||0,swayZ=pose.swayZ||0;
  const p=1-squash,h=PARAMETERS.gel.height,spread=PARAMETERS.motion.spreadFactor;
  for(let i=0;i<rest.length;i+=3){
    const x=rest[i],y=rest[i+1],z=rest[i+2];
    const a=Math.pow(Math.max(0,y)/h,1.7);
    const d=1+squash*a*spread;
    out[i]=x*d+sway*a;
    out[i+1]=y*p;
    out[i+2]=z*d+swayZ*a;
  }
  geometry.attributes.position.needsUpdate=true;
}

export function deformSpecial(s){
  const mesh=s.specialDecor;if(!mesh||!s.deformation)return;
  deformGeometry(mesh.geometry,mesh.userData.rest,s.deformation);
}

function outlineOf(s){return s.body?.children?.find(o=>o.name==='Comic_outline')||null;}

function setGelPass(s,hide){
  const body=s.body;
  if(body){
    if(body.material){body.material.colorWrite=!hide;body.material.depthWrite=!hide;}
    // Keep the pillow as a shadow-only stand-in so the soft drop shadow matches.
    // The pillow silhouette must not paint a second shadow halo around the art.
    body.castShadow=!hide;
  }
  const o=outlineOf(s);if(o)o.visible=!hide;
  if(s.bubbles)s.bubbles.visible=!hide;
}

function disposeDecor(mesh){
  if(!mesh)return;
  const sh=mesh.userData?.shadow;
  if(sh){sh.parent?.remove(sh);sh.geometry?.dispose?.();sh.material?.dispose?.();}
  mesh.parent?.remove(mesh);
  mesh.geometry?.dispose?.();
  mesh.material?.dispose?.();
}

const shadowVert=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const shadowFrag=`varying vec2 vUv;
void main(){
  vec2 q=abs(vUv*2.-1.)-vec2(.22);
  float e=length(max(q,0.))+min(max(q.x,q.y),0.)-.46;
  float core=1.-smoothstep(-.02,.12,e);
  float pen=1.-smoothstep(-.04,.36,e);
  gl_FragColor=vec4(0.,0.,0.,.42*core+.16*pen);
}`;
function makeShadow(){
  const geo=new THREE.PlaneGeometry(FOOT*1.22,FOOT*1.18,1,1);
  geo.rotateX(-Math.PI/2);
  geo.translate(0,.03,FOOT*0.04);
  const mat=new THREE.ShaderMaterial({
    vertexShader:shadowVert,fragmentShader:shadowFrag,
    transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,
  });
  const mesh=new THREE.Mesh(geo,mat);
  mesh.name='Special_shadow';
  mesh.castShadow=false;mesh.receiveShadow=false;
  mesh.renderOrder=1;mesh.frustumCulled=false;
  mesh.raycast=()=>{};
  return mesh;
}

function attachCard(s,kind){
  const prev=s.specialDecor;
  if(prev?.userData?.special===kind){
    setGelPass(s,true);
    return;
  }
  if(prev)disposeDecor(prev);
  const geometry=makeCardGeometry(kind);
  const mesh=new THREE.Mesh(geometry,cardMaterial(kind));
  mesh.name='Special_card';
  mesh.castShadow=false;
  mesh.receiveShadow=false;
  mesh.renderOrder=3;
  mesh.frustumCulled=false;
  mesh.userData.special=kind;
  mesh.userData.rest=geometry.attributes.position.array.slice();
  mesh.userData.squish=s;
  mesh.onBeforeRender=function(){
    const host=this.userData.squish;
    if(host?.deformation)deformGeometry(this.geometry,this.userData.rest,host.deformation);
  };
  const shadow=makeShadow();
  s.group.add(mesh);
  s.group.add(shadow);
  mesh.userData.shadow=shadow;
  s.specialDecor=mesh;
  setGelPass(s,true);
}

function restoreBody(s){
  if(s.specialDecor){disposeDecor(s.specialDecor);s.specialDecor=null;}
  setGelPass(s,false);
  applyComic(s,s.value);
  const o=outlineOf(s);if(o)o.visible=true;
}

let runtime={job:null,reduced:()=>false};
export function setSpecialRuntime(r){runtime={job:r.job||null,reduced:r.reduced||(()=>false)};}

function cancelFree(s){
  const j=s.userData?.freeJob;if(!j)return;s.userData.freeJob=null;j.cancel?.();
}

function finishFree(s){
  restoreBody(s);
  if(s.label){s.label.visible=true;if(s.label.material&&s.label.material.opacity!=null)s.label.material.opacity=1;}
}

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
    cancelFree(s);
    if(kind)attachCard(s,kind);
    else popFree(s);
    s.special=kind;
  }else if(kind){
    attachCard(s,kind);
  }else{
    setGelPass(s,false);
  }
  labelOf(s,kind);
  if(kind)setGelPass(s,true);
  return prev!==kind;
}
