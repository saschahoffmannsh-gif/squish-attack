// Preview-only: a cute, animatable face sculpted into the live gel cushion.
// Does not ship in /game/. Features live in the same group as the squish so
// they follow the usual sway/squash (same falloff as the air bubbles).
import {THREE} from '../squish/squish-graphics.js?v=play-sharp-1';
import {pillowTopHeight,PARAMETERS} from '../game/original-gel-models.js?v=menu-1';

const G=()=>PARAMETERS.gel;
const HEIGHT=()=>G().height||1.2558;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;

// Even cuter than reference A: slightly larger bead eyes, more forehead,
// blush tighter under the eyes, a tiny packed 'w' mouth.
const LAYOUT={
  eyeX:.26,eyeZ:-.24,eyeR:.155,
  socket:.055,ridge:.028,ridgeY:.07,
  blushX:.36,blushZ:-.06,blushR:.11,
  mouthZ:.02,mouthW:.13,mouthY:.016,
};

const GEO={
  sclera:new THREE.SphereGeometry(1,20,16),
  iris:new THREE.SphereGeometry(1,20,16),
  pupil:new THREE.SphereGeometry(1,16,12),
  spark:new THREE.SphereGeometry(1,10,8),
  lid:new THREE.SphereGeometry(1,16,12,0,Math.PI*2,0,Math.PI/2),
  blush:new THREE.SphereGeometry(1,14,10),
};

function mat(color,opts={}){
  return new THREE.MeshStandardMaterial({
    color,roughness:opts.roughness??.28,metalness:opts.metalness??.04,
    transparent:!!opts.transparent,opacity:opts.opacity??1,
    depthWrite:opts.depthWrite??!opts.transparent,
    emissive:new THREE.Color(opts.emissive||'#000000'),
    emissiveIntensity:opts.emissiveIntensity??0,
    envMapIntensity:opts.env??.7,
  });
}

function deformPoint(x,y,z,def){
  const {sway=0,swayZ=0,squash=0}=def||{};
  const m=Math.pow(Math.max(0,y)/HEIGHT(),1.7);
  const spread=PARAMETERS.motion?.spreadFactor??.85;
  const q=1+squash*m*spread;
  return [x*q+sway*m,y*(1-squash),z*q+swayZ*m];
}

function sculptRest(s){
  const rest=s.rest;if(!rest)return;
  const H=HEIGHT(),ex=LAYOUT.eyeX,ez=LAYOUT.eyeZ,er=LAYOUT.eyeR;
  for(let i=0;i<rest.length;i+=3){
    const x=rest[i],y=rest[i+1],z=rest[i+2];
    if(y<H*.45)continue;
    let dx=0,dy=0,dz=0;
    for(const sx of [-1,1]){
      const px=x-sx*ex,pz=z-ez,d=Math.hypot(px,pz);
      // Soft socket bowl.
      const sock=clamp(1-d/(er*1.15));
      const bowl=Math.pow(sock,1.35)*LAYOUT.socket;
      dy-=bowl*(y/H);
      // Eyelid ridges along the upper arc of each socket.
      const ang=Math.atan2(pz,px),upper=clamp((Math.sin(ang+.2)+.35)/.9);
      const ring=Math.exp(-((d-er*.82)**2)/(er*.07)**2);
      dy+=ring*upper*LAYOUT.ridge;
    }
    // Raised blush puffs.
    for(const sx of [-1,1]){
      const d=Math.hypot(x-sx*LAYOUT.blushX,z-LAYOUT.blushZ);
      const puff=Math.pow(clamp(1-d/(LAYOUT.blushR*1.3)),1.6);
      dy+=puff*.03;dx+=sx*puff*.012;
    }
    rest[i]=x+dx;rest[i+1]=y+dy;rest[i+2]=z+dz;
  }
  const pos=s.body.geometry.attributes.position.array;
  pos.set(rest);s.body.geometry.attributes.position.needsUpdate=true;
  s.body.geometry.computeVertexNormals();
  if(s.normals)s.normals.set(s.body.geometry.attributes.normal.array);
}

function shiftLabel(s,dz=.28){
  const rest=s.label?.userData?.rest;if(!rest)return;
  for(let i=0;i<rest.length;i+=3)rest[i+2]+=dz;
}

function makeEye(side,color){
  const g=new THREE.Group();g.name=side<0?'Face_eyeL':'Face_eyeR';
  const sclera=new THREE.Mesh(GEO.sclera,mat('#fffdf8',{roughness:.22,env:.9}));
  sclera.name='Face_sclera';sclera.castShadow=false;g.add(sclera);
  const iris=new THREE.Mesh(GEO.iris,mat(color,{roughness:.22,metalness:.08,env:1,emissive:color,emissiveIntensity:.08}));
  iris.name='Face_iris';g.add(iris);
  const pupil=new THREE.Mesh(GEO.pupil,mat('#120816',{roughness:.35,env:.2}));
  pupil.name='Face_pupil';g.add(pupil);
  const sparkA=new THREE.Mesh(GEO.spark,mat('#ffffff',{roughness:.1,emissive:'#ffffff',emissiveIntensity:1,env:0}));
  const sparkB=new THREE.Mesh(GEO.spark,mat('#ffffff',{roughness:.1,emissive:'#ffffff',emissiveIntensity:.85,env:0}));
  sparkA.name='Face_sparkA';sparkB.name='Face_sparkB';g.add(sparkA,sparkB);
  const lidMat=null; // assigned later from gel colour
  const upper=new THREE.Mesh(GEO.lid,mat('#888888',{roughness:.32}));
  const lower=new THREE.Mesh(GEO.lid,mat('#888888',{roughness:.32}));
  upper.name='Face_lidU';lower.name='Face_lidL';
  upper.rotation.x=Math.PI;g.add(upper,lower);
  g.userData={sclera,iris,pupil,sparkA,sparkB,upper,lower,side};
  return g;
}

function drawMouth(kind){
  const s=256,c=document.createElement('canvas');c.width=c.height=s;const x=c.getContext('2d');
  x.lineCap='round';x.lineJoin='round';x.strokeStyle='#1a0c14';x.fillStyle='#1a0c14';
  const cx=s/2,cy=s/2;
  if(kind==='smile'){x.lineWidth=20;x.beginPath();x.arc(cx,cy-30,70,.18*Math.PI,.82*Math.PI);x.stroke();}
  else if(kind==='o'){x.lineWidth=18;x.beginPath();x.ellipse(cx,cy,34,44,0,0,Math.PI*2);x.stroke();}
  else if(kind==='laugh'){x.beginPath();x.moveTo(cx-72,cy-20);x.quadraticCurveTo(cx,cy+90,cx+72,cy-20);x.closePath();x.fill();
    x.fillStyle='#ff6b8a';x.beginPath();x.ellipse(cx,cy+22,28,16,0,0,Math.PI*2);x.fill();}
  else{x.lineWidth=18;x.beginPath();x.moveTo(cx-70,cy-16);x.quadraticCurveTo(cx-35,cy+44,cx,cy-6);x.quadraticCurveTo(cx+35,cy+44,cx+70,cy-16);x.stroke();}
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
const MOUTH_TEX={};
function makeMouth(){
  const g=new THREE.Group();g.name='Face_mouth';
  const geo=new THREE.PlaneGeometry(1,1);geo.rotateX(-Math.PI/2);
  const meshes={};
  for(const kind of ['w','smile','o','laugh']){
    MOUTH_TEX[kind]||=drawMouth(kind);
    const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:MOUTH_TEX[kind],transparent:true,depthWrite:false,toneMapped:false}));
    m.visible=kind==='w';m.renderOrder=8;g.add(m);meshes[kind]=m;
  }
  g.userData={meshes,tongue:null};
  return g;
}

export const EXPRESSIONS=['neutral','blink','lookLeft','lookRight','wide','happy','sleepy'];
export const MOUTHS=['w','smile','o','laugh'];

export function attachFace(s,{color='#3db7ff'}={}){
  if(s.face)return s.face;
  sculptRest(s);
  shiftLabel(s,.28);
  const root=new THREE.Group();root.name='Face';
  const eyeL=makeEye(-1,color),eyeR=makeEye(1,color);
  const blushL=new THREE.Mesh(GEO.blush,mat('#ff7aa2',{roughness:.55,transparent:true,opacity:.72,depthWrite:false,emissive:'#ff5a88',emissiveIntensity:.12}));
  const blushR=blushL.clone();blushL.name='Face_blushL';blushR.name='Face_blushR';
  const mouth=makeMouth();
  root.add(eyeL,eyeR,blushL,blushR,mouth);
  s.group.add(root);

  const state={
    blink:0,lookX:0,lookY:0,wide:0,happy:0,sleepy:0,
    mouth:'w',
    auto:null,
  };
  const face={
    root,state,s,
    set(expr,payload){
      if(expr==='mouth'&&MOUTHS.includes(payload)){state.mouth=payload;return this;}
      if(expr==='look'){state.lookX=payload?.x??0;state.lookY=payload?.y??0;return this;}
      // Snap a named pose; values are 0..1 mixes except look.
      state.blink=expr==='blink'?1:0;
      state.wide=expr==='wide'?1:0;
      state.happy=expr==='happy'?1:0;
      state.sleepy=expr==='sleepy'?1:(expr==='neutral'?0:state.sleepy);
      if(expr==='lookLeft'){state.lookX=-1;state.lookY=0;}
      else if(expr==='lookRight'){state.lookX=1;state.lookY=0;}
      else if(expr==='neutral'||expr==='blink'||expr==='wide'||expr==='happy'||expr==='sleepy'){
        if(expr!=='lookLeft'&&expr!=='lookRight'){/* look stays unless neutral */}
        if(expr==='neutral'){state.lookX=0;state.lookY=0;state.sleepy=0;state.wide=0;state.happy=0;state.blink=0;}
      }
      if(expr==='happy')state.mouth='smile';
      if(expr==='wide')state.mouth='o';
      if(expr==='sleepy')state.mouth='w';
      if(expr==='neutral')state.mouth='w';
      return this;
    },
    mix(partial){Object.assign(state,partial);return this;},
    pose(name){return this.set(name);},
    update(){applyPose(s,root,state);},
    dispose(){
      s.group.remove(root);
      root.traverse(o=>{o.geometry?.dispose?.();if(o.material&&!o.material._shared)o.material.dispose?.();});
      s.face=null;
    },
  };
  // Match lid colour to the gel mid.
  const lidColor=s.body?.material?.uniforms?.uLight?.value
    ?s.body.material.uniforms.uLight.value.clone()
    :new THREE.Color(color);
  lidColor.lerp(new THREE.Color('#ffffff'),.08);
  for(const eye of [eyeL,eyeR]){
    eye.userData.upper.material.color.copy(lidColor);
    eye.userData.lower.material.color.copy(lidColor);
    // unique materials already
  }
  s.face=face;
  applyPose(s,root,state);
  return face;
}

function applyPose(s,root,state){
  const def=s.deformation||{sway:0,swayZ:0,squash:0};
  const blink=clamp(state.blink),wide=clamp(state.wide),happy=clamp(state.happy),sleepy=clamp(state.sleepy);
  const lookX=clamp(state.lookX,-1,1),lookY=clamp(state.lookY,-1,1);
  const eyeScale=1+wide*.28-happy*.18-sleepy*.06;
  const eyeOpen=1-blink*.96-happy*.78-sleepy*.45;
  const yOff=pillowTopHeight(0,LAYOUT.eyeZ)+LAYOUT.eyeR*.22;

  const place=(obj,rx,ry,rz,sx,sy,sz)=>{
    const [x,y,z]=deformPoint(rx,ry,rz,def);
    obj.position.set(x,y,z);
    if(sx!=null)obj.scale.set(sx,sy,sz);
  };

  for(const eye of [root.getObjectByName('Face_eyeL'),root.getObjectByName('Face_eyeR')]){
    if(!eye)continue;
    const side=eye.userData.side;
    const cx=side*LAYOUT.eyeX,cz=LAYOUT.eyeZ,cy=yOff;
    // Sit the beads in the sockets and face them toward a slightly elevated
    // board camera (local +Z out of the top, tilted toward +Z world).
    const sunk=cy-LAYOUT.eyeR*.55;
    place(eye,cx,sunk,cz,LAYOUT.eyeR*eyeScale,LAYOUT.eyeR*eyeScale,LAYOUT.eyeR*eyeScale*(.92+wide*.1));
    eye.rotation.set(-Math.PI/2+.42,0,0);
    const {sclera,iris,pupil,sparkA,sparkB,upper,lower}=eye.userData;
    sclera.scale.set(1,1,1);
    const irisS=.7-wide*.02,pupilS=.32-wide*.04;
    iris.scale.setScalar(irisS);iris.position.set(lookX*.18,lookY*.14,.38);
    pupil.scale.setScalar(pupilS);pupil.position.set(lookX*.22,lookY*.16,.58);
    sparkA.scale.setScalar(.18);sparkA.position.set(-.28+lookX*.04,.3,.7);
    sparkB.scale.setScalar(.09);sparkB.position.set(.22,.05,.66);
    const close=1-eyeOpen;
    upper.scale.set(1.12,1.12,.95);
    lower.scale.set(1.12,1.12,.95);
    upper.position.set(0,.2+close*.5+happy*.28,0);
    lower.position.set(0,-.2-close*.35-happy*.22,0);
    upper.rotation.x=Math.PI+close*.15+happy*.4;
    lower.rotation.x=-close*.12-happy*.3;
    upper.visible=close>.04||happy>.15||sleepy>.15;
    lower.visible=happy>.2||close>.45;
    if(sleepy>.3&&!happy){upper.visible=true;upper.position.y=.15+sleepy*.4;}
  }

  const by=pillowTopHeight(LAYOUT.blushX,LAYOUT.blushZ)+.02;
  place(root.getObjectByName('Face_blushL'),-LAYOUT.blushX,by,LAYOUT.blushZ,LAYOUT.blushR*1.05,LAYOUT.blushR*.45,LAYOUT.blushR*.8);
  place(root.getObjectByName('Face_blushR'), LAYOUT.blushX,by,LAYOUT.blushZ,LAYOUT.blushR*1.05,LAYOUT.blushR*.45,LAYOUT.blushR*.8);

  const mouth=root.getObjectByName('Face_mouth');
  if(mouth){
    const my=pillowTopHeight(0,LAYOUT.mouthZ)+LAYOUT.mouthY;
    place(mouth,0,my+.02,LAYOUT.mouthZ,.4,.4,.4);
    const {meshes,tongue}=mouth.userData;
    for(const [kind,mesh] of Object.entries(meshes))mesh.visible=kind===state.mouth;
    if(tongue)tongue.visible=state.mouth==='laugh';
  }
}

export function eyeColorFor(value){
  // Dark glossy iris that still reads on neon gel — a richer cousin of the cushion colour.
  const map={1:'#1a4e8a',2:'#7a1028',3:'#1d6a18',4:'#8a3a0c',5:'#4a1878',6:'#6a4a08',7:'#7a1458',8:'#0a5a58'};
  return map[((Math.max(1,value|0)-1)%8)+1];
}

export function attachFaces(tiles){
  for(const s of tiles){
    if(!s||s.face)continue;
    attachFace(s,{color:eyeColorFor(s.value)});
  }
}

export function updateFaces(tiles){
  for(const s of tiles)s?.face?.update();
}
