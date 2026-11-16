// squish-art: Sonder-Squishes sind dasselbe Gel-Modell wie normale Steine
//  (Silhouette, Tiefe, Kontur, Schatten, Wobble). Darauf liegt ein
//  kachelbares Material (Eis / Stein / schwarz), das über alle Seiten
//  läuft, plus ein Symbol-Decal nur auf der Oberseite. Beim Schloss
//  setzt sich das Metallband um die Seiten fort.
import {THREE,PARAMETERS} from '../squish/squish-graphics.js?v=play-sharp-1';
import {applyComic,LIGHT} from './comic-style.mjs?v=squish-art-6';

const ART='squish-art-6f';
const url=name=>new URL(`./assets/specials/${name}.webp?v=${ART}`,import.meta.url).href;

const KINDS={
  ice:{albedo:'ice-albedo',decal:'ice-decal',band:null,spot:1,tile:2.15,decalScale:.76,crust:1.15,bandY:0,shift:.08},
  bound:{albedo:'stone-albedo',decal:'lock-decal',band:'band',spot:.22,tile:2.35,decalScale:.70,crust:0,bandY:.88,shift:.08},
  bomb:{albedo:'black-albedo',decal:'bomb-decal',band:null,spot:.9,tile:1.8,decalScale:.78,crust:0,bandY:0,shift:.07},
  joker:{albedo:'stone-albedo',decal:'joker-decal',band:'band',spot:.22,tile:2.35,decalScale:.70,crust:0,bandY:.88,shift:.08},
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
uniform vec3 uL;uniform float uSpot,uTile,uDecalScale,uDecalShift,uCrust,uHasBand,uBandY,uBandW,uWidth,uRadius,uHeight;
varying vec3 vN;varying vec3 vP;
float aastep(float e,float x){float w=max(fwidth(x),1e-4)*.75;return smoothstep(e-w,e+w,x);}
float sdRoundBox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return min(max(q.x,q.y),0.)+length(max(q,0.))-r;}
void main(){
  float nl=length(vN);vec3 N=nl>1e-5?vN/nl:vec3(0.,1.,0.);
  // Kachelbares Material, triplanar — oben und Seiten ohne Naht.
  vec3 an=abs(N);an=pow(an,vec3(4.));an/=max(an.x+an.y+an.z,1e-5);
  float ts=uTile/max(uWidth,1e-3);
  vec3 cx=texture2D(uAlbedo,vec2(vP.z,vP.y)*ts).rgb;
  vec3 cy=texture2D(uAlbedo,vec2(vP.x,vP.z)*ts).rgb;
  vec3 cz=texture2D(uAlbedo,vec2(vP.x,vP.y)*ts).rgb;
  vec3 mat=cx*an.x+cy*an.y+cz*an.z;
  float top=smoothstep(.45,.78,N.y);

  // Frostkruste am oberen Rand (Eis).
  if(uCrust>0.){
    float halfW=uWidth*.5;
    float d=sdRoundBox(vP.xz,vec2(halfW,halfW),uRadius);
    float crust=(1.-smoothstep(-.02,.11,abs(d)))*smoothstep(.25,.8,N.y);
    float sideFrost=(1.-smoothstep(.55,.95,N.y))*smoothstep(.2,.65,N.y)*(1.-smoothstep(.1,.22,abs(d)));
    vec3 frost=vec3(.90,.96,.99);
    mat=mix(mat,frost,(crust*.55+sideFrost*.4)*uCrust);
  }

  // Symbol nur auf der Oberseite, zentriert in XZ.
  vec2 tUv=vP.xz/uWidth+.5;
  tUv.y-=uDecalShift;
  vec2 dUv=(tUv-.5)/max(uDecalScale,.05)+.5;
  float inDec=step(0.,dUv.x)*step(0.,dUv.y)*step(dUv.x,1.)*step(dUv.y,1.);
  vec4 dec=texture2D(uDecal,dUv);
  mat=mix(mat,dec.rgb,dec.a*inDec*top);

  // Gleiche Cel-Modellierung wie normale Squishes, als Multiplikator auf dem Material.
  float nd=dot(N,normalize(uL))*.5+.5;
  float lit=mix(.62,1.,aastep(.5,nd));
  float topLit=mix(.78,1.,smoothstep(-.05,.9,N.y));
  vec3 c=mat*lit*topLit;

  // Schloss-Band nach der Beleuchtung, damit Silber gegen Stein klar bleibt.
  if(uHasBand>0.){
    float by=(vP.y-uBandY)/max(uBandW,.001);
    float bMask=(1.-smoothstep(.42,.62,abs(by)))*(1.-smoothstep(.88,.98,N.y));
    float uS=atan(vP.x,vP.z)*0.159154943+.5;
    vec3 b1=texture2D(uBand,vec2(uS,by*.85+.5)).rgb;
    vec3 b2=texture2D(uBand,vec2(fract(uS+.5),by*.85+.5)).rgb;
    float seam=1.-smoothstep(.02,.1,min(uS,1.-uS));
    vec3 grain=mix(b1,b2,seam*.5);
    float edge=smoothstep(.26,.52,abs(by));
    float shine=exp(-pow((by+0.16)*3.4,2.));
    vec3 metal=mix(vec3(.90,.92,.97),vec3(.14,.14,.16),edge);
    metal=mix(metal,vec3(1.),shine*.5);
    metal*=mix(vec3(1.),.55+grain*.7,.18);
    metal*=mix(.90,1.,lit);
    c=mix(c,metal,bMask*uHasBand);
  }
  vec2 q=vP.xz/(uWidth*.5);
  float g=length((q-vec2(-.52,-.46))*vec2(1.,1.7)),g2=length(q-vec2(-.2,-.62));
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
      uBandY:{value:cfg.bandY},
      uBandW:{value:.20},
      uWidth:{value:PARAMETERS.gel.width},
      uRadius:{value:PARAMETERS.gel.radius},
      uHeight:{value:PARAMETERS.gel.height},
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
