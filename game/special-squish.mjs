// launch-16: Aussehen der besonderen Squishes im Comic-Stil.
//  ice   – Körper eisblau aufgehellt, Frost-Kappe mit Rissen und Glitzer obenauf, Zahl bleibt lesbar.
//  bound – Körper stahlgrau, keine Zahl, zwei gekreuzte Ketten mit Vorhängeschloss.
//  bomb  – Körper in seiner Zahlfarbe, schwarzer Bomben-Ring am Rand + Lunte mit Funke
//          (die Sekunden zeigt ein kleines DOM-Abzeichen, game.mjs – kostet keine WebGL-Frames).
// Die Deko folgt der Verformung des Körpers (gleiche Formel wie die Zahl), also wackelt sie mit.
import {THREE,PARAMETERS} from '../squish/squish-graphics.js?v=play-sharp-1';
import {pillowTopHeight} from './original-gel-models.js?v=menu-1';
import {INK,comicColors,setComicValue} from './comic-style.mjs?v=launch-16';

const ICE=[new THREE.Color('#eafaff'),new THREE.Color('#8ccbec')];
const STEEL=[new THREE.Color('#a9b3bf'),new THREE.Color('#5d6876')];
const textures=new Map();
function tex(kind){
  let t=textures.get(kind);if(t)return t;
  const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');
  x.lineJoin=x.lineCap='round';
  if(kind==='ice'){
    // Frost-Rand (innen klar, damit die Zahl lesbar bleibt), Risse, Glitzer.
    const g=x.createRadialGradient(128,128,58,128,128,128);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.62,'rgba(235,250,255,.35)');g.addColorStop(1,'rgba(255,255,255,.9)');
    x.fillStyle=g;x.fillRect(0,0,256,256);
    const crack=(pts,w)=>{x.beginPath();pts.forEach(([px,py],i)=>i?x.lineTo(px,py):x.moveTo(px,py));x.lineWidth=w+5;x.strokeStyle=INK;x.stroke();x.lineWidth=w;x.strokeStyle='#ffffff';x.stroke();};
    crack([[18,40],[52,62],[60,96],[44,120]],4);crack([[52,62],[86,48]],3);
    crack([[238,200],[200,186],[188,222],[206,244]],4);crack([[200,186],[214,160]],3);
    crack([[236,46],[206,70],[214,96]],3);
    const spark=(cx,cy,r)=>{x.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,rr=i%2?r*.32:r;x.lineTo(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr);}x.closePath();x.fillStyle=INK;x.lineWidth=5;x.strokeStyle=INK;x.stroke();x.fillStyle='#ffffff';x.fill();};
    spark(62,200,20);spark(206,128,13);spark(150,30,11);
  } else if(kind==='bound'){
    // Zwei gekreuzte Ketten (Glieder: Tinte + Stahl), Vorhängeschloss in der Mitte.
    const link=(cx,cy,a,long)=>{x.save();x.translate(cx,cy);x.rotate(a);
      x.beginPath();x.ellipse(0,0,long?22:14,long?11:14,0,0,Math.PI*2);x.lineWidth=15;x.strokeStyle=INK;x.stroke();x.lineWidth=7;x.strokeStyle='#dfe6ee';x.stroke();x.restore();};
    for(const [a,dir] of [[Math.PI/4,1],[-Math.PI/4,-1]])for(let i=-4;i<=4;i++){if(Math.abs(i)<1)continue;const d=i*25;link(128+d*Math.cos(a),128+d*Math.sin(a),a+(i%2?Math.PI/2:0)*0,i%2===0);}
    x.lineWidth=12;x.strokeStyle=INK;x.beginPath();x.arc(128,112,22,Math.PI,0);x.stroke();x.lineWidth=6;x.strokeStyle='#c9d2dc';x.stroke();
    const rr=(l,t,w,h,r)=>{x.beginPath();x.moveTo(l+r,t);x.arcTo(l+w,t,l+w,t+h,r);x.arcTo(l+w,t+h,l,t+h,r);x.arcTo(l,t+h,l,t,r);x.arcTo(l,t,l+w,t,r);x.closePath();};rr(94,108,68,54,12);x.fillStyle=INK;x.fill();rr(100,114,56,42,8);x.fillStyle='#ffc21f';x.fill();
    x.beginPath();x.arc(128,131,7,0,Math.PI*2);x.fillStyle=INK;x.fill();x.fillRect(125,132,6,14);
  } else if(kind==='bomb'){
    // Schwarzer Bomben-Ring mit Nieten, Lunte oben rechts mit Funke.
    x.beginPath();x.arc(128,128,112,0,Math.PI*2);x.arc(128,128,84,0,Math.PI*2,true);x.fillStyle=INK;x.fill('evenodd');
    x.beginPath();x.arc(128,128,104,0,Math.PI*2);x.lineWidth=4;x.strokeStyle='#4a3f4a';x.stroke();
    for(let i=0;i<10;i++){const a=i*Math.PI/5+.3;x.beginPath();x.arc(128+Math.cos(a)*98,128+Math.sin(a)*98,5,0,Math.PI*2);x.fillStyle='#9c8f9c';x.fill();}
    x.beginPath();x.moveTo(196,60);x.quadraticCurveTo(222,30,240,26);x.lineWidth=14;x.strokeStyle=INK;x.stroke();x.lineWidth=7;x.strokeStyle='#c8a46a';x.stroke();
    x.beginPath();for(let i=0;i<14;i++){const a=i*Math.PI/7,r=i%2?8:22;x.lineTo(238+Math.cos(a)*r,24+Math.sin(a)*r);}x.closePath();x.lineWidth=5;x.strokeStyle=INK;x.stroke();x.fillStyle='#ffd34d';x.fill();
    x.beginPath();x.arc(238,24,6,0,Math.PI*2);x.fillStyle='#fff8d0';x.fill();
  }
  t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.anisotropy=8;
  textures.set(kind,t);return t;
}
const SPAN=1.62;
function decalGeometry(lift){
  const g=new THREE.PlaneGeometry(SPAN,SPAN,24,24),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=-p.getY(i);p.setXYZ(i,x,pillowTopHeight(x,z)+lift,z);}
  g.computeBoundingSphere();return g;
}
// Gleiche Verformung wie die Zahl (Anker ~ Höhe^1.7, Stauchen, Seitwärts-Wackeln).
function deform(mesh,s){
  const d=s.deformation;if(!d)return;
  const key=d.sway+'|'+d.swayZ+'|'+d.squash;if(mesh.userData.key===key)return;mesh.userData.key=key;
  const rest=mesh.userData.rest,a=mesh.geometry.attributes.position.array,H=PARAMETERS.gel.height,spread=PARAMETERS.motion.spreadFactor;
  for(let i=0;i<a.length;i+=3){const y=rest[i+1],h=Math.pow(Math.max(0,y)/H,1.7),k=1+d.squash*h*spread;
    a[i]=rest[i]*k+d.sway*h;a[i+1]=y*(1-d.squash);a[i+2]=rest[i+2]*k+d.swayZ*h;}
  mesh.geometry.attributes.position.needsUpdate=true;
}
function makeDecal(kind,s){
  const geometry=decalGeometry(kind==='ice'?.03:.026);
  const material=new THREE.MeshBasicMaterial({map:tex(kind),transparent:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Special_'+kind;mesh.castShadow=false;mesh.renderOrder=kind==='ice'?3:2;
  mesh.userData.rest=geometry.attributes.position.array.slice();mesh.raycast=()=>{};
  mesh.onBeforeRender=()=>deform(mesh,s);
  return mesh;
}
function tint(s,kind){
  const u=s.body?.material?.uniforms;if(!u?.uLight)return;
  if(kind==='bound'){u.uLight.value.copy(STEEL[0]);u.uShade.value.copy(STEEL[1]);}
  else if(kind==='ice'){const c=comicColors(s.value);u.uLight.value.copy(c.light).lerp(ICE[0],.62);u.uShade.value.copy(c.shade).lerp(ICE[1],.6);}
}
/** Squish auf seine Art stellen (null = normal). Wird nach jedem sync aufgerufen; billig, wenn sich nichts ändert. */
export function applySpecial(s,kind){
  const prev=s.special||null;
  if(prev!==kind){
    if(s.specialDecor){s.group.remove(s.specialDecor);s.specialDecor.geometry.dispose();s.specialDecor.material.dispose();s.specialDecor=null;}
    if(kind){s.specialDecor=makeDecal(kind,s);s.group.add(s.specialDecor);}
    if(!kind&&s.body?.material)setComicValue(s.body.material,s.value);
    s.special=kind;
  }
  if(kind)tint(s,kind);
  if(s.label)s.label.visible=kind!=='bound';
  return prev!==kind;
}
