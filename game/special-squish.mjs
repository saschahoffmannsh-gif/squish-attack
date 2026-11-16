// squish-art: Sonder-Squishes sind dasselbe Gel-Modell wie normale Steine
//  (Silhouette, Tiefe, Kontur, Schatten, Wobble). Darauf liegt ein
//  kachelbares Material (Eis / Stein / schwarz), das über alle Seiten
//  läuft, plus ein Symbol-Decal nur auf der Oberseite. Das Schloss
//  ist in Ketten gelegt: modellierte 3D-Glieder über die Oberseite
//  und die Seiten; beim Befreien zerplatzen die Ketten.
import {THREE,PARAMETERS} from '../squish/squish-graphics.js?v=play-sharp-1';
import {applyComic,LIGHT} from './comic-style.mjs?v=squish-art-6';

const ART='squish-art-9';
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
    float stripX=1.-smoothstep(.035,.13,abs(vP.x));
    float stripZ=1.-smoothstep(.035,.13,abs(vP.z));
    float ao=max(stripX,stripZ)*smoothstep(.08,.30,vP.y);
    mat*=1.-ao*.68;
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
// Eng um den Gel-Körper: über die Oberseite, um die Rundungen, die
// sichtbaren Front- und Seitenflächen hinunter, und dort zu Ende, wo
// die Kette hinter dem Stein verschwindet. Nie über die Silhouette
// hinaus (außer der dünnen Rohrwand).
const GEL=PARAMETERS.gel;
const LINK_R=.084,LINK_TUBE=.034,LINK_STEP=LINK_R*1.34;
const MID_Y=(GEL.height+GEL.dome)*.45;
const TOP_Y=GEL.height+GEL.dome;
const CORNER_R=Math.min(.30,GEL.radius||.34);
let sharedLinkGeo=null,sharedLinkMat=null;
const _q=new THREE.Quaternion(),_from=new THREE.Vector3(0,0,1),_axis=new THREE.Vector3();

function linkGeometry(){
  if(!sharedLinkGeo)sharedLinkGeo=new THREE.TorusGeometry(LINK_R,LINK_TUBE,14,24);
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
  float lit=mix(.16,.92,smoothstep(.10,.72,wrap));
  float rim=pow(1.-max(0.,dot(N,V)),2.6);
  vec3 H=normalize(L+V);
  float spec=pow(max(0.,dot(N,H)),52.);
  float spec2=pow(max(0.,dot(N,H)),16.)*.10;
  vec3 steel=vec3(.10,.11,.13)*lit;
  steel=mix(steel,vec3(.06,.06,.07),pow(max(0.,-N.y),1.1)*.6);
  steel=mix(steel,vec3(.09,.09,.10),(1.-smoothstep(.10,.62,wrap))*.55);
  steel+=vec3(.95,.96,.98)*spec*1.25;
  steel+=vec3(.50,.52,.56)*spec2;
  steel+=vec3(.38,.40,.44)*rim*.09;
  gl_FragColor=vec4(steel,uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.a=uOpacity;
}`,
  });
  return sharedLinkMat;
}

function projectToSurface(rest,p,axis){
  if(!rest||!rest.length)return p;
  const band=.14;
  let best=1e9,bx=p.x,by=p.y,bz=p.z;
  for(let i=0;i<rest.length;i+=3){
    const x=rest[i],y=rest[i+1],z=rest[i+2];
    const lat=axis==='x'?z:x;
    if(Math.abs(lat)>band)continue;
    const d=(x-p.x)*(x-p.x)+(y-p.y)*(y-p.y)+(z-p.z)*(z-p.z);
    if(d<best){best=d;bx=x;by=y;bz=z;}
  }
  return {x:bx,y:by,z:bz};
}

// Echte Gelfläche: Meridian-Vertices, äußerer Radius je Winkel.
function meridian(rest,axis,band=.10){
  const nBin=96,a0=-Math.PI,span=2*Math.PI;
  const bins=new Array(nBin).fill(null);
  if(!rest||!rest.length)return [];
  for(let i=0;i<rest.length;i+=3){
    const x=rest[i],y=rest[i+1],z=rest[i+2];
    const lat=axis==='x'?z:x;
    if(Math.abs(lat)>band)continue;
    const along=axis==='x'?x:z;
    const ang=Math.atan2(along,y-MID_Y);
    const r=Math.hypot(along,y-MID_Y);
    let b=Math.floor((ang-a0)/span*nBin);
    if(b<0)b=0;if(b>=nBin)b=nBin-1;
    if(!bins[b]||r>bins[b].r)bins[b]={x,y,z,ang,r};
  }
  return bins.filter(Boolean);
}

// Pfad liegt auf der echten Oberfläche. Winkel so begrenzt, dass
// selbst mit Gliederradius nichts über den oberen/unteren Rand
// oder links/rechts hinaussteht (nur die dünne Rohrwand).
function wrapPath(axis,rest){
  const mer=meridian(rest,axis,.11);
  let aMin,aMax;
  if(axis==='z'){
    // hinten nur bis an die hintere Schulter, vorne ein Stück die Front hinunter
    aMin=-.62;aMax=1.10;
  }else{
    aMin=-1.08;aMax=1.08;
  }
  const pts=mer.filter(p=>p.ang>=aMin&&p.ang<=aMax);
  if(pts.length>=6)return pts;
  // Fallback: analytische Schulter, falls Rest fehlt
  const ext=GEL.width*.5-LINK_R*.5,r=CORNER_R,ySh=TOP_Y-r,cx=ext-r;
  const out=[];
  const emit=(along,y)=>{
    out.push(projectToSurface(rest,axis==='x'?{x:along,y,z:0}:{x:0,y,z:along},axis));
  };
  const y0=axis==='z'?ySh+r*.55:ySh-r*.5;
  const y1=axis==='z'?ySh-r*.7:ySh-r*.5;
  const sides=(sign,yEnd,up)=>{
    const loc=[];
    const phi0=yEnd>=ySh?Math.acos(Math.max(-1,Math.min(1,(yEnd-ySh)/r))):Math.PI/2;
    if(yEnd<ySh){
      for(let i=0;i<=6;i++)loc.push([sign*ext,yEnd+(ySh-yEnd)*i/6]);
    }
    for(let i=0;i<=8;i++){
      const phi=phi0*(1-i/8);
      loc.push([sign*(cx+r*Math.sin(phi)),ySh+r*Math.cos(phi)]);
    }
    if(!up)loc.reverse();
    return loc;
  };
  for(const [a,y] of sides(-1,y0,true))emit(a,y);
  for(let i=1;i<12;i++)emit(-cx+2*cx*i/12,Math.min(TOP_Y,1.29));
  for(const [a,y] of sides(1,y1,false))emit(a,y);
  return out;
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

function outwardNormal(p){
  let nx=p.x,ny=p.y-MID_Y,nz=p.z,nl=Math.hypot(nx,ny,nz)||1;
  return {x:nx/nl,y:ny/nl,z:nz/nl};
}

// Auf der Oberseite nur leicht in den Stein gedrückt (volle Oval-Glieder);
// an den Seiten etwas tiefer, damit nichts über die Silhouette steht.
function sinkFor(N){
  return Math.abs(N.y)>.7 ? -(LINK_TUBE*.22) : -(LINK_R*.18+LINK_TUBE*.25);
}

function placeLink(p,T,N,phase,i,geo,mat){
  const mesh=new THREE.Mesh(geo,mat);
  mesh.castShadow=true;mesh.receiveShadow=false;mesh.frustumCulled=true;
  const sink=sinkFor(N);
  mesh.position.set(p.x+N.x*sink,p.y+N.y*sink,p.z+N.z*sink);
  const standing=((i+phase)&1)===0;
  if(standing){
    _axis.set(T.y*N.z-T.z*N.y,T.z*N.x-T.x*N.z,T.x*N.y-T.y*N.x);
    if(_axis.lengthSq()<1e-8)_axis.set(0,0,1);else _axis.normalize();
  }else{
    _axis.set(N.x,N.y,N.z);
  }
  _q.setFromUnitVectors(_from,_axis);
  mesh.quaternion.copy(_q);
  // Nur echte Seitenflächen stauchen, nicht schon die Schulter der Oberseite.
  const onSide=Math.abs(N.y)<.42;
  if(onSide){
    const side=Math.abs(N.x)>Math.abs(N.z);
    if(side)mesh.scale.set(.78,1,.94);
    else mesh.scale.set(1,.82,1);
  }
  mesh.userData.restPos=mesh.position.clone();
  return mesh;
}

function padlockMaterial(){
  // Etwas dunkler als die Glieder, gleicher Stahl-Look.
  const m=linkMaterial().clone();
  m.uniforms={uL:{value:LIGHT.clone()},uOpacity:{value:1}};
  m.fragmentShader=m.fragmentShader.replace('vec3(.10,.11,.13)','vec3(.08,.08,.10)');
  return m;
}

function buildPadlock(rest){
  const g=new THREE.Group();g.name='Special_padlock';
  const mat=padlockMaterial();
  const bodyGeo=new THREE.BoxGeometry(.176,.145,.096);
  const body=new THREE.Mesh(bodyGeo,mat);
  body.castShadow=true;
  const shackleGeo=new THREE.TorusGeometry(.062,.018,10,22,Math.PI);
  const shackle=new THREE.Mesh(shackleGeo,mat);
  shackle.rotation.z=Math.PI;
  shackle.position.set(0,.070,0);
  shackle.castShadow=true;
  const holeGeo=new THREE.CylinderGeometry(.012,.016,.008,10);
  const holeMat=mat.clone();
  holeMat.uniforms={uL:{value:LIGHT.clone()},uOpacity:{value:1}};
  holeMat.fragmentShader=holeMat.fragmentShader.replace('vec3(.10,.11,.13)','vec3(.03,.03,.035)');
  const hole=new THREE.Mesh(holeGeo,holeMat);
  hole.rotation.x=Math.PI/2;
  hole.position.set(0,-.016,.050);
  g.add(body,shackle,hole);
  g.userData.disposeGeos=[bodyGeo,shackleGeo,holeGeo];
  g.userData.disposeMats=[mat,holeMat];
  const top=projectToSurface(rest,{x:0,y:1.28,z:.02},'z');
  // Sitzt auf den Ketten am Kreuz, leicht zur Kamera geneigt.
  g.position.set(top.x, top.y+LINK_R*.85+LINK_TUBE+.055, top.z+.05);
  g.rotation.x=-.26;
  return g;
}

function buildChainGroup(rest){
  const group=new THREE.Group();group.name='Special_chains';
  const geo=linkGeometry(),mat=linkMaterial();
  const paths=[
    {pts:resample(wrapPath('x',rest),LINK_STEP),phase:0},
    {pts:resample(wrapPath('z',rest),LINK_STEP),phase:1},
  ];
  for(const path of paths){
    const pts=path.pts;
    for(let i=0;i<pts.length;i++){
      const p=pts[i],T=pathTangent(pts,i),N=outwardNormal(p);
      if(p.y<MID_Y*.7)continue;
      // Kreuz bleibt dem Schloss, damit die Bügel nicht in den Gliedern untergehen.
      if(Math.hypot(p.x,p.z)<.15)continue;
      const mesh=placeLink(p,T,N,path.phase,i,geo,mat);
      group.add(mesh);
    }
  }
  group.add(buildPadlock(rest));
  return group;
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
  const links=g.children.slice();
  const fade=linkMaterial().clone();
  fade.transparent=true;fade.depthWrite=false;
  fade.uniforms={uL:{value:LIGHT.clone()},uOpacity:{value:1}};
  const paint=obj=>{
    if(obj.isMesh&&obj.material)obj.material=fade;
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
