// squish-art: Sonder-Squishes sind dasselbe Gel-Modell wie normale Steine
//  (Silhouette, Tiefe, Kontur, Schatten, Wobble). Darauf liegt ein
//  kachelbares Material (Eis / Stein / schwarz), das über alle Seiten
//  läuft, plus ein Symbol-Decal nur auf der Oberseite. Das Schloss
//  trägt die Konzept-Ketten als Decal über die ganze Oberseite; an den
//  sichtbaren Kanten laufen kurze Kettenglieder hinunter. Beim Befreien
//  zerplatzen die Glieder.
import {THREE,PARAMETERS} from '../squish/squish-graphics.js?v=play-sharp-1';
import {applyComic,LIGHT} from './comic-style.mjs?v=launch-27';

const ART='launch-25';
const url=name=>new URL(`./assets/specials/${name}.webp?v=${ART}`,import.meta.url).href;

// style: 0 Eis, 1 Schloss/Joker, 2 Bombe
// Eis und Bombe: gleiche Werte wie v5 (squish-art-7c). Nur das Schloss ändert sich.
const KINDS={
  ice:{albedo:'ice-albedo',decal:'ice-decal',band:null,spot:1,tile:1.12,decalScale:.68,crust:1.05,shift:.04,style:0},
  bound:{albedo:'stone-albedo',decal:'lock-decal',band:null,spot:.18,tile:1.0,decalScale:1.0,crust:0,shift:0,style:1,stoneDark:.88,chains:true,decalCover:true},
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
uniform float uSpot,uTile,uDecalScale,uDecalShift,uCrust,uHasBand,uBandZ,uBandW,uWidth,uRadius,uHeight,uStyle,uHasDecal,uStoneDark,uDecalCover;
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

  // Symbol auf der Oberseite. Schloss-Ketten: Decal bis in die Schulter,
  // damit die Enden die Ecken erreichen (uDecalCover).
  vec2 tUv=vP.xz/uWidth+.5;
  tUv.y-=uDecalShift;
  vec2 dUv=(tUv-.5)/max(uDecalScale,.05)+.5;
  float inDec=step(0.,dUv.x)*step(0.,dUv.y)*step(dUv.x,1.)*step(dUv.y,1.);
  vec4 dec=texture2D(uDecal,dUv);
  float ax=dFdx(dec.a),ay=dFdy(dec.a);
  float emb=clamp(ax*.8-ay*1.3,-1.,1.);
  vec3 decRgb=dec.rgb*(1.+emb*.28);
  float decTop=uDecalCover>0.5?smoothstep(.20,.52,N.y):top;
  mat=mix(mat,decRgb,dec.a*inDec*decTop*uHasDecal);

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
      uDecalCover:{value:cfg.decalCover?1:0},
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

// --- Ketten (Konzept-Decal + Seitenstücke) -----------------------------
const GEL=PARAMETERS.gel;
const TOP_Y=GEL.height+GEL.dome;
const HALF=GEL.width*.5;
let wrapTex=null,pieceMat=null;

function wrapTexture(){
  if(wrapTex)return wrapTex;
  wrapTex=tex('lock-wrap',{repeat:false});
  return wrapTex;
}

function decalPieceMaterial(map,opacity=1){
  const m=new THREE.ShaderMaterial({
    uniforms:{
      uMap:{value:map},
      uL:{value:LIGHT.clone()},
      uOpacity:{value:opacity},
    },
    transparent:true,depthWrite:false,toneMapped:true,side:THREE.DoubleSide,
    vertexShader:`varying vec3 vN;varying vec2 vUv;
void main(){
  vUv=uv;
  vN=normalize(mat3(modelMatrix)*normal);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}`,
    fragmentShader:`uniform sampler2D uMap;uniform vec3 uL;uniform float uOpacity;
varying vec3 vN;varying vec2 vUv;
void main(){
  vec4 d=texture2D(uMap,vUv);
  if(d.a<0.04)discard;
  vec3 N=normalize(vN);
  float nd=dot(N,normalize(uL))*.5+.5;
  float lit=mix(.72,1.,smoothstep(.18,.75,nd));
  float topLit=mix(.85,1.,smoothstep(-.1,.9,N.y));
  gl_FragColor=vec4(d.rgb*lit*topLit,d.a*uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.a=d.a*uOpacity;
}`,
  });
  return m;
}

function projectCorner(rest,x,y,z){
  if(!rest||!rest.length)return {x,y,z};
  let best=1e9,bx=x,by=y,bz=z;
  for(let i=0;i<rest.length;i+=3){
    const dx=rest[i]-x,dy=rest[i+1]-y,dz=rest[i+2]-z,d=dx*dx+dy*dy+dz*dz;
    if(d<best){best=d;bx=rest[i];by=rest[i+1];bz=rest[i+2];}
  }
  return {x:bx,y:by,z:bz};
}

// Kurze Kettenglieder an den vier Ecken, über die Kante geklappt.
// Atlas: TL TR / BL BR  (Bild oben = -Z, links = -X).
const WRAP_CORNERS=[
  // Vordere Ecken: die sauberen hinteren Endglieder (TL/TR), vertikal gespiegelt,
  // damit die Kette nach vorne/unten weiterläuft. Hintere Ecken entfallen.
  {sx:-1,sz:1,uv:[0,.5,.5,0]},    // vorne links aus TL, V-Flip
  {sx: 1,sz:1,uv:[.5,.5,1,0]},    // vorne rechts aus TR, V-Flip
];

function makeWrapQuad(c,rest,mat){
  const geo=new THREE.PlaneGeometry(.28,.26);
  const uv=geo.attributes.uv;
  const [u0,v0,u1,v1]=c.uv;
  for(let i=0;i<uv.count;i++){
    const u=uv.getX(i),v=uv.getY(i);
    uv.setXY(i,u0+u*(u1-u0),v0+v*(v1-v0));
  }
  uv.needsUpdate=true;
  const mesh=new THREE.Mesh(geo,mat);
  mesh.frustumCulled=true;
  mesh.renderOrder=2;
  // Nur die sichtbare Frontschulter, knapp unter dem Decal-Ende, nach innen versetzt.
  const p=projectCorner(rest,c.sx*.70,1.16,c.sz*.80);
  const N=new THREE.Vector3(c.sx*.25,.55,c.sz*.70).normalize();
  mesh.position.set(p.x+N.x*.015,p.y+N.y*.015,p.z+N.z*.015);
  const up=new THREE.Vector3(0,1,0);
  const q=new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(new THREE.Vector3(),N,up)
  );
  mesh.quaternion.copy(q);
  mesh.rotateY(Math.PI);
  mesh.userData.restPos=mesh.position.clone();
  mesh.userData.disposeGeos=[geo];
  return mesh;
}

function buildChainGroup(rest){
  const group=new THREE.Group();group.name='Special_chains';
  const mat=decalPieceMaterial(wrapTexture(),1);
  group.userData.disposeMats=[mat];
  // Hintere Ecken sind von der 34°-Kamera kaum sichtbar und ragten über die Silhouette.
  for(const c of WRAP_CORNERS){
    if(c.sz<=0)continue;
    group.add(makeWrapQuad(c,rest,mat));
  }
  return group;
}

function addBurstPieces(group){
  // Decal in Schloss + 4 Arme à 3 Stücke zerlegen, auf der Oberseite erzeugen.
  const map=tex('lock-decal',{repeat:false});
  const mat=decalPieceMaterial(map,1);
  group.userData.disposeMats=(group.userData.disposeMats||[]).concat([mat]);
  const y=1.30;
  const pieces=[{u:.37,v:.42,w:.26,h:.30,kind:'lock'}];
  const arms=[
    {u0:.46,v0:.46,u1:.04,v1:.04},
    {u0:.54,v0:.46,u1:.96,v1:.04},
    {u0:.46,v0:.54,u1:.04,v1:.96},
    {u0:.54,v0:.54,u1:.96,v1:.96},
  ];
  for(const a of arms){
    for(let k=0;k<3;k++){
      const t0=k/3,t1=(k+1)/3;
      const uA=a.u0+(a.u1-a.u0)*t0,vA=a.v0+(a.v1-a.v0)*t0;
      const uB=a.u0+(a.u1-a.u0)*t1,vB=a.v0+(a.v1-a.v0)*t1;
      const u=Math.min(uA,uB)-.04,v=Math.min(vA,vB)-.04;
      const w=Math.abs(uB-uA)+.08,h=Math.abs(vB-vA)+.08;
      pieces.push({u,v,w,h,kind:'link'});
    }
  }
  for(const p of pieces){
    const geo=new THREE.PlaneGeometry(Math.max(.12,p.w*GEL.width),Math.max(.12,p.h*GEL.width));
    const uv=geo.attributes.uv;
    for(let i=0;i<uv.count;i++){
      uv.setXY(i,p.u+uv.getX(i)*p.w,p.v+uv.getY(i)*p.h);
    }
    uv.needsUpdate=true;
    const mesh=new THREE.Mesh(geo,mat);
    mesh.rotation.x=-Math.PI/2;
    const cx=p.u+p.w*.5,cz=p.v+p.h*.5;
    mesh.position.set((cx-.5)*GEL.width,y,(cz-.5)*GEL.width);
    mesh.userData.restPos=mesh.position.clone();
    mesh.userData.disposeGeos=[geo];
    mesh.renderOrder=3;
    group.add(mesh);
  }
}

function disposeChains(s){
  const g=s.specialChains;if(!g)return;
  g.parent?.remove(g);
  const drop=obj=>{
    if(!obj)return;
    if(obj.userData?.disposeGeos)obj.userData.disposeGeos.forEach(x=>x.dispose?.());
    if(obj.userData?.disposeMats)obj.userData.disposeMats.forEach(x=>x.dispose?.());
    for(const ch of obj.children||[])drop(ch);
  };
  drop(g);
  s.specialChains=null;
  if(s.userData)s.userData.chainBurst=false;
}

function ensureChains(s){
  if(s.specialChains)return;
  const body=s.body;if(!body||!s.group)return;
  const rest=s.rest||body.userData?.rest||body.geometry?.attributes?.position?.array||null;
  const g=buildChainGroup(rest);
  s.group.add(g);
  s.specialChains=g;
}

function burstChains(s){
  const g=s.specialChains;if(!g)return;
  addBurstPieces(g);
  const links=g.children.slice();
  let fadeMat=null;
  const paint=obj=>{
    if(obj.isMesh&&obj.material){
      if(!fadeMat){
        fadeMat=obj.material.clone();
        fadeMat.transparent=true;fadeMat.depthWrite=false;
        fadeMat.uniforms={
          uMap:{value:obj.material.uniforms.uMap.value},
          uL:{value:LIGHT.clone()},
          uOpacity:{value:1},
        };
      }
      obj.material=fadeMat;
    }
    for(const ch of obj.children||[])paint(ch);
  };
  for(const link of links){
    paint(link);
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
      if(fadeMat)fadeMat.uniforms.uOpacity.value=1-smoothstep(.28,1,u);
      if(u>=1){disposeChains(s);fadeMat?.dispose();if(s.userData?.freeJob===job)s.userData.freeJob=null;return true;}
      return false;
    },
    cancel(){disposeChains(s);fadeMat?.dispose();},
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
