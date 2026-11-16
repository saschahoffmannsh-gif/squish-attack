// squish-art: Eis, Schloss und Bombe im genehmigten Konzept-Look.
//  Der Körper wird eingefärbt, darüber liegt die Konzept-Textur auf der
//  Oberseite und folgt der Gel-Verformung. Die Zahl bleibt versteckt, solange
//  der Squish gefroren, versperrt oder eine Bombe ist; nach dem Befreien
//  (Eis/Schloss) erscheint die normale Zahl wieder. Der Bomben-Countdown
//  bleibt das DOM-Abzeichen in game.mjs. Keine Idle-Animation (0 fps in Ruhe).
import {THREE,PARAMETERS} from '../squish/squish-graphics.js?v=play-sharp-1';
import {pillowTopHeight} from './original-gel-models.js?v=menu-1';
import {comicColors,setComicValue} from './comic-style.mjs?v=launch-21';

const ICE=[new THREE.Color('#c5ebff'),new THREE.Color('#2f74b0')];
const STONE=[new THREE.Color('#c5c3be'),new THREE.Color('#5a5854')];
const BLACK=[new THREE.Color('#2a2a30'),new THREE.Color('#08080c')];
const ART='squish-art-2';
const URLS={
  ice:new URL(`./assets/specials/ice.webp?v=${ART}`,import.meta.url).href,
  bound:new URL(`./assets/specials/bound.webp?v=${ART}`,import.meta.url).href,
  bomb:new URL(`./assets/specials/bomb.webp?v=${ART}`,import.meta.url).href,
};

const textures=new Map();
function tex(kind){
  let t=textures.get(kind);if(t)return t;
  t=new THREE.TextureLoader().load(URLS[kind]);
  t.colorSpace=THREE.SRGBColorSpace;
  t.generateMipmaps=true;
  t.minFilter=THREE.LinearMipmapLinearFilter;
  t.magFilter=THREE.LinearFilter;
  t.anisotropy=8;
  textures.set(kind,t);return t;
}
// Preload so the first test board already has the art.
tex('ice');tex('bound');tex('bomb');

// Gel width is 1.86; this square sits on the top face without falling off the pillow.
const SPAN=1.66,Z=0,LIFT=.016;
function badgeGeometry(lift){
  const g=new THREE.PlaneGeometry(SPAN,SPAN,20,20),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=-p.getY(i)+Z;p.setXYZ(i,x,pillowTopHeight(x,z)+lift,z);}
  g.computeVertexNormals();g.computeBoundingSphere();return g;
}
function deform(mesh,s){
  const d=s.deformation;if(!d)return;
  const key=d.sway+'|'+d.swayZ+'|'+d.squash;if(mesh.userData.key===key)return;mesh.userData.key=key;
  const rest=mesh.userData.rest,a=mesh.geometry.attributes.position.array,H=PARAMETERS.gel.height,spread=PARAMETERS.motion.spreadFactor;
  for(let i=0;i<a.length;i+=3){const y=rest[i+1],h=Math.pow(Math.max(0,y)/H,1.7),k=1+d.squash*h*spread;
    a[i]=rest[i]*k+d.sway*h;a[i+1]=y*(1-d.squash);a[i+2]=rest[i+2]*k+d.swayZ*h;}
  mesh.geometry.attributes.position.needsUpdate=true;
}
function makeBadge(kind,s){
  const geometry=badgeGeometry(LIFT);
  const material=new THREE.MeshBasicMaterial({
    map:tex(kind),transparent:true,depthWrite:false,toneMapped:false,
    polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,
  });
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Special_'+kind;mesh.castShadow=false;mesh.renderOrder=4;
  mesh.userData.rest=geometry.attributes.position.array.slice();mesh.raycast=()=>{};
  mesh.onBeforeRender=()=>deform(mesh,s);
  return mesh;
}
function outlineOf(s){
  return s.body?.children?.find(o=>o.name==='Comic_outline')||null;
}
function tint(s,kind){
  const u=s.body?.material?.uniforms;if(!u?.uLight)return;
  if(kind==='bound'){u.uLight.value.copy(STONE[0]);u.uShade.value.copy(STONE[1]);}
  else if(kind==='ice'){u.uLight.value.copy(ICE[0]);u.uShade.value.copy(ICE[1]);}
  else if(kind==='bomb'){u.uLight.value.copy(BLACK[0]);u.uShade.value.copy(BLACK[1]);}
  // Die Konzept-Textur bringt das Licht mit; der Comic-Glanzfleck würde doppelt sitzen.
  if(u.uSpot)u.uSpot.value=0;
}
function setSpot(s,on){
  const u=s.body?.material?.uniforms;if(u?.uSpot)u.uSpot.value=on?1:0;
}
function restoreBody(s){
  if(s.body?.material)setComicValue(s.body.material,s.value);
  setSpot(s,true);
}
function labelOf(s,kind){
  if(!s.label)return;
  if(s.userData?.freeJob)return;
  s.label.visible=!kind;
  if(s.label.material&&s.label.material.opacity!=null&&!kind)s.label.material.opacity=1;
}
function showOutline(s,on){
  const o=outlineOf(s);if(o)o.visible=on;
}

let runtime={job:null,reduced:()=>false};
/** Render-Loop und Reduced-Motion vom Graphics-Adapter. */
export function setSpecialRuntime(r){runtime={job:r.job||null,reduced:r.reduced||(()=>false)};}
function disposeDecor(mesh){
  if(!mesh)return;mesh.parent?.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();
}
function cancelFree(s){
  const j=s.userData?.freeJob;if(!j)return;s.userData.freeJob=null;j.cancel?.();
}

/** Overlay ausblenden, Körperfarbe und Zahl einblenden (Eis/Schloss/Bombe). */
function popFree(s,mesh,fromKind){
  cancelFree(s);
  if(!mesh)return;
  const finish=()=>{
    disposeDecor(mesh);
    restoreBody(s);
    showOutline(s,true);
    if(s.label){s.label.visible=true;if(s.label.material&&s.label.material.opacity!=null)s.label.material.opacity=1;}
  };
  if(!runtime.job||runtime.reduced()||s.group?.visible===false){finish();return;}
  mesh.material.transparent=true;mesh.material.depthWrite=false;
  const u=s.body?.material?.uniforms;
  const fromLight=u?.uLight?.value.clone(),fromShade=u?.uShade?.value.clone();
  const to=comicColors(s.value||1);
  if(s.label){s.label.visible=true;if(s.label.material&&s.label.material.opacity!=null)s.label.material.opacity=0;}
  const job={
    t0:null,
    update(time){
      if(!mesh.parent){finish();if(s.userData?.freeJob===job)s.userData.freeJob=null;return true;}
      if(this.t0==null)this.t0=time;
      const t=Math.min(1,(time-this.t0)/.4),e=t*t*(3-2*t);
      const k=1+e*.22;
      mesh.scale.set(k,k,k);mesh.material.opacity=1-e;
      if(fromLight&&u?.uLight){u.uLight.value.copy(fromLight).lerp(to.light,e);u.uShade.value.copy(fromShade).lerp(to.shade,e);}
      if(s.label?.material&&s.label.material.opacity!=null)s.label.material.opacity=e;
      if(e>=1){finish();if(s.userData?.freeJob===job)s.userData.freeJob=null;return true;}
      return false;
    },
    cancel(){finish();}
  };
  (s.userData||={}).freeJob=job;runtime.job(job);
}

/** Squish auf seine Art stellen (null = normal). Wird nach jedem sync aufgerufen; billig, wenn sich nichts ändert. */
export function applySpecial(s,kind,{freed=false}={}){
  const prev=s.special||null;
  if(prev!==kind){
    const old=s.specialDecor;s.specialDecor=null;
    if(old){
      if(!kind)popFree(s,old,prev);
      else{cancelFree(s);disposeDecor(old);}
    }
    if(kind){cancelFree(s);s.specialDecor=makeBadge(kind,s);s.group.add(s.specialDecor);}
    if(!kind&&!s.userData?.freeJob)restoreBody(s);
    s.special=kind;
  }
  if(kind){tint(s,kind);showOutline(s,false);}
  else if(!s.userData?.freeJob)showOutline(s,true);
  labelOf(s,kind);
  return prev!==kind;
}
