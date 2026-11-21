import {THREE} from '../../squish/squish-graphics.js?v=play-sharp-1';

// Opaque glossy gel (preview): launch-5 neon cushion colors and a soft
// clearcoat-like highlight, but no transmission/refraction pass and no bloom.
// One opaque ShaderMaterial pass. Form, springs and labels stay as in launch-36.
export const INK='#140a10';
// Launch-5 neon dye, plus a lighter face and a deeper shade for wrap lighting.
const NEON={
  1:'#00c9ff',2:'#ff2455',3:'#39ff29',4:'#ff7816',
  5:'#a440ff',6:'#fff13b',7:'#ff42ca',8:'#11ffe0',
};
const col=hex=>new THREE.Color(hex);
const cache=new Map();
export function comicColors(value){
  const key=((Math.max(1,value|0)-1)%8)+1;let c=cache.get(key);
  if(!c){
    const mid=col(NEON[key]);
    const hi=mid.clone().lerp(col('#ffffff'),.14);
    const lo=mid.clone().multiplyScalar(.2).lerp(col('#04060a'),.32);
    c={light:mid.clone(),shade:lo,hi,mid,lo,hex:{hi:'#'+hi.getHexString(),mid:NEON[key],lo:'#'+lo.getHexString()}};
    cache.set(key,c);
  }
  return c;
}
export const LIGHT=new THREE.Vector3(.48,.82,-.32).normalize();

const bodyVert=`varying vec3 vN;varying vec3 vW;
void main(){vN=normalize(mat3(modelMatrix)*normal);vW=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const bodyFrag=`uniform vec3 uLight,uShade,uHi,uL;uniform float uSoft;
varying vec3 vN;varying vec3 vW;
void main(){
  float nl=length(vN);vec3 N=nl>1e-5?vN/nl:vec3(0.,1.,0.);
  vec3 V=normalize(cameraPosition-vW);
  vec3 L=normalize(uL);
  float wrap=clamp(dot(N,L)*.5+.5,0.,1.);
  wrap=smoothstep(.0,.85,wrap);
  vec3 c=mix(uShade,uLight,wrap);
  c+=uLight*smoothstep(.2,1.,N.y)*.1;
  float fres=pow(1.-clamp(dot(N,V),0.,1.),3.0);
  c=mix(c,uHi,fres*.28);
  vec3 H=normalize(L+V);
  float nh=max(dot(N,H),0.);
  float specSoft=pow(nh,32.)*uSoft;
  float specHard=pow(nh,110.)*uSoft;
  c+=uHi*specSoft*.22;
  gl_FragColor=vec4(c,1.);
  #include <tonemapping_fragment>
  gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(1.),clamp(specHard,0.,1.));
  #include <colorspace_fragment>
}`;

export function comicBodyMaterial(value,geometry,{fused=false}={}){
  const {light,shade,hi}=comicColors(value);
  const m=new THREE.ShaderMaterial({
    vertexShader:bodyVert,fragmentShader:bodyFrag,toneMapped:true,
    defines:fused?{FUSED:1}:{},
    side:fused?THREE.DoubleSide:THREE.FrontSide,
    uniforms:{
      uLight:{value:light.clone()},uShade:{value:shade.clone()},uHi:{value:hi.clone()},
      uL:{value:LIGHT},uSoft:{value:fused?1.15:1},
    },
  });
  m.name='Gel_body';
  m.userData.comic={value,fused,gel:true};
  return m;
}
export function setComicValue(material,value){
  const u=material?.uniforms;if(!u?.uLight)return;const {light,shade,hi}=comicColors(value);
  u.uLight.value.copy(light);u.uShade.value.copy(shade);if(u.uHi)u.uHi.value.copy(hi);
  material.userData.comic.value=value;
}

// Kept for specials / fusion imports; the opaque gel path does not attach an ink hull.
export const OUTLINE_WORLD=.085;
export function comicOutline(geometry,{world=OUTLINE_WORLD,push=0}={}){
  const m=new THREE.Mesh();m.name='Comic_outline';m.visible=false;m.raycast=()=>{};
  return m;
}

export function setComicLabel(material,{face='#ffffff',ink=INK}={}){
  if(!material)return;
  material.color.set(face);
  material.userData.comicFace=face;material.userData.comicInkColor=ink;
  const u=material.userData.comicLabelUniforms;if(u?.uComicInk)u.uComicInk.value.copy(col(ink));
}
export function comicLabelMaterial(material,{width=.5,height=.7,thickness=.03,face='#ffffff',ink=INK}={}){
  material.toneMapped=false;
  material.userData.comicInk=[thickness/width,thickness/height];
  setComicLabel(material,{face,ink});
  material.onBeforeCompile=function(shader){
    const [ox,oy]=this.userData.comicInk||[.06,.04];
    shader.uniforms.uComicOff={value:new THREE.Vector2(ox,oy)};shader.uniforms.uComicInk={value:col(this.userData.comicInkColor||INK)};
    this.userData.comicLabelUniforms=shader.uniforms;
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec2 uComicOff;uniform vec3 uComicInk;')
      .replace('#include <alphamap_fragment>',`
        #ifdef USE_ALPHAMAP
        {float comicA=texture2D(alphaMap,vAlphaMapUv).g,comicO=0.;
         for(int i=0;i<12;i++){float t=float(i)*0.5235988;comicO=max(comicO,texture2D(alphaMap,vAlphaMapUv+vec2(cos(t),sin(t))*uComicOff).g);}
         float face=smoothstep(.3,.6,comicA),edge=smoothstep(.15,.45,comicO);
         diffuseColor.rgb=mix(uComicInk,diffuseColor.rgb,face);diffuseColor.a*=max(face,edge);}
        #endif`);
  };
  material.customProgramCacheKey=()=>'comic-label-1';
  const clone=material.clone;
  material.clone=function(){const c=clone.call(this);c.onBeforeCompile=this.onBeforeCompile;c.customProgramCacheKey=this.customProgramCacheKey;c.clone=this.clone;c.toneMapped=false;c.userData.comicFace=this.userData.comicFace;c.userData.comicInkColor=this.userData.comicInkColor;setComicLabel(c,{face:this.userData.comicFace||'#ffffff',ink:this.userData.comicInkColor||INK});return c;};
  material.needsUpdate=true;
  return material;
}

export function applyComic(s,value=s.value,{fused=false}={}){
  const body=s.body;if(!body)return;
  const current=body.material;
  if(current?.userData?.special){
    if(s.bubbles)s.bubbles.visible=false;
    return;
  }
  if(current?.userData?.comic){
    const info=current.userData.comic;if(info.value!==value)setComicValue(current,value);
  }else{
    const old=current;body.material=comicBodyMaterial(value,body.geometry,{fused});
    if(old&&old!==body.material)setTimeout(()=>old.dispose(),0);
  }
  // Drop any leftover comic ink hull from a reused body.
  for(const o of [...body.children])if(o.name==='Comic_outline'){body.remove(o);o.material?.dispose?.();}
  if(s.bubbles)s.bubbles.visible=false;
}

// Effekte: flaches Zweiton-Material (Hautfetzen, Tropfen).
export function toonUniforms(value,{gold=false}={}){
  const c=comicColors(value),light=c.light.clone(),shade=c.shade.clone();
  if(gold){light.lerp(col('#ffd34d'),.75);shade.lerp(col('#c98a06'),.75);}
  return {uLight:{value:light},uShade:{value:shade},uL:{value:LIGHT},uInk:{value:col(INK)}};
}

// Comic-„Pop“: gezackter Stern mit dunkler Kontur (weiß, Farbe wird getönt) und Funkel-Stern.
function canvasTexture(draw,size=256){
  const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');draw(x,size);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;return t;
}
function star(x,cx,cy,spikes,outer,inner,rot=0,jag=0){
  x.beginPath();
  for(let i=0;i<spikes*2;i++){const r=i%2?inner:outer*(1-jag*((i*7)%5)/5),a=rot+i*Math.PI/spikes;x.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);}
  x.closePath();
}
let burstTex=null,sparkTex=null,ringTex=null;
export function comicBurstTexture(){
  return burstTex||=canvasTexture((x,s)=>{
    const c=s/2;x.lineJoin='round';
    star(x,c,c,12,s*.47,s*.27,-Math.PI/2,.28);x.fillStyle=INK;x.fill();
    star(x,c,c,12,s*.47-s*.05,s*.27-s*.04,-Math.PI/2,.28);x.fillStyle='#ffffff';x.fill();
    star(x,c,c,10,s*.25,s*.15,-Math.PI/2+.2,.15);x.fillStyle='#fff4b8';x.fill();
  });
}
export function comicSparkTexture(){
  return sparkTex||=canvasTexture((x,s)=>{
    const c=s/2;x.lineJoin='round';
    star(x,c,c,4,s*.48,s*.12,-Math.PI/2);x.fillStyle=INK;x.fill();
    star(x,c,c,4,s*.48-s*.07,s*.12-s*.04,-Math.PI/2);x.fillStyle='#ffffff';x.fill();
  },128);
}
export function comicRingTexture(){
  return ringTex||=canvasTexture((x,s)=>{
    const c=s/2;x.lineWidth=s*.075;x.strokeStyle=INK;x.beginPath();x.arc(c,c,s*.42,0,Math.PI*2);x.stroke();
    x.lineWidth=s*.04;x.strokeStyle='#ffffff';x.beginPath();x.arc(c,c,s*.42,0,Math.PI*2);x.stroke();
  });
}
