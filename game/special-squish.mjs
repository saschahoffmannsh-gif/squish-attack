// squish-art: Sonder-Squishes sind dasselbe Gel-Modell wie normale Steine
//  (Silhouette, Tiefe, Kontur, Schatten, Wobble). Darauf liegt ein
//  kachelbares Material (Eis / Stein / schwarz), das über alle Seiten
//  läuft, plus ein Symbol-Decal nur auf der Oberseite. Beim Schloss
//  läuft das Metallband über die Oberseite und die Seiten.
import {THREE,PARAMETERS} from '../squish/squish-graphics.js?v=play-sharp-1';
import {applyComic,LIGHT} from './comic-style.mjs?v=squish-art-6';

const ART='squish-art-7c';
const url=name=>new URL(`./assets/specials/${name}.webp?v=${ART}`,import.meta.url).href;

// style: 0 Eis, 1 Schloss/Joker, 2 Bombe
// decalScale ~0.68 → Symbol ~55 % der Oberseite (Decal hat 10 % Rand)
const KINDS={
  ice:{albedo:'ice-albedo',decal:'ice-decal',band:null,spot:1,tile:1.12,decalScale:.68,crust:1.05,shift:.04,style:0},
  bound:{albedo:'stone-albedo',decal:'lock-decal',band:'band',spot:.18,tile:1.0,decalScale:.68,crust:0,shift:.04,style:1,bandZ:.24,bandW:.12},
  bomb:{albedo:'black-albedo',decal:'bomb-decal',band:null,spot:.95,tile:1.0,decalScale:.84,crust:0,shift:.04,style:2},
  joker:{albedo:'stone-albedo',decal:'joker-decal',band:'band',spot:.18,tile:1.0,decalScale:.68,crust:0,shift:.04,style:1,bandZ:.24,bandW:.12},
};

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
uniform float uSpot,uTile,uDecalScale,uDecalShift,uCrust,uHasBand,uBandZ,uBandW,uWidth,uRadius,uHeight,uStyle;
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
  mat=mix(mat,decRgb,dec.a*inDec*top);

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

function specialBodyMaterial(kind){
  const cfg=KINDS[kind];if(!cfg)return null;
  const mat=new THREE.ShaderMaterial({
    uniforms:{
      uAlbedo:{value:tex(cfg.albedo,{repeat:true})},
      uDecal:{value:tex(cfg.decal,{repeat:false})},
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

function setBody(s,kind){
  const body=s.body;if(!body)return;
  // v3-Karte entfernen, falls noch eine am Group hängt.
  if(s.specialDecor){disposeDecor(s.specialDecor);s.specialDecor=null;}
  if(body.material){body.material.colorWrite=true;body.material.depthWrite=true;}
  body.visible=true;body.castShadow=true;
  const prev=body.material;
  if(prev?.userData?.special===kind){
    const o=outlineOf(s);if(o)o.visible=true;
    return;
  }
  body.material=specialBodyMaterial(kind);
  if(prev&&prev!==body.material)setTimeout(()=>prev.dispose(),0);
  const o=outlineOf(s);if(o)o.visible=true;
  if(s.bubbles)s.bubbles.visible=false;
}

function restoreBody(s){
  if(s.specialDecor){disposeDecor(s.specialDecor);s.specialDecor=null;}
  const body=s.body;if(!body)return;
  if(body.material){body.material.colorWrite=true;body.material.depthWrite=true;}
  if(body.material?.userData)body.material.userData.special=null;
  body.visible=true;body.castShadow=true;
  applyComic(s,s.value);
  const o=outlineOf(s);if(o)o.visible=true;
}

let runtime={job:null,reduced:()=>false};
export function setSpecialRuntime(r){runtime={job:r.job||null,reduced:r.reduced||(()=>false)};}
// v3-Hook: keine Extra-Geometrie mehr, das Gel wird vom SDK verformt.
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
