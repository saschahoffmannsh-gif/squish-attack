// squish-art: Sonder-Squishes sind dasselbe Gel-Modell wie normale Steine
//  (Silhouette, Tiefe, Kontur, Schatten, Wobble). Darauf liegt ein
//  kachelbares Material (Eis / Stein / schwarz), das über alle Seiten
//  läuft, plus ein Symbol-Decal nur auf der Oberseite. Das Schloss
//  ist in Ketten gelegt: modellierte 3D-Glieder über die Oberseite
//  und die Seiten; beim Befreien zerplatzen die Ketten.
import {THREE,PARAMETERS} from '../squish/squish-graphics.js?v=play-sharp-1';
import {applyComic,LIGHT} from './comic-style.mjs?v=squish-art-6';

const ART='squish-art-8c';
const url=name=>new URL(`./assets/specials/${name}.webp?v=${ART}`,import.meta.url).href;

// style: 0 Eis, 1 Schloss/Joker, 2 Bombe
// Eis und Bombe: gleiche Werte wie v5 (squish-art-7c). Nur das Schloss ändert sich.
const KINDS={
  ice:{albedo:'ice-albedo',decal:'ice-decal',band:null,spot:1,tile:1.12,decalScale:.68,crust:1.05,shift:.04,style:0},
  bound:{albedo:'stone-albedo',decal:null,band:null,spot:.18,tile:1.0,decalScale:.68,crust:0,shift:.04,style:1,stoneDark:.88,chains:true},
  bomb:{albedo:'black-albedo',decal:'bomb-decal',band:null,spot:.95,tile:1.0,decalScale:.84,crust:0,shift:.04,style:2},
  joker:{albedo:'stone-albedo',decal:null,band:null,spot:.18,tile:1.0,decalScale:.68,crust:0,shift:.04,style:1,stoneDark:.88,chains:false},
};

// Boden-Schimmer unter Sonder-Squishes, passend zum Material (nicht zur Zahl).
const FLOOR_HEX={ice:0x6ec8f0,bound:0x7a828c,joker:0x7a828c,bomb:0x4a2a16};
export function specialFloorColor(tile,color){
  const k=tile&&tile.special;
  if(k&&FLOOR_HEX[k]!=null){color.setHex(FLOOR_HEX[k]);return true;}
  return false;
}

const textures=new Map();
function tex(name,{repeat=false}={}){
  const key=name+'|'+(repeat?'r':'c');
  let t=textures.get(key);if(t)return t;
  t=new THREE.TextureLoader().load(url(name));
  t.colorSpace=THREE.SRGBColorSpace;
  t.generateMipmaps=true;
  t.minFilter=THREE.LinearMipmapLinearFilter;
  t.magFilter=THREE.LinearFilter;
  t.anisotropy=16;
  t.flipY=false;
  if(repeat){t.wrapS=t.wrapT=THREE.RepeatWrapping;}
  else{t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;}
  textures.set(key,t);return t;
}

const bodyVert=`varying vec3 vN;varying vec3 vP;
void main(){vP=position;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

const bodyFrag=`uniform sampler2D uAlbedo,uDecal,uBand;
uniform vec3 uL;
uniform float uSpot,uTile,uDecalScale,uDecalShift,uCrust,uHasBand,uBandZ,uBandW,uWidth,uRadius,uHeight,uStyle,uHasDecal,uStoneDark,uChains;
varying vec3 vN;varying vec3 vP;
float aastep(float e,float x){float w=max(fwidth(x),1e-4)*.75;return smoothstep(e-w,e+w,x);}
float sdRoundBox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return min(max(q.x,q.y),0.)+length(max(q,0.))-r;}
float rivet(vec2 q,vec2 p,float rad){
  float d=length(q-p);
  return 1.-smoothstep(rad*.78,rad,d);
}
void main(){
  float nl=length(vN);vec3 N=nl>1e-5?vN/nl:vec3(0.,1.,0.);
  vec3 an=abs(N);an=pow(an,vec3(4.));an/=max(an.x+an.y+an.z,1e-5);
  float ts=uTile/max(uWidth,1e-3);
  vec3 cx=texture2D(uAlbedo,vec2(vP.z,vP.y)*ts).rgb;
  vec3 cy=texture2D(uAlbedo,vec2(vP.x,vP.z)*ts).rgb;
  vec3 cz=texture2D(uAlbedo,vec2(vP.x,vP.y)*ts).rgb;
  vec3 mat=cx*an.x+cy*an.y+cz*an.z;
  float top=smoothstep(.45,.78,N.y);
  float halfW=uWidth*.5;

  // Frostkruste am Rand (Eis) — stärker an den Kanten, wie im Konzept.
  if(uCrust>0.){
    float d=sdRoundBox(vP.xz,vec2(halfW,halfW),uRadius);
    float crust=smoothstep(-.18,-.025,d)*(1.-smoothstep(.0,.08,d))*smoothstep(.18,.78,N.y);
    float corner=smoothstep(.45,.82,max(abs(vP.x),abs(vP.z))/halfW);
    crust*=.75+.4*corner;
    float sideFrost=(1.-smoothstep(.5,.92,N.y))*smoothstep(.14,.58,N.y)*smoothstep(-.10,.03,-d);
    vec3 frost=vec3(.90,.96,1.);
    mat=mix(mat,mix(mat,frost,.82),(crust*.7+sideFrost*.32)*uCrust);
  }

  // Schloss-Band: Riemen über die Oberseite (links-rechts) und die Seiten hinunter.
  // Ebene konstantes Z, Padlock sitzt auf dem Band.
  if(uHasBand>0.){
    float bz=(vP.z-uBandZ)/max(uBandW,.001);
    float bMask=1.-smoothstep(.45,.72,abs(bz));
    // am Boden in der Mulde ausblenden
    bMask*=smoothstep(.08,.22,vP.y);
    float bandU=mix(vP.y,vP.x,smoothstep(.35,.8,N.y))/max(uWidth,1e-3);
    vec3 grain=texture2D(uBand,vec2(bandU,bz*.45+.5)).rgb;
    float highlight=exp(-pow((bz+0.34)*3.8,2.));
    float shadow=smoothstep(-0.08,0.7,bz);
    float rim=smoothstep(.38,.66,abs(bz));
    vec3 metal=mix(vec3(.46,.48,.54),grain,.45);
    metal=mix(metal,vec3(.84,.86,.90),highlight*.55);
    metal=mix(metal,vec3(.22,.23,.26),shadow*.55);
    metal=mix(metal,vec3(.13,.14,.16),rim*.8);
    mat=mix(mat,metal,bMask*uHasBand);
  }

  if(uStoneDark>0.)mat*=uStoneDark;

  // Kontakt-Schatten unter den Ketten (Kreuz auf der Oberseite, weiter die Seiten hinunter).
  if(uChains>0.){
    float stripX=1.-smoothstep(.06,.15,abs(vP.x));
    float stripZ=1.-smoothstep(.06,.15,abs(vP.z));
    float ao=max(stripX,stripZ)*smoothstep(.14,.36,vP.y);
    mat*=1.-ao*.55;
  }

  // Symbol nur auf der Oberseite, zentriert in XZ.
  vec2 tUv=vP.xz/uWidth+.5;
  tUv.y-=uDecalShift;
  vec2 dUv=(tUv-.5)/max(uDecalScale,.05)+.5;
  float inDec=step(0.,dUv.x)*step(0.,dUv.y)*step(dUv.x,1.)*step(dUv.y,1.);
  vec4 dec=texture2D(uDecal,dUv);
  // Leichte Prägung am Decal-Rand (Eis-Schneeflocke klarer, allgemein knackiger).
  float ax=dFdx(dec.a),ay=dFdy(dec.a);
  float emb=clamp(ax*.8-ay*1.3,-1.,1.);
  vec3 decRgb=dec.rgb*(1.+emb*.28);
  mat=mix(mat,decRgb,dec.a*inDec*top*uHasDecal);

  // Gleiche Cel-Modellierung wie normale Squishes, Seiten etwas dunkler.
  float nd=dot(N,normalize(uL))*.5+.5;
  float lit=mix(.62,1.,aastep(.5,nd));
  float topLit=mix(.78,1.,smoothstep(-.05,.9,N.y));
  vec3 c=mat*lit*topLit;

  // Bombe: sichtbare Seitenkante, Nieten, leichtes orangefarbenes Glimmen.
  if(uStyle>1.5){
    float edge=pow(1.-smoothstep(.12,.88,N.y),1.35);
    float lip=smoothstep(.18,.42,N.y)*(1.-smoothstep(.52,.78,N.y))*smoothstep(-.05,.55,N.z);
    c+=vec3(.11,.12,.14)*(edge*.18+lip*.10);
    vec2 q=vP.xz/halfW;
    vec2 rp0=vec2(-.64,-.58),rp1=vec2(-.74,-.02),rp2=vec2(-.62,.60),rp3=vec2(.64,.60),rp4=vec2(.74,.02);
    vec2 rdir;float rm,rs;vec3 rv;
    rm=rivet(q,rp0,.058)*top;rdir=q-rp0;rs=clamp(dot(normalize(rdir+1e-4),vec2(-.55,-.62)),-1.,1.);
    rv=vec3(.09,.10,.12)+vec3(.22,.23,.26)*max(rs,0.);rv=mix(rv,vec3(.72,.74,.78),smoothstep(.62,.92,rs)*smoothstep(.0,.022,length(rdir)));c=mix(c,rv,rm);
    rm=rivet(q,rp1,.058)*top;rdir=q-rp1;rs=clamp(dot(normalize(rdir+1e-4),vec2(-.55,-.62)),-1.,1.);
    rv=vec3(.09,.10,.12)+vec3(.22,.23,.26)*max(rs,0.);rv=mix(rv,vec3(.72,.74,.78),smoothstep(.62,.92,rs)*smoothstep(.0,.022,length(rdir)));c=mix(c,rv,rm);
    rm=rivet(q,rp2,.058)*top;rdir=q-rp2;rs=clamp(dot(normalize(rdir+1e-4),vec2(-.55,-.62)),-1.,1.);
    rv=vec3(.09,.10,.12)+vec3(.22,.23,.26)*max(rs,0.);rv=mix(rv,vec3(.72,.74,.78),smoothstep(.62,.92,rs)*smoothstep(.0,.022,length(rdir)));c=mix(c,rv,rm);
    rm=rivet(q,rp3,.058)*top;rdir=q-rp3;rs=clamp(dot(normalize(rdir+1e-4),vec2(-.55,-.62)),-1.,1.);
    rv=vec3(.09,.10,.12)+vec3(.22,.23,.26)*max(rs,0.);rv=mix(rv,vec3(.72,.74,.78),smoothstep(.62,.92,rs)*smoothstep(.0,.022,length(rdir)));c=mix(c,rv,rm);
    rm=rivet(q,rp4,.058)*top;rdir=q-rp4;rs=clamp(dot(normalize(rdir+1e-4),vec2(-.55,-.62)),-1.,1.);
    rv=vec3(.09,.10,.12)+vec3(.22,.23,.26)*max(rs,0.);rv=mix(rv,vec3(.72,.74,.78),smoothstep(.62,.92,rs)*smoothstep(.0,.022,length(rdir)));c=mix(c,rv,rm);
    // warmes Glimmen unter dem Symbol (aus dem Decal-Orange)
    float glow=dec.a*inDec*top*smoothstep(.15,.7,dec.r-dec.b);
    c=mix(c,max(c,vec3(.55,.28,.08)),glow*.22);
  }

  vec2 qS=vP.xz/(uWidth*.5);
  float g=length((qS-vec2(-.52,-.46))*vec2(1.,1.7)),g2=length(qS-vec2(-.2,-.62));
  float spot=max(1.-aastep(.17*max(uSpot,.001),g),1.-aastep(.065*max(uSpot,.001),g2))*aastep(.6,N.y);
  gl_FragColor=vec4(c,1.);
  #include <tonemapping_fragment>
  gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(1.),spot*uSpot);
  #include <colorspace_fragment>
}`;

const dummyBand=(()=>{const t=tex('band',{repeat:true});return t;})();
const dummyDecal=(()=>{const t=tex('ice-decal',{repeat:false});return t;})();

function specialBodyMaterial(kind){
  const cfg=KINDS[kind];if(!cfg)return null;
  const mat=new THREE.ShaderMaterial({
    uniforms:{
      uAlbedo:{value:tex(cfg.albedo,{repeat:true})},
      uDecal:{value:cfg.decal?tex(cfg.decal,{repeat:false}):dummyDecal},
      uBand:{value:cfg.band?tex(cfg.band,{repeat:true}):dummyBand},
      uL:{value:LIGHT.clone()},
      uSpot:{value:cfg.spot},
      uTile:{value:cfg.tile},
      uDecalScale:{value:cfg.decalScale},
      uDecalShift:{value:cfg.shift||0},
      uCrust:{value:cfg.crust},
      uHasBand:{value:cfg.band?1:0},
      uBandZ:{value:cfg.bandZ||0},
      uBandW:{value:cfg.bandW||.14},
      uWidth:{value:PARAMETERS.gel.width},
      uRadius:{value:PARAMETERS.gel.radius},
      uHeight:{value:PARAMETERS.gel.height},
      uStyle:{value:cfg.style||0},
      uHasDecal:{value:cfg.decal?1:0},
      uStoneDark:{value:cfg.stoneDark||0},
      uChains:{value:cfg.chains?1:0},
    },
    vertexShader:bodyVert,fragmentShader:bodyFrag,toneMapped:true,
  });
  mat.name='Special_body';
  mat.userData.special=kind;
  return mat;
}

function outlineOf(s){return s.body?.children?.find(o=>o.name==='Comic_outline')||null;}

function disposeDecor(mesh){
  if(!mesh)return;
  const sh=mesh.userData?.shadow;
  if(sh){sh.parent?.remove(sh);sh.geometry?.dispose?.();sh.material?.dispose?.();}
  mesh.parent?.remove(mesh);
  mesh.geometry?.dispose?.();
  mesh.material?.dispose?.();
}

// --- Ketten -----------------------------------------------------------
const GEL=PARAMETERS.gel;
const LINK_R=.112,LINK_TUBE=.042,LINK_STEP=LINK_R*1.32;
const Y_FOOT=.30;
let sharedLinkGeo=null,sharedLinkMat=null;
const _q=new THREE.Quaternion(),_from=new THREE.Vector3(0,0,1),_axis=new THREE.Vector3();

function linkGeometry(){
  if(!sharedLinkGeo)sharedLinkGeo=new THREE.TorusGeometry(LINK_R,LINK_TUBE,14,28);
  return sharedLinkGeo;
}
function linkMaterial(){
  if(sharedLinkMat)return sharedLinkMat;
  sharedLinkMat=new THREE.ShaderMaterial({
    uniforms:{uL:{value:LIGHT.clone()},uOpacity:{value:1}},
    toneMapped:true,transparent:false,
    vertexShader:`varying vec3 vN;varying vec3 vV;
void main(){
  vec4 w=modelMatrix*vec4(position,1.);
  vN=normalize(mat3(modelMatrix)*normal);
  vV=cameraPosition-w.xyz;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}`,
    fragmentShader:`uniform vec3 uL;uniform float uOpacity;
varying vec3 vN;varying vec3 vV;
void main(){
  vec3 N=normalize(vN),V=normalize(vV),L=normalize(uL);
  float nd=dot(N,L);
  float wrap=nd*.5+.5;
  float lit=mix(.26,1.,smoothstep(.18,.7,wrap));
  float rim=pow(1.-max(0.,dot(N,V)),2.4);
  vec3 H=normalize(L+V);
  float spec=pow(max(0.,dot(N,H)),26.);
  float spec2=pow(max(0.,dot(N,H)),12.)*.18;
  vec3 steel=vec3(.30,.32,.36)*lit;
  steel=mix(steel,vec3(.10,.11,.12),pow(max(0.,-N.y),1.2)*.45);
  steel=mix(steel,vec3(.16,.17,.19),(1.-smoothstep(.15,.7,wrap))*.35);
  steel+=vec3(1.,1.,1.)*spec*1.15;
  steel+=vec3(.7,.72,.76)*spec2;
  steel+=vec3(.55,.57,.62)*rim*.12;
  gl_FragColor=vec4(steel,uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.a=uOpacity;
}`,
  });
  return sharedLinkMat;
}

function nearestRest(rest,p){
  if(!rest||!rest.length)return p;
  let bx=p.x,by=p.y,bz=p.z,best=1e9;
  for(let i=0;i<rest.length;i+=3){
    const dx=rest[i]-p.x,dy=rest[i+1]-p.y,dz=rest[i+2]-p.z,d=dx*dx+dy*dy+dz*dz;
    if(d<best){best=d;bx=rest[i];by=rest[i+1];bz=rest[i+2];}
  }
  return {x:bx,y:by,z:bz};
}

function wrapPath(axis,rest){
  const half=GEL.width*.5,top=GEL.height+GEL.dome;
  const nSide=12,nTop=18;
  const pts=[];
  const at= (along,y,signSide)=>{
    const t=Math.max(0,Math.min(1,(y)/(top||1)));
    const bulge=Math.sin(t*Math.PI)*.035;
    const shoulder=t*t*(3-2*t);
    const drop=Math.max(0,(y-(top-.28))/.28);
    const ext=half*.97+bulge-drop*drop*.16;
    let p;
    if(axis==='x')p={x:along,y,z:0};
    else p={x:0,y,z:along};
    if(Math.abs(along)>half*.72){
      // sides / shoulders: pin to the outer extent
      const s=Math.sign(along)||signSide||1;
      if(axis==='x')p={x:s*ext,y,z:0};
      else p={x:0,y,z:s*ext};
    }
    return nearestRest(rest,p);
  };
  // left / back, foot → shoulder
  for(let i=0;i<=nSide;i++){
    const t=i/nSide,y=Y_FOOT+(top-Y_FOOT)*t;
    pts.push(at(-half,y,-1));
  }
  // across the top
  for(let i=1;i<nTop;i++){
    const t=i/nTop,along=-half+2*half*t;
    const edge=Math.abs(along)/half;
    const y=top-.02-.20*Math.max(0,edge-.62)/(1-.62);
    pts.push(at(along,y,0));
  }
  // right / front, shoulder → foot
  for(let i=0;i<=nSide;i++){
    const t=i/nSide,y=top-(top-Y_FOOT)*t;
    pts.push(at(half,y,1));
  }
  return pts;
}

function resample(pts,step){
  const out=[],seg=[];
  let len=0;
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i];
    const d=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
    seg.push(d);len+=d;
  }
  if(len<.01)return pts.slice();
  const n=Math.max(3,Math.round(len/step));
  for(let k=0;k<=n;k++){
    let d=len*(k/n),i=0;
    while(i<seg.length&&d>seg[i]){d-=seg[i];i++;}
    const a=pts[Math.min(i,pts.length-1)],b=pts[Math.min(i+1,pts.length-1)];
    const t=seg[Math.min(i,seg.length-1)]>1e-6?d/seg[Math.min(i,seg.length-1)]:0;
    out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
  }
  return out;
}

function pathTangent(pts,i){
  const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];
  const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z,l=Math.hypot(x,y,z)||1;
  return {x:x/l,y:y/l,z:z/l};
}

function buildChainGroup(body){
  const rest=body?.userData?.rest||body?.geometry?.attributes?.position?.array||null;
  const group=new THREE.Group();group.name='Special_chains';
  const geo=linkGeometry(),mat=linkMaterial();
  const paths=[
    {pts:resample(wrapPath('x',rest),LINK_STEP),lift:1,phase:0},
    {pts:resample(wrapPath('z',rest),LINK_STEP),lift:2.35,phase:1},
  ];
  const midY=(GEL.height+GEL.dome)*.45;
  for(const path of paths){
    const pts=path.pts;
    for(let i=0;i<pts.length;i++){
      const p=pts[i],T=pathTangent(pts,i);
      // Outward normal from the pillow centre.
      let nx=p.x,ny=p.y-midY,nz=p.z,nl=Math.hypot(nx,ny,nz)||1;
      nx/=nl;ny/=nl;nz/=nl;
      // Lift off the surface so the tube sits on the gel.
      const lift=LINK_TUBE*path.lift;
      const px=p.x+nx*lift,py=p.y+ny*lift,pz=p.z+nz*lift;
      const mesh=new THREE.Mesh(geo,mat);
      mesh.castShadow=true;mesh.receiveShadow=false;mesh.frustumCulled=true;
      mesh.position.set(px,py,pz);
      // Alternating links: even standing (axis = T×N), odd flat (axis = N).
      const standing=((i+path.phase)&1)===0;
      if(standing){
        _axis.set(T.y*nz-T.z*ny,T.z*nx-T.x*nz,T.x*ny-T.y*nx);
        if(_axis.lengthSq()<1e-8)_axis.set(0,0,1);else _axis.normalize();
      }else{
        _axis.set(nx,ny,nz);
      }
      _q.setFromUnitVectors(_from,_axis);
      mesh.quaternion.copy(_q);
      mesh.userData.restPos=mesh.position.clone();
      group.add(mesh);
    }
  }
  return group;
}

function disposeChains(s){
  const g=s.specialChains;if(!g)return;
  g.parent?.remove(g);
  for(const ch of g.children){
    if(ch.material&&ch.material!==sharedLinkMat)ch.material.dispose?.();
  }
  s.specialChains=null;
  if(s.userData)s.userData.chainBurst=false;
}

function ensureChains(s){
  if(s.specialChains)return;
  const body=s.body;if(!body||!s.group)return;
  const g=buildChainGroup(body);
  s.group.add(g);
  s.specialChains=g;
}

function burstChains(s){
  const g=s.specialChains;if(!g)return;
  const links=g.children.slice();
  const fade=linkMaterial().clone();
  fade.transparent=true;fade.depthWrite=false;
  fade.uniforms={uL:{value:LIGHT.clone()},uOpacity:{value:1}};
  for(const link of links){
    link.material=fade;
    const p=link.position;
    let dx=p.x,dy=p.y-.4,dz=p.z,l=Math.hypot(dx,dy,dz)||1;
    dx/=l;dy/=l;dz/=l;
    const speed=1.7+Math.random()*2.4;
    link.userData.v0={x:dx*speed+(Math.random()-.5)*.6,y:1.3+Math.random()*1.8,z:dz*speed+(Math.random()-.5)*.6};
    link.userData.spin={x:(Math.random()-.5)*10,y:(Math.random()-.5)*10,z:(Math.random()-.5)*10};
    link.userData.p0={x:p.x,y:p.y,z:p.z};
  }
  const job={
    t0:null,
    update(time){
      if(this.t0==null)this.t0=time;
      const t=time-this.t0,dur=.55,u=Math.min(1,t/dur);
      const grav=8.5;
      for(const link of links){
        const v=link.userData.v0,p0=link.userData.p0,sp=link.userData.spin;
        if(!v||!p0)continue;
        link.position.set(p0.x+v.x*t,p0.y+v.y*t-.5*grav*t*t,p0.z+v.z*t);
        link.rotation.x+=sp.x*(1/60);link.rotation.y+=sp.y*(1/60);link.rotation.z+=sp.z*(1/60);
      }
      fade.uniforms.uOpacity.value=1-smoothstep(.28,1,u);
      if(u>=1){disposeChains(s);fade.dispose();if(s.userData?.freeJob===job)s.userData.freeJob=null;return true;}
      return false;
    },
    cancel(){disposeChains(s);fade.dispose();},
  };
  (s.userData||={}).freeJob=job;
  s.userData.chainBurst=true;
  runtime.job(job);
}

function setBody(s,kind){
  const body=s.body;if(!body)return;
  if(s.specialDecor){disposeDecor(s.specialDecor);s.specialDecor=null;}
  if(body.material){body.material.colorWrite=true;body.material.depthWrite=true;}
  body.visible=true;body.castShadow=true;
  const prev=body.material;
  const cfg=KINDS[kind];
  if(prev?.userData?.special===kind){
    const o=outlineOf(s);if(o)o.visible=true;
    if(cfg?.chains)ensureChains(s);
    else if(!s.userData?.chainBurst)disposeChains(s);
    return;
  }
  body.material=specialBodyMaterial(kind);
  if(prev&&prev!==body.material)setTimeout(()=>prev.dispose(),0);
  const o=outlineOf(s);if(o)o.visible=true;
  if(s.bubbles)s.bubbles.visible=false;
  if(cfg?.chains)ensureChains(s);
  else if(!s.userData?.chainBurst)disposeChains(s);
}

function restoreBody(s){
  if(s.specialDecor){disposeDecor(s.specialDecor);s.specialDecor=null;}
  disposeChains(s);
  const body=s.body;if(!body)return;
  if(body.material){body.material.colorWrite=true;body.material.depthWrite=true;}
  if(body.material?.userData)body.material.userData.special=null;
  body.visible=true;body.castShadow=true;
  applyComic(s,s.value);
  const o=outlineOf(s);if(o)o.visible=true;
}

let runtime={job:null,reduced:()=>false};
export function setSpecialRuntime(r){runtime={job:r.job||null,reduced:r.reduced||(()=>false)};}
export function deformSpecial(s){}

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
    cancel(){if(s.label?.material&&s.label.material.opacity!=null)s.label.material.opacity=1;if(s.label)s.label.visible=true;},
  };
  (s.userData||={}).freeJob=job;runtime.job(job);
}

function releaseLock(s,kind){
  // Stein bleibt (Joker-Material), Ketten zerplatzen.
  const next=kind||'joker';
  if(s.userData)s.userData.chainBurst=true;
  setBody(s,next);
  if(!s.specialChains){if(s.userData)s.userData.chainBurst=false;return;}
  if(!runtime.job||runtime.reduced()||s.group?.visible===false){disposeChains(s);return;}
  burstChains(s);
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
    if(prev==='bound'&&(kind==='joker'||kind==null)&& (freed||kind==='joker')){
      releaseLock(s,kind==='joker'?kind:'joker');
      s.special=kind==null?null:(kind||'joker');
      // Joker bleibt ohne Zahl; wenn kind null wäre, Zahl folgt über popFree — nicht der Fall beim Schloss.
      if(s.special==null){disposeChains(s);popFree(s);}
    }else if(kind){
      setBody(s,kind);
      s.special=kind;
    }else{
      popFree(s);
      s.special=kind;
    }
  }else if(kind){
    setBody(s,kind);
  }
  labelOf(s,kind);
  const o=outlineOf(s);if(o)o.visible=true;
  return prev!==kind;
}
