// launch-17: einfaches Comic-Aussehen der besonderen Squishes.
//  ice   – weißer Körper, kleines Eis-/Schneeflocken-Abzeichen oben, dunkelblaue Zahl.
//  bound – grauer Körper, kleines Schloss-Abzeichen oben, weiße Zahl.
//  bomb  – schwarzer Körper, kleines Bomben-Abzeichen oben, goldene Zahl
//          (die Sekunden zeigt weiter das DOM-Abzeichen in game.mjs).
// Die Abzeichen folgen der Verformung des Körpers (gleiche Formel wie die Zahl).
import {THREE,PARAMETERS} from '../squish/squish-graphics.js?v=play-sharp-1';
import {pillowTopHeight} from './original-gel-models.js?v=menu-1';
import {INK,setComicValue,setComicLabel} from './comic-style.mjs?v=launch-21';

const ICE=[new THREE.Color('#f6f8fc'),new THREE.Color('#c5d0de')];
const STEEL=[new THREE.Color('#9aa3ad'),new THREE.Color('#4a535c')];
const BLACK=[new THREE.Color('#3d3d48'),new THREE.Color('#12121a')];
const GOLD='#ffc94a';

const textures=new Map();
function tex(kind){
  let t=textures.get(kind);if(t)return t;
  const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');
  x.lineJoin=x.lineCap='round';x.translate(128,128);
  const ink=(fn)=>{x.save();x.strokeStyle=INK;x.fillStyle=INK;fn(14);x.restore();x.save();fn(7);x.restore();};
  if(kind==='ice'){
    // Sechsarmige Schneeflocke, weiß mit Tinten-Kontur.
    ink(w=>{
      x.strokeStyle=w>10?INK:'#ffffff';x.lineWidth=w;x.fillStyle=w>10?INK:'#e8f6ff';
      for(let i=0;i<6;i++){
        x.rotate(Math.PI/3);
        x.beginPath();x.moveTo(0,-86);x.lineTo(0,86);x.moveTo(-22,-58);x.lineTo(0,-36);x.lineTo(22,-58);
        x.moveTo(-16,58);x.lineTo(0,36);x.lineTo(16,58);x.stroke();
      }
      x.beginPath();x.arc(0,0,16,0,Math.PI*2);x.fill();
      if(w<=10){x.strokeStyle=INK;x.lineWidth=3;x.stroke();}
    });
  }else if(kind==='bound'){
    // Vorhängeschloss: goldener Bügel und Körper, Schlüsselloch.
    ink(w=>{
      const fat=w>10;
      x.strokeStyle=fat?INK:GOLD;x.lineWidth=w+2;x.beginPath();x.arc(0,-28,36,Math.PI,0);x.lineTo(36,-4);x.stroke();
      if(!fat){x.strokeStyle='#fff4b8';x.lineWidth=5;x.beginPath();x.arc(0,-28,36,Math.PI,0);x.stroke();}
      const rr=(l,t,bw,bh,r)=>{x.beginPath();x.moveTo(l+r,t);x.arcTo(l+bw,t,l+bw,t+bh,r);x.arcTo(l+bw,t+bh,l,t+bh,r);x.arcTo(l,t+bh,l,t,r);x.arcTo(l,t,l+bw,t,r);x.closePath();};
      rr(-52,-8,104,92,18);x.fillStyle=fat?INK:GOLD;x.fill();
      if(!fat){x.strokeStyle=INK;x.lineWidth=6;x.stroke();
        x.beginPath();x.arc(0,28,12,0,Math.PI*2);x.fillStyle=INK;x.fill();
        x.fillRect(-6,28,12,28);}
    });
  }else if(kind==='bomb'){
    // Runde Bombe, goldene Kappe, kurze Lunte, kleiner Funke.
    ink(w=>{
      const fat=w>10;
      x.beginPath();x.arc(0,18,78,0,Math.PI*2);x.fillStyle=fat?INK:'#1a1a22';x.fill();
      if(!fat){x.strokeStyle=INK;x.lineWidth=8;x.stroke();}
      const cap=()=>{x.beginPath();x.moveTo(-22,-52);x.lineTo(22,-52);x.lineTo(18,-72);x.lineTo(-18,-72);x.closePath();};
      cap();x.fillStyle=fat?INK:GOLD;x.fill();
      x.beginPath();x.moveTo(8,-72);x.quadraticCurveTo(42,-108,58,-96);x.strokeStyle=fat?INK:'#c8a46a';x.lineWidth=fat?w:8;x.stroke();
      if(!fat){
        x.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5,r=i%2?7:16;x.lineTo(58+Math.cos(a)*r,-96+Math.sin(a)*r);}x.closePath();
        x.fillStyle=GOLD;x.strokeStyle=INK;x.lineWidth=4;x.stroke();x.fill();
      }
    });
  }
  t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.anisotropy=8;
  textures.set(kind,t);return t;
}

const SPAN=.5,Z=-.36;
function badgeGeometry(lift){
  const g=new THREE.PlaneGeometry(SPAN,SPAN,12,12),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=-p.getY(i)+Z;p.setXYZ(i,x,pillowTopHeight(x,z)+lift,z);}
  g.computeBoundingSphere();return g;
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
  const geometry=badgeGeometry(.03);
  const material=new THREE.MeshBasicMaterial({map:tex(kind),transparent:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Special_'+kind;mesh.castShadow=false;mesh.renderOrder=4;
  mesh.userData.rest=geometry.attributes.position.array.slice();mesh.raycast=()=>{};
  mesh.onBeforeRender=()=>deform(mesh,s);
  return mesh;
}
function tint(s,kind){
  const u=s.body?.material?.uniforms;if(!u?.uLight)return;
  if(kind==='bound'){u.uLight.value.copy(STEEL[0]);u.uShade.value.copy(STEEL[1]);}
  else if(kind==='ice'){u.uLight.value.copy(ICE[0]);u.uShade.value.copy(ICE[1]);}
  else if(kind==='bomb'){u.uLight.value.copy(BLACK[0]);u.uShade.value.copy(BLACK[1]);}
}
function labelOf(s,kind){
  if(!s.label)return;
  s.label.visible=true;
  if(kind==='ice')setComicLabel(s.label.material,{face:INK,ink:'#ffffff'});
  else if(kind==='bomb')setComicLabel(s.label.material,{face:GOLD,ink:INK});
  else setComicLabel(s.label.material,{face:'#ffffff',ink:INK});
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
/** Kurzes Aufpoppen / Ausblenden des Abzeichens, wenn Eis oder Schloss fällt. */
function popFree(s,mesh){
  cancelFree(s);
  if(!mesh)return;
  if(!runtime.job||runtime.reduced()||s.group?.visible===false){disposeDecor(mesh);return;}
  mesh.material.transparent=true;mesh.material.depthWrite=false;
  const job={
    t0:null,
    update(time){
      if(this.t0==null)this.t0=time;
      const t=Math.min(1,(time-this.t0)/.28),k=1+t*.45;
      mesh.scale.set(k,k,k);mesh.material.opacity=1-t;
      if(t>=1){disposeDecor(mesh);if(s.userData?.freeJob===job)s.userData.freeJob=null;return true;}
      return false;
    },
    cancel(){disposeDecor(mesh);}
  };
  (s.userData||={}).freeJob=job;runtime.job(job);
}

/** Squish auf seine Art stellen (null = normal). Wird nach jedem sync aufgerufen; billig, wenn sich nichts ändert. */
export function applySpecial(s,kind,{freed=false}={}){
  const prev=s.special||null;
  if(prev!==kind){
    const old=s.specialDecor;s.specialDecor=null;
    if(old){
      if(freed&&!kind&&(prev==='ice'||prev==='bound'))popFree(s,old);
      else{cancelFree(s);disposeDecor(old);}
    }
    if(kind){cancelFree(s);s.specialDecor=makeBadge(kind,s);s.group.add(s.specialDecor);}
    if(!kind&&s.body?.material)setComicValue(s.body.material,s.value);
    s.special=kind;
  }
  if(kind)tint(s,kind);
  labelOf(s,kind);
  return prev!==kind;
}
