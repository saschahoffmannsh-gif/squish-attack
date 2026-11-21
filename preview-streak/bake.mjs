// Offscreen baker: real launch-38 gel tiles + a 3D gift box, transparent PNGs.
import {createSquishGraphics,THREE} from '../squish/squish-graphics.js?v=play-sharp-1';
import {buildSquishy,initializeMotion,bindGelOptics,PARAMETERS as HUD} from '../game/original-gel-models.js?v=menu-1';
import {comicBodyMaterial,applyComic} from '../game/comic-style.mjs?v=launch-38';
import {applyGelSoftness} from '../game/gel-softness.mjs?v=launch-38';
import {applyNeonGlassLighting} from '../game/gel-lighting.mjs?v=launch-38';
import {configureRenderQuality} from '../game/render-quality.mjs?v=launch-38';
import {PARAMETERS} from '../squish/squish-graphics.js?v=play-sharp-1';

applyNeonGlassLighting(PARAMETERS,HUD);
applyGelSoftness(PARAMETERS,HUD);

const host=document.getElementById('stage');
const gfx=createSquishGraphics(host,{tiles:[],bindPointer:false,autoStart:false,alpha:true});
gfx.bloom.enabled=false;
configureRenderQuality(gfx);
const renderer=gfx.renderer;
renderer.setClearColor(0x000000,0);
renderer.setPixelRatio(1);
renderer.setSize(512,512,false);
if(gfx.board)gfx.board.visible=false;
if(gfx.caustics){try{gfx.caustics.visible=false;gfx.caustics.dispose?.();}catch{}}
gfx.scene.background=null;
gfx.scene.fog=null;
renderer.setClearColor(0x000000,0);
renderer.setClearAlpha(0);
gfx.scene.traverse(o=>{
  const n=o.name||'';
  if(/water|board|caustic|floor|backdrop/i.test(n)) o.visible=false;
});
console.log('children', gfx.scene.children.map(c=>({name:c.name||c.type,vis:c.visible})));

function frameGel(){
  gfx.camera.position.set(0,3.9,3.35);
  gfx.camera.near=.2;gfx.camera.far=40;gfx.camera.fov=28;
  gfx.camera.lookAt(0,.55,0);
  gfx.camera.updateProjectionMatrix();
}
function frameGift(){
  gfx.camera.position.set(1.6,2.6,3.8);
  gfx.camera.near=.2;gfx.camera.far=40;gfx.camera.fov=26;
  gfx.camera.lookAt(0,.55,0);
  gfx.camera.updateProjectionMatrix();
}

function buildTile(value,{ghost=false}={}){
  const material=comicBodyMaterial(value);
  if(ghost){
    const u=material.uniforms;
    const grey=new THREE.Color('#7a8298');
    const lo=new THREE.Color('#2a3144');
    const hi=new THREE.Color('#c5cbd8');
    u.uLight.value.copy(grey);u.uShade.value.copy(lo);if(u.uHi)u.uHi.value.copy(hi);
  }
  const s=buildSquishy(value,material);
  s.value=value;
  applyComic(s,value);
  initializeMotion(s);bindGelOptics(s);
  if(s.bubbles)s.bubbles.visible=false;
  if(s.label)s.label.visible=false;
  s.group.position.set(0,0,0);
  s.group.scale.setScalar(1.05);
  return s;
}

function goldMat(){
  return new THREE.MeshStandardMaterial({
    color:0xffd25a, roughness:.28, metalness:.72,
    emissive:0x6a4200, emissiveIntensity:.18,
  });
}
function bodyMat(){
  return new THREE.MeshStandardMaterial({
    color:0xc81e3a, roughness:.38, metalness:.12,
    emissive:0x3a0008, emissiveIntensity:.08,
  });
}
function makeGift(){
  const g=new THREE.Group();
  const gold=goldMat(), red=bodyMat();
  const body=new THREE.Mesh(new THREE.BoxGeometry(1.15,.9,1.15),red);
  body.position.y=.48;
  const lid=new THREE.Mesh(new THREE.BoxGeometry(1.28,.26,1.28),gold);
  lid.position.y=.98;
  const ribV=new THREE.Mesh(new THREE.BoxGeometry(.22,1.16,1.18),gold);
  ribV.position.y=.55;
  const ribH=new THREE.Mesh(new THREE.BoxGeometry(1.18,1.16,.22),gold);
  ribH.position.y=.55;
  // bow loops
  const loop=new THREE.TorusGeometry(.22,.08,12,24);
  const l1=new THREE.Mesh(loop,gold); l1.rotation.set(.2,0,Math.PI/2); l1.position.set(-.22,1.22,.02); l1.scale.set(1,1,.7);
  const l2=new THREE.Mesh(loop,gold); l2.rotation.set(.2,0,-Math.PI/2); l2.position.set(.22,1.22,.02); l2.scale.set(1,1,.7);
  const knot=new THREE.Mesh(new THREE.SphereGeometry(.12,16,12),gold); knot.position.set(0,1.18,0);
  const tail1=new THREE.Mesh(new THREE.BoxGeometry(.08,.28,.16),gold); tail1.position.set(-.1,1.02,.18); tail1.rotation.z=.5; tail1.rotation.x=.4;
  const tail2=new THREE.Mesh(new THREE.BoxGeometry(.08,.28,.16),gold); tail2.position.set(.1,1.02,.18); tail2.rotation.z=-.5; tail2.rotation.x=.4;
  g.add(body,lid,ribV,ribH,l1,l2,knot,tail1,tail2);
  g.rotation.y=.35;
  return g;
}

function knockOutBg(glCanvas){
  const canvas=document.createElement('canvas');
  canvas.width=glCanvas.width;canvas.height=glCanvas.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(glCanvas,0,0);
  const {width:w,height:h}=canvas;
  const img=ctx.getImageData(0,0,w,h);
  const d=img.data;
  const samples=[[0,0],[w-1,0],[0,h-1],[w-1,h-1],[2,2],[w-3,2]];
  let r=0,g=0,b=0;
  for(const [x,y] of samples){const i=(y*w+x)*4;r+=d[i];g+=d[i+1];b+=d[i+2];}
  r/=samples.length;g/=samples.length;b/=samples.length;
  const close=(cr,cg,cb)=>{
    const dr=cr-r,dg=cg-g,db=cb-b;
    const dist=Math.sqrt(dr*dr+dg*dg+db*db);
    const max=Math.max(cr,cg,cb),min=Math.min(cr,cg,cb);
    const sat=max===0?0:(max-min)/max;
    return dist<28 && sat<0.18 && max<110;
  };
  for(let i=0;i<d.length;i+=4){
    if(close(d[i],d[i+1],d[i+2])) d[i+3]=0;
  }
  // feather: if almost-bg and a transparent neighbor, reduce alpha
  const copy=new Uint8ClampedArray(d);
  const idx=(x,y)=> (y*w+x)*4;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=idx(x,y);
    if(copy[i+3]===0) continue;
    let t=0,n=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      n++; if(copy[idx(x+dx,y+dy)+3]===0) t++;
    }
    if(t>=3){
      const cr=d[i],cg=d[i+1],cb=d[i+2];
      const max=Math.max(cr,cg,cb),min=Math.min(cr,cg,cb);
      const sat=max===0?0:(max-min)/max;
      if(sat<0.28) d[i+3]=Math.max(0,d[i+3]-t*40);
    }
  }
  ctx.putImageData(img,0,0);
  return canvas;
}
let lastShot=null;
function renderShot(){
  renderer.setClearColor(0x000000,0);
  renderer.setClearAlpha(0);
  gfx.scene.background=null;
  gfx.render(0);
  lastShot=knockOutBg(renderer.domElement);
}
function png(){
  return (lastShot||renderer.domElement).toDataURL('image/png');
}

const shots={};
const gel=buildTile(1);
gfx.scene.add(gel.group);

for(const v of [1,2,3,4,5,6,7]){
  const material=comicBodyMaterial(v);
  const old=gel.body.material;gel.body.material=material;
  if(old&&old!==material)old.dispose?.();
  applyComic(gel,v);
  if(gel.label)gel.label.visible=false;
  frameGel();
  renderShot();
  shots[`gel-${v}`]=png();
}

// ghost
{
  const material=comicBodyMaterial(1);
  const u=material.uniforms;
  u.uLight.value.set('#8a90a4');u.uShade.value.set('#2c3346');if(u.uHi)u.uHi.value.set('#d0d5e0');
  const old=gel.body.material;gel.body.material=material;
  if(old&&old!==material)old.dispose?.();
  if(gel.label)gel.label.visible=false;
  frameGel();
  renderShot();
  shots['gel-ghost']=png();
}
gfx.scene.remove(gel.group);

const gift=makeGift();
gfx.scene.add(gift);
frameGift();
renderShot();
shots['gift']=png();
// open-ish: lid lifted
gift.children[1].position.y=1.22;
gift.children[1].position.x=.12;
gift.children[1].rotation.z=.22;
gift.children[1].rotation.x=-.08;
frameGift();
renderShot();
shots['gift-open']=png();

window.STREAK_SPRITES=shots;
document.title='bake-ready '+Object.keys(shots).join(',');
console.log('baked',Object.keys(shots));
