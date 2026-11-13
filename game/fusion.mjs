// Fusion merge: the real cushions of a merge group melt into one gel body,
// swell slightly and pop like a balloon; the new stone then drops in.
// The body is an implicit surface (smooth union of the original cushion
// shape). It is meshed in a Web Worker (fusion-core.mjs) one frame ahead of
// display, so the main thread only uploads finished buffers; the game's gel
// optics shade it with a ray-marched boundary patched to the same field.
// The torn skin is animated on the GPU from a tiny per-shard state texture.
import {pillowTopHeight} from './original-gel-models.js?v=menu-1';
import {createHost,capsuleIndex} from './fusion-core.mjs?v=fuse-3';
import {flags} from './flags.mjs?v=speed-2';

export function createFusion({internals:I,graphics}){
  const {THREE}=I,P=I.PARAMETERS,G=I.HUD_PARAMETERS.gel,scene=graphics.scene;
  const pitch=P.board.pitch,floor=P.board.floor;
  const BOARD=new THREE.Vector3(1.02,1.02/.92,1.02),INFL=1.12,STEP=pitch/1.02,MAXN=5;
  // GPU programs are freed late: a scene-wide compileAsync elsewhere may still
  // poll a material that was in the scene when it started.
  const later=fn=>setTimeout(fn,8000);
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  const ease=t=>t*t*(3-2*t),easeOut=t=>1-(1-t)**3,easeIn=t=>t*t*t;
  let seed=11;const rand=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
  const now=()=>performance.now();
  // The swell and the burst run this much faster than the lab model.
  const BURST=1.9;

  // ---------- quality tiers (phones start one step lighter) ----------
  const coarse=matchMedia?.('(pointer: coarse)').matches,cores=navigator.hardwareConcurrency||4;
  const TIERS=[{PHI:64,CAP:14,mid:.05,debris:1},{PHI:48,CAP:11,mid:.065,debris:.75},{PHI:40,CAP:9,mid:.085,debris:.55}];
  let tier=coarse||cores<=4?1:0,meshEma=0,meshPeak=0,meshFrames=0,slowEma=0;
  // Worker mesh time: if it cannot keep up with 60 Hz, later fusions step down.
  function noteMesh(ms){
    meshEma=meshFrames?meshEma*.85+ms*.15:ms;meshFrames++;meshPeak=Math.max(meshPeak,ms);
    if(meshFrames<20)return;
    slowEma=slowEma?slowEma*.9+ms*.1:ms;
    if(slowEma>13&&tier<TIERS.length-1){tier++;slowEma=0;meshFrames=0;}
  }
  // Main-thread cost of the fusion per frame (QA).
  const mainTimes=[];let mainPeak=0,frameMain=0,chargeTime=-1;
  const charge=t0=>{const tm=I.time;
    if(tm!==chargeTime){if(frameMain>0){mainTimes.push(frameMain);if(mainTimes.length>4000)mainTimes.splice(0,2000);mainPeak=Math.max(mainPeak,frameMain);}frameMain=0;chargeTime=tm;}
    frameMain+=now()-t0;};

  // ---------- the mesher: a module worker, or the same code inline ----------
  const half=G.width/2,J=G.height+G.dome+G.footClip,Y0=J/2-G.footClip,HD=G.height+G.dome,TH=96,PH=192;
  const gel=JSON.parse(JSON.stringify(G));
  let channel=null,inline=false,tablesReady=false,r0Texture=null,resolveTables;
  const tablesPromise=new Promise(r=>resolveTables=r);
  const lineMap=new Map(),tears=new Map();let lineSeq=1,tearSeq=1;
  function onMessage(msg){
    const t0=now();
    if(msg.type==='tables'){
      const data=new Uint16Array(TH*PH);for(let i=0;i<TH*PH;i++)data[i]=THREE.DataUtils.toHalfFloat(msg.R0[i]);
      r0Texture=new THREE.DataTexture(data,PH,TH,THREE.RedFormat,THREE.HalfFloatType);
      r0Texture.wrapS=THREE.RepeatWrapping;r0Texture.wrapT=THREE.ClampToEdgeWrapping;r0Texture.magFilter=r0Texture.minFilter=THREE.LinearFilter;r0Texture.needsUpdate=true;
      tablesReady=true;resolveTables();return;
    }
    if(msg.type==='mesh'){const line=lineMap.get(msg.id);if(line)line.receive(msg);charge(t0);return;}
    if(msg.type==='tear'){const t=tears.get(msg.rid);if(t){tears.delete(msg.rid);t.resolve(msg.out);}charge(t0);}
  }
  function useInline(){
    if(inline)return;inline=true;
    const handle=createHost(msg=>Promise.resolve().then(()=>onMessage(msg)));
    channel={post(msg){handle(msg);}};
    if(!tablesReady)channel.post({type:'init',G:gel});
    // Replay what a dead worker may have dropped.
    for(const line of lineMap.values())line.reopen();
    for(const [rid,t] of tears)channel.post(t.msg);
  }
  if(flags.noworker)setTimeout(useInline,0);
  else try{
    const worker=new Worker(new URL('./fusion-worker.mjs?v=fuse-3',import.meta.url),{type:'module'});
    worker.onmessage=e=>onMessage(e.data);
    worker.onerror=e=>{e.preventDefault?.();console.warn('fusion worker unavailable, meshing inline');try{worker.terminate();}catch{}useInline();};
    channel={post(msg,transfer){worker.postMessage(msg,transfer||[]);}};
    channel.post({type:'init',G:gel});
    // A silent iOS module-worker (no error event) must not leave meshing stuck.
    setTimeout(()=>{if(!tablesReady&&!inline){console.warn('fusion worker silent, meshing inline');try{worker.terminate();}catch{}useInline();}},2500);
  }catch{setTimeout(useInline,0);}
  const post=(msg,transfer)=>channel.post(msg,transfer);
  function requestTear(msg){
    const rid=tearSeq++;msg.type='tear';msg.rid=rid;msg.seed=1+Math.floor(rand()*2e9);
    return new Promise(resolve=>{tears.set(rid,{msg,resolve});post(msg);});
  }

  // ---------- the gel material with the fused boundary ----------
  function fusedMaterial(value){
    const material=I.createHudMaterial(value);
    const u={uFuseA:{value:Array.from({length:MAXN},()=>new THREE.Vector4())},uFuseB:{value:Array.from({length:MAXN},()=>new THREE.Vector4())},
      uFuseN:{value:1},uFuseK:{value:0},uFuseW:{value:new THREE.Vector4()},uFuseR0:{value:r0Texture}};
    const base=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
    material.onBeforeCompile=function(shader,renderer){
      base.call(this,shader,renderer);Object.assign(shader.uniforms,u);
      shader.fragmentShader=shader.fragmentShader.replace('float gelBoundary(vec3 p){',`
        uniform vec4 uFuseA[${MAXN}];uniform vec4 uFuseB[${MAXN}];uniform int uFuseN;uniform float uFuseK;uniform vec4 uFuseW;uniform sampler2D uFuseR0;
        float fuseCushion(vec4 a,vec4 b,vec3 p){
          float qx=p.x-a.x;qx/=1.0+(qx>0.0?b.z:b.y);
          vec3 v=vec3(qx/a.z,p.y/a.w-${Y0.toFixed(5)},(p.z-a.y)/b.x);float len=max(length(v),1e-5);
          float th=acos(clamp(v.y/len,-1.0,1.0))/3.14159265;float ph=atan(v.z,v.x)/6.2831853;
          float r=texture2D(uFuseR0,vec2(ph+.5/${PH}.0,th*${((TH-1)/TH).toFixed(6)}+.5/${TH}.0)).r;
          r=mix(r,min(r,.98+.12*v.y/len),uFuseW.w);
          return (len-r)*min(min(a.z,a.w),b.x);
        }
        float fuseField(vec3 p){
          float d=1e9;
          for(int i=0;i<${MAXN};i++){if(i>=uFuseN)break;float e=fuseCushion(uFuseA[i],uFuseB[i],p);
            if(uFuseK<=1e-5)d=min(d,e);else{float h=max(uFuseK-abs(d-e),0.0)/uFuseK;d=min(d,e)-h*h*uFuseK*.25;}}
          float t=uFuseW.y;
          d+=uFuseW.x*sin(p.x*5.3-t*21.0)*cos(p.z*4.1+t*13.0)*clamp(p.y/.9,0.0,1.0)
            +uFuseW.z*sin(p.x*17.0+t*93.0)*sin(p.y*15.0-t*71.0)*cos(p.z*13.0+t*57.0);
          return d;
        }
        float gelBoundary(vec3 p){if(p.y<0.0)return 1.0-p.y*8.0;return 1.0+fuseField(p)*5.0;}
        float gelBoundaryOriginal(vec3 p){`);
    };
    material.customProgramCacheKey=()=>key()+'|fused-1';
    material.userData.fuse=u;
    return material;
  }

  // `snap`: {n,k,ripple,rippleT,tremble,round,c:Float64Array(n*7)} (x,z,sx,sy,sz,bl,br)
  function syncUniforms(snap,material){
    const u=material.userData.fuse,c=snap.c;u.uFuseN.value=snap.n;u.uFuseK.value=snap.k;u.uFuseR0.value=r0Texture;
    u.uFuseW.value.set(snap.ripple,snap.rippleT,snap.tremble,snap.round);
    for(let i=0;i<snap.n;i++){const o=i*7;u.uFuseA.value[i].set(c[o],c[o+1],c[o+2],c[o+3]);u.uFuseB.value[i].set(c[o+4],c[o+5],c[o+6],0);}
  }
  const makeField=()=>({n:0,k:0,ripple:0,rippleT:0,tremble:0,round:0,c:Array.from({length:MAXN},()=>({x:0,z:0,sx:1,sy:1,sz:1,bl:0,br:0}))});
  function snapshot(f){
    const c=new Float64Array(f.n*7);
    for(let i=0;i<f.n;i++){const s=f.c[i],o=i*7;c[o]=s.x;c[o+1]=s.z;c[o+2]=s.sx;c[o+3]=s.sy;c[o+4]=s.sz;c[o+5]=s.bl;c[o+6]=s.br;}
    return {n:f.n,k:f.k,ripple:f.ripple,rippleT:f.rippleT,tremble:f.tremble,round:f.round,c};
  }

  // ---------- the fused mesh: a capsule of rings along the line ----------
  const midFor=(xs,midStep)=>Math.max(4,Math.ceil((Math.max(...xs)-Math.min(...xs))/midStep/4)*4);
  // Blobs (gel body, material, fixed-size buffers) are pooled per colour and
  // tier and pre-built when idle, so a merge never builds one on the spot.
  const indexCache=new Map(),blobPool=new Map();
  const tierFor=n=>Math.min(TIERS.length-1,tier+(coarse&&n>=4?1:0));
  function createBlob(value,ti){
    const s=I.buildSquishy(value,fusedMaterial(value));
    s.group.name='HUD_fusion';s.group.visible=false;s.deformation={sway:0,swayZ:0,squash:0};
    s.group.remove(s.label);s.label.geometry.dispose();s.label.material.dispose();s.label=null;
    const geometry=new THREE.BufferGeometry();s.body.geometry.dispose();s.body.geometry=geometry;s.body.frustumCulled=false;
    I.bindGelOptics(s);s.bubbles.visible=false;
    const q=TIERS[ti];
    // Room for the widest line (five cushions) in one buffer set: no per-frame allocation.
    const capMid=midFor([0,4*STEP],q.mid)+8,ringCount=q.CAP*2+capMid+1,count=ringCount*q.PHI,key=ringCount+'|'+q.PHI;
    let index=indexCache.get(key);if(!index){index=capsuleIndex(ringCount,q.PHI);indexCache.set(key,index);}
    const position=new Float32Array(count*3),normal=new Float32Array(count*3),uv=new Float32Array(count*2);
    geometry.setIndex(new THREE.BufferAttribute(index,1));
    geometry.setAttribute('position',new THREE.BufferAttribute(position,3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal',new THREE.BufferAttribute(normal,3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0,0);geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),12);
    return {s,geometry,position,normal,uv,verts:0,tris:0,capMid,PHI:q.PHI,CAP:q.CAP,midStep:q.mid,debris:q.debris,value,ti};
  }
  function takeBlob(value,n){
    const ti=tierFor(n),list=blobPool.get(value+'|'+ti);
    const blob=list?.length?list.pop():createBlob(value,ti);blob.inUse=true;return blob;
  }
  function releaseBlob(blob){
    const {s}=blob,m=s.body.material;blob.inUse=false;
    s.group.visible=false;s.group.position.set(0,0,0);s.group.rotation.set(0,0,0);s.group.scale.set(1,1,1);
    blob.geometry.setDrawRange(0,0);blob.verts=blob.tris=0;
    m.attenuationDistance=G.attenuationDistance;m.roughness=G.roughness;m.envMapIntensity=G.envMapIntensity;
    const key=blob.value+'|'+blob.ti,list=blobPool.get(key)||[];
    const keep=coarse?1:3;
    if(list.length<keep)list.push(blob);else later(()=>{blob.geometry.dispose();m.dispose();});
    blobPool.set(key,list);
  }
  // Draw a fresh blob once off screen while idle, so its buffers and vertex
  // state are uploaded before the merge that uses it.
  function prime(blob){
    if(flags.noprewarm)return;
    const g=blob.s.group;if(blob.verts)return;
    g.position.set(0,-80,0);g.scale.setScalar(1e-3);g.visible=true;blob.s.body.frustumCulled=false;blob.geometry.setDrawRange(0,3);scene.add(g);
    let frames=0;const done=()=>{if(blob.inUse)return;scene.remove(g);g.visible=false;blob.geometry.setDrawRange(0,0);g.scale.set(1,1,1);g.position.set(0,0,0);};
    I.job({update(){if(++frames<2&&!blob.inUse){I.requestFrame();return false;}done();return true;},cancel:done});
    I.requestFrame();
  }
  // One spare blob on phones, a few on desktop. Building one for every colour
  // plus the next value was enough to exhaust iPhone GPU memory once the
  // starting tiles had landed and the fused programs were uploaded.
  let prefillTimer=0;
  function prefill(){
    if(flags.noprewarm)return;
    if(prefillTimer)return;
    prefillTimer=setTimeout(function step(){
      prefillTimer=0;if(runs.size){prefill();return;}
      const wanted=coarse?1:4;let filled=0;for(const list of blobPool.values())filled+=list.length;
      if(filled>=wanted)return;
      const values=new Set();for(const t of graphics.tiles)values.add(t.value);
      for(const v of values){if(!(v>0))continue;const key=v+'|'+tierFor(1);if(!(blobPool.get(key)?.length)){const list=blobPool.get(key)||[];const blob=createBlob(v,tierFor(1));list.push(blob);blobPool.set(key,list);prime(blob);prefill();return;}}
    },coarse?700:250);
  }
  function trimPool(){
    const keep=coarse?1:2;
    let keepLeft=keep;
    for(const [key,list] of blobPool){
      while(list.length&&keepLeft<=0){const blob=list.pop();if(blob.inUse){list.push(blob);break;}later(()=>{blob.geometry.dispose();blob.s.body.material.dispose();});}
      keepLeft-=list.length;
    }
  }
  // Digit meshes are cloned from one template per value (the crisp label
  // factory rebuilds and re-curves its grid each time).
  const labelTemplates=new Map();
  function labelFor(value){
    let t=labelTemplates.get(value);
    if(!t){const label=I.createLabel(value);
      const rest=label.userData.rest||label.geometry.attributes.position.array.slice(),off=new Float32Array(rest.length/3);
      for(let i=0;i<off.length;i++)off[i]=rest[i*3+1]-pillowTopHeight(rest[i*3],rest[i*3+2]);
      t={label,rest,off};labelTemplates.set(value,t);
      // Upload the digit coverage now, not on the frame the new stone appears.
      try{if(label.material.alphaMap)graphics.renderer.initTexture?.(label.material.alphaMap);}catch{}}
    const material=t.label.material.clone();material.transparent=true;material.opacity=1;
    const label=new THREE.Mesh(t.label.geometry.clone(),material);label.name=t.label.name;label.castShadow=false;
    label.userData.rest=t.rest;label.userData.off=t.off;return label;
  }

  // ---------- debris: torn gel skin, droplets and a short flash ----------
  const flashTexture=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');
    const g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.18,'rgba(255,250,240,.85)');g.addColorStop(.5,'rgba(255,240,230,.22)');g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g;x.fillRect(0,0,128,128);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
  const dropGeometry=new THREE.SphereGeometry(1,14,10);
  function skinMaterial(value,{thick=.12,side=THREE.DoubleSide}={}){
    I.ensureColor(value);
    const tint=new THREE.Color(P.colors[value]||P.colors[1]);
    const dye=tint.clone();const mx=Math.max(dye.r,dye.g,dye.b)||1;dye.multiplyScalar(1/mx);
    return new THREE.MeshPhysicalMaterial({color:tint.clone().multiplyScalar(.82),metalness:0,roughness:.1,transmission:.32,thickness:thick,ior:1.42,
      attenuationColor:new THREE.Color(Math.max(.02,dye.r**1.3),Math.max(.02,dye.g**1.3),Math.max(.02,dye.b**1.3)),attenuationDistance:.16,
      clearcoat:1,clearcoatRoughness:.03,side,envMap:scene.environment,envMapIntensity:1.7,specularIntensity:1});
  }
  // Shard pieces are posed in the vertex shader: per shard, texel 0 holds the
  // position and scale, texel 1 the rotation, texel 2 the bend normal and amount.
  const blankShards=new THREE.DataTexture(new Float32Array(16),4,1,THREE.RGBAFormat,THREE.FloatType);blankShards.needsUpdate=true;
  function edgeMaterial(value,shardTexture=blankShards){
    const m=skinMaterial(value,{thick:.22});
    const uniforms={uShard:{value:shardTexture},uGround:{value:floor+.012}};
    m.onBeforeCompile=sh=>{
      Object.assign(sh.uniforms,uniforms);
      sh.vertexShader=sh.vertexShader.replace('#include <common>',`#include <common>
attribute float aEdge;attribute float aShard;varying float vEdge;uniform highp sampler2D uShard;uniform float uGround;
vec3 shardTurn(vec4 q,vec3 v){return v+2.0*cross(q.xyz,cross(q.xyz,v)+q.w*v);}`)
        .replace('#include <beginnormal_vertex>',`int shardRow=int(aShard+.5);
vec4 shardP=texelFetch(uShard,ivec2(0,shardRow),0),shardQ=texelFetch(uShard,ivec2(1,shardRow),0),shardN=texelFetch(uShard,ivec2(2,shardRow),0);
vec3 objectNormal=shardTurn(shardQ,normal);
#ifdef USE_TANGENT
vec3 objectTangent=vec3(tangent.xyz);
#endif`)
        .replace('#include <begin_vertex>',`vec3 transformed=position*shardP.w-shardN.xyz*(shardN.w*min(dot(position,position),.35)*.8*shardP.w);
transformed=shardTurn(shardQ,transformed)+shardP.xyz;transformed.y=max(uGround,transformed.y);vEdge=aEdge;`);
      sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying float vEdge;').replace('void main() {','void main() {\nif(vEdge<0.0)discard;');
    };
    m.customProgramCacheKey=()=>'fusion-skin-gpu-2';m.userData.shard=uniforms;return m;
  }
  const debrisSet=new Set();
  // `source`: the tear request (local positions, normals, triangles and the world
  // matrix). Resolves to a handle once the worker has cut the skin.
  async function createDebris({source,born=generation,value,power=3,amount=1,gold=false,skin:withSkin=true,flash:withFlash=true,obstacles=[],originAtTop=false,delay=0}){
    const K=withSkin?Math.round((20+power*6)*amount):0,D=Math.round((40+power*10)*amount);
    const out=await requestTear({...source,K,D});
    if(!out||born!==generation)return null;
    const t0=now();
    const group=new THREE.Group();group.name='Fusion_debris';scene.add(group);
    const center=new THREE.Vector3().fromArray(out.center);
    const origin=originAtTop&&out.top?new THREE.Vector3().fromArray(out.top).add(new THREE.Vector3(.25,0,.35)):center.clone().add(new THREE.Vector3(0,.5,0));
    const shards=[];let skin=null,skinMat=null,sg=null,shardTexture=null,shardData=null;
    if(out.K){
      for(let k=0;k<out.K;k++){
        const c=new THREE.Vector3().fromArray(out.centers,k*3),avgN=new THREE.Vector3().fromArray(out.avgN,k*3);
        const shard={c0:c.clone(),p:c.clone(),v:new THREE.Vector3(),axis:new THREE.Vector3(rand()-.5,rand()-.5,rand()-.5).normalize(),spin:(rand()*2-1)*13,
          q:new THREE.Quaternion(),start:0,life:.36+rand()*.3,landed:false,n:avgN,curl:(.7+rand()*1.1),scale:1,bend:0};
        const away=c.clone().sub(origin),d=away.length();away.normalize();shard.start=d/42;
        const o=c.clone().sub(center);o.y*=.6;o.normalize();
        // Mostly up and out: a balloon skin snaps away, it doesn't skid across the board.
        shard.v.copy(o).multiplyScalar(2.2+rand()*1.6).addScaledVector(away,1.1+rand()*.8).add(new THREE.Vector3(0,1.6+rand()*1.6,0));
        shards.push(shard);
      }
      shardData=new Float32Array(4*4*out.K);
      shardTexture=new THREE.DataTexture(shardData,4,out.K,THREE.RGBAFormat,THREE.FloatType);shardTexture.magFilter=shardTexture.minFilter=THREE.NearestFilter;
      sg=new THREE.BufferGeometry();
      sg.setAttribute('position',new THREE.BufferAttribute(out.rest,3));sg.setAttribute('normal',new THREE.BufferAttribute(out.restN,3));
      sg.setAttribute('aEdge',new THREE.BufferAttribute(out.aEdge,1));sg.setAttribute('aShard',new THREE.BufferAttribute(out.aShard,1));
      sg.boundingSphere=new THREE.Sphere(new THREE.Vector3(),40);
      skinMat=edgeMaterial(value,shardTexture);
      skin=new THREE.Mesh(sg,skinMat);skin.frustumCulled=false;group.add(skin);
    }
    // Gel droplets: the inside of the balloon sprays out.
    const drops=[],Dn=out.drops.length/3;
    const dm=skinMaterial(value,{thick:.5,side:THREE.FrontSide});dm.attenuationDistance=.35;
    const im=new THREE.InstancedMesh(dropGeometry,dm,Math.max(1,Dn));im.frustumCulled=false;group.add(im);
    for(let d=0;d<Dn;d++){
      const p=new THREE.Vector3().fromArray(out.drops,d*3);
      const dir=p.clone().sub(center);dir.y*=.7;dir.normalize();const r=(.028+rand()**2*.09)*(1+power*.06);
      drops.push({p,v:dir.multiplyScalar(1.8+rand()*3).add(new THREE.Vector3((rand()-.5)*.8,1.8+rand()*2.4,(rand()-.5)*.8)),r,landed:0,life:.42+rand()*.4,delay:rand()*.04});
    }
    const tint=new THREE.Color(P.colors[value]||P.colors[1]).lerp(new THREE.Color(1,1,1),.3);if(gold)tint.lerp(new THREE.Color('#ffd27a'),.6);
    const flash=new THREE.Sprite(new THREE.SpriteMaterial({map:flashTexture,color:tint,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));
    flash.position.copy(center);flash.renderOrder=5;group.add(flash);
    const core=new THREE.Sprite(new THREE.SpriteMaterial({map:flashTexture,color:0xffffff,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));
    core.position.copy(center);core.renderOrder=6;group.add(core);
    const g=-17,ground=floor+.012,m4=new THREE.Matrix4(),q=new THREE.Quaternion(),qs=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),sc=new THREE.Vector3(),tmp=new THREE.Vector3();
    // Land on a neighbouring stone instead of passing through it.
    const surfaceAt=(x,z)=>{for(const o of obstacles)if(Math.abs(x-o.x)<o.hx&&Math.abs(z-o.z)<o.hz)return o.top;return ground;};
    let age=-delay;
    const big=1+power*.12;
    function update(realDt){
      const dt=realDt*BURST;age+=dt;
      group.visible=age>=0;if(age<0)return true;
      const fa=age/.2;flash.visible=withFlash&&fa<1;core.visible=withFlash&&age<.09;
      if(flash.visible){const s=(1.4+4.2*easeOut(fa))*big;flash.scale.set(s,s,1);flash.material.opacity=(1-fa)**2*.8;}
      if(core.visible){const s=(.9+2.2*easeOut(age/.09))*Math.sqrt(big);core.scale.set(s,s,1);core.material.opacity=1-age/.09;}
      for(let k=0;k<shards.length;k++){const s=shards[k];
        const t=age-s.start;
        if(t<=0){s.scale=.985;}
        else{
          if(!s.landed){s.v.y+=g*.55*dt;s.v.multiplyScalar(Math.exp(-dt*2.6));s.p.addScaledVector(s.v,dt);
            s.q.premultiply(qs.setFromAxisAngle(s.axis,s.spin*dt));
            const floorY=surfaceAt(s.p.x,s.p.z)+.03;
            if(s.p.y<floorY&&s.v.y<0){
              // Hitting a stone's side (it was below its top): stop and slide down its face.
              if(floorY>ground+.05&&s.p.y<floorY-.25){s.v.x*=-.25;s.v.z*=-.25;s.p.y=Math.max(s.p.y,ground+.03);}
              else{s.p.y=floorY;s.v.y*=-.22;s.v.x*=.45;s.v.z*=.45;s.spin*=.3;if(Math.abs(s.v.y)<.4)s.landed=true;}}}
          // Torn rubber snaps back toward each piece's centre, then fades away.
          const snap=1-.58*easeOut(clamp(t/.16)),fade=1-ease(clamp((t-s.life)/.28));s.scale=snap*fade;s.bend=s.curl*easeOut(clamp(t/.2));
        }
        const o=k*16,started=t>0,px=started?s.p.x:s.c0.x+s.n.x*.004,py=started?s.p.y:s.c0.y+s.n.y*.004,pz=started?s.p.z:s.c0.z+s.n.z*.004;
        shardData[o]=px;shardData[o+1]=py;shardData[o+2]=pz;shardData[o+3]=s.scale;
        shardData[o+4]=s.q.x;shardData[o+5]=s.q.y;shardData[o+6]=s.q.z;shardData[o+7]=s.q.w;
        shardData[o+8]=s.n.x;shardData[o+9]=s.n.y;shardData[o+10]=s.n.z;shardData[o+11]=s.bend;
      }
      if(shardTexture)shardTexture.needsUpdate=true;
      for(let i=0;i<drops.length;i++){const d=drops[i];
        const t=age-d.delay;let shown=t>0?1:0;
        if(t>0&&!d.landed){d.v.y+=g*dt;d.v.multiplyScalar(Math.exp(-dt*.9));d.p.addScaledVector(d.v,dt);
          const gy=surfaceAt(d.p.x,d.p.z);
          if(d.p.y<gy+d.r*.35){
            if(gy>ground+.05&&d.p.y<gy-.25){d.v.x*=-.2;d.v.z*=-.2;}
            else{d.p.y=gy+d.r*.35;d.landed=t;d.v.set(d.v.x*.12,0,d.v.z*.12);}}}
        else if(d.landed)d.p.addScaledVector(d.v,dt);
        if(t>0){
          if(d.landed){const lt=t-d.landed;const spread=1+.9*easeOut(clamp(lt/.08));const fade=1-ease(clamp((t-d.life)/.25));
            sc.set(d.r*spread*fade,d.r*.38*fade,d.r*spread*fade);q.identity();}
          else{const sp=d.v.length(),st=1+Math.min(1.6,sp*.07);sc.set(d.r/Math.sqrt(st),d.r*st,d.r/Math.sqrt(st));q.setFromUnitVectors(up,tmp.copy(d.v).normalize());}
          if(sc.x<1e-4)shown=0;
        }
        if(!shown)sc.set(0,0,0);
        m4.compose(d.p,q,sc);im.setMatrixAt(i,m4);
      }
      im.instanceMatrix.needsUpdate=true;
      return age<1.8;
    }
    update(0);
    function dispose(){if(!debrisSet.has(handle))return;scene.remove(group);debrisSet.delete(handle);later(()=>{sg?.dispose();skinMat?.dispose();shardTexture?.dispose();dm.dispose();im.dispose();flash.material.dispose();core.material.dispose();});}
    const handle={update,dispose,center};debrisSet.add(handle);
    I.job({update(time,dt){if(!debrisSet.has(handle))return true;const t1=now();const alive=update(dt);charge(t1);I.requestFrame();if(!alive){dispose();return true;}return false;},cancel(){dispose();}});
    charge(t0);
    return handle;
  }
  function obstaclesExcept(ids){
    const top=floor+HD*BOARD.y*INFL*1.05,hx=half*1.02*1.04;
    return graphics.tiles.filter(t=>!ids.has(t.id)&&t.group.visible).map(t=>({x:t.group.position.x,z:t.group.position.z,hx,hz:hx,top}));
  }

  // ---------- one fusion line: cushions along x in the blob's local frame ----------
  // axis 'row': local x = world x; axis 'col': the group turns so local x = world z.
  function createLine({axis,fixed,cushions,targetIndex,value}){
    const field=makeField();
    const blob=takeBlob(value,cushions.length),capMid=blob.capMid;
    const group=blob.s.group,id=lineSeq++,turned=axis!=='row';
    if(axis==='row')group.position.set(0,floor,(fixed-2)*pitch);else{group.position.set((fixed-2)*pitch,floor,0);group.rotation.y=-Math.PI/2;}
    group.scale.copy(BOARD);scene.add(group);
    const labels=cushions.map(c=>{const l=labelFor(c.value);l.visible=false;group.add(l);return l;});
    // Digit rest coordinates in the line frame (a turned line keeps them upright on screen).
    const labelRest=labels.map(l=>{const r=l.userData.rest,n=r.length/3,rx=new Float32Array(n),rz=new Float32Array(n);
      for(let i=0;i<n;i++){rx[i]=turned?r[i*3+2]:r[i*3];rz[i]=turned?-r[i*3]:r[i*3+2];}return {rx,rz};});
    field.n=cushions.length;
    cushions.forEach((c,i)=>Object.assign(field.c[i],{x:c.u,z:0,sx:c.scale||1,sy:c.scale||1,sz:c.scale||1,bl:0,br:0}));
    const m4=new THREE.Matrix4(),pos=new THREE.Vector3(),scl=new THREE.Vector3();
    const proxies=cushions.map((_,i)=>({get value(){return value;},deformation:{sway:0,swayZ:0,squash:0},group:{
      get visible(){return group.visible&&i<field.n;},userData:{},
      get position(){const c=field.c[i];return pos.set(c.x*BOARD.x,0,c.z*BOARD.z).applyQuaternion(group.quaternion).add(group.position);},
      get scale(){const c=field.c[i];return scl.set(BOARD.x*c.sx,BOARD.y*INFL*c.sy,BOARD.z*c.sz);},
      get matrixWorld(){return m4.compose(this.position,group.quaternion,this.scale);},
    }}));
    let shadows=false,inflight=false,dirty=false,seq=0,bufs=null,opacity=1;const topBufs=[];
    function open(){post({type:'open',id,PHI:blob.PHI,CAP:blob.CAP,midStep:blob.midStep,capMid,labels:labelRest});}
    function dispatch(){
      if(line.disposed)return;dirty=false;inflight=true;
      const snap=snapshot(field),oy=Y0*field.c[0].sy,drape=[];
      for(let i=0;i<field.n;i++)if(opacity*(cushions[i].label??1)>.01)drape.push({i,oy});
      const msg={type:'mesh',id,seq:++seq,field:snap,drape,bufs,topBufs:topBufs.slice()};
      const transfer=bufs?[bufs.pos.buffer,bufs.nor.buffer,bufs.uv.buffer]:[];
      for(const b of topBufs)if(b)transfer.push(b.buffer);
      bufs=null;topBufs.length=0;line.pending={snap,opacity};
      post(msg,inline?undefined:transfer);
    }
    const line={id,field,blob,group,labels,cushions,targetIndex,value,ready:false,pending:null,
      show(){group.visible=true;if(!shadows){shadows=true;for(const p of proxies)I.setting.addHudShadow(p);}},
      hideShadows(){if(shadows){shadows=false;for(const p of proxies)I.setting.removeHudShadow(p);}},
      // Ask for a mesh of the current field; the newest request wins.
      remesh(labelOpacity){const t0=now();opacity=labelOpacity;if(inflight)dirty=true;else dispatch();charge(t0);},
      receive(msg){
        if(line.disposed||msg.seq!==seq)return;inflight=false;
        const {snap,opacity:shown}=line.pending,b=msg.bufs,{verts,tris}=msg.info;
        blob.position.set(b.pos.subarray(0,verts*3));blob.normal.set(b.nor.subarray(0,verts*3));blob.uv.set(b.uv.subarray(0,verts*2));
        const g=blob.geometry;g.attributes.position.needsUpdate=g.attributes.normal.needsUpdate=g.attributes.uv.needsUpdate=true;
        g.setDrawRange(0,tris);blob.verts=verts;blob.tris=tris;bufs=inline?null:b;
        syncUniforms(snap,blob.s.body.material);
        const draped=new Set();const c=snap.c,oy=Y0*c[3];
        for(const {i,out} of msg.tops){
          const l=labels[i],o=i*7,rest=labelRest[i],off=l.userData.off,a=l.geometry.attributes.position.array;
          for(let v=0;v<off.length;v++){a[v*3]=c[o]+rest.rx[v]*c[o+2];a[v*3+2]=c[o+1]+rest.rz[v]*c[o+4];const top=out[v];a[v*3+1]=top===top?top+off[v]*c[o+3]:oy;}
          l.geometry.attributes.position.needsUpdate=true;l.geometry.computeBoundingSphere();
          l.material.opacity=shown*(cushions[i].label??1);l.visible=true;draped.add(i);if(!inline)topBufs[i]=out;
        }
        labels.forEach((l,i)=>{if(!draped.has(i))l.visible=false;});
        const bubbles=blob.s.bubbles.children,layout=I.HUD_PARAMETERS.bubbles.layout;
        bubbles.forEach((bb,k)=>{const o=(k%snap.n)*7,l=layout[k];bb.position.set(c[o]+l[0]*c[o+2],l[1]*c[o+3],c[o+1]+l[2]*c[o+4]);bb.scale.set(c[o+2],c[o+3],c[o+4]);});
        noteMesh(msg.ms);
        line.ready=true;I.requestFrame({shadows:true});
        if(dirty)dispatch();
      },
      reopen(){open();bufs=null;topBufs.length=0;if(inflight){inflight=false;dispatch();}},
      // The tear request for this body's current mesh.
      tearSource(){
        const matrix=new THREE.Matrix4().compose(group.position,group.quaternion,new THREE.Vector3(BOARD.x,BOARD.y*INFL,BOARD.z));
        const nm=new THREE.Matrix3().getNormalMatrix(matrix);
        return {lineId:id,triCount:blob.tris,position:blob.position.slice(0,blob.verts*3),normal:blob.normal.slice(0,blob.verts*3),matrix:matrix.elements.slice(),nmatrix:nm.elements.slice()};
      },
      dispose(){if(line.disposed)return;line.disposed=true;lineMap.delete(id);
        // Pending tears of this body still need its triangles in the worker.
        setTimeout(()=>post({type:'close',id}),1500);
        line.hideShadows();scene.remove(group);for(const l of labels)group.remove(l);releaseBlob(blob);later(()=>{for(const l of labels){l.geometry.dispose();l.material.dispose();}});},
    };
    lineMap.set(id,line);open();
    return line;
  }

  // ---------- planning: break any merge shape into straight lines ----------
  // The line through the target is fused last; perpendicular branches are
  // absorbed into their cell on that line first, so every neck forms along
  // a straight axis whatever shape the merge has (row, column, L, T, plus).
  function planGroup(spec){
    const map=new Map(spec.cells.map(c=>[c.row*5+c.col,c]));
    const has=(r,c)=>r>=0&&r<5&&c>=0&&c<5?map.get(r*5+c):undefined;
    const run=(r,c,dr,dc)=>{let a=0;while(has(r-dr*(a+1),c-dc*(a+1)))a++;let b=0;while(has(r+dr*(b+1),c+dc*(b+1)))b++;
      return {cells:Array.from({length:a+b+1},(_,i)=>has(r+dr*(i-a),c+dc*(i-a))),at:a};};
    const [tr,tc]=spec.target,row=run(tr,tc,0,1),col=run(tr,tc,1,0);
    const mainAxis=row.cells.length>=col.cells.length?'row':'col',main=mainAxis==='row'?row:col;
    const used=new Set(main.cells);
    const branches=[];
    main.cells.forEach((cell,mi)=>{
      const perp=mainAxis==='row'?run(cell.row,cell.col,1,0):run(cell.row,cell.col,0,1);
      const cells=perp.cells.filter(c=>c===cell||!used.has(c));
      // Keep the branch contiguous around its attachment cell.
      const at=cells.indexOf(cell);let lo=at,hi=at;
      while(lo>0&&Math.abs(perp.cells.indexOf(cells[lo-1])-perp.cells.indexOf(cells[lo]))===1)lo--;
      while(hi<cells.length-1&&Math.abs(perp.cells.indexOf(cells[hi+1])-perp.cells.indexOf(cells[hi]))===1)hi++;
      const part=cells.slice(lo,hi+1);
      if(part.length>=2){for(const c of part)used.add(c);branches.push({axis:mainAxis==='row'?'col':'row',cells:part,at:part.indexOf(cell),mainIndex:mi});}
    });
    // Anything left (rare blocks) slides into its nearest fused neighbour.
    const strays=spec.cells.filter(c=>!used.has(c)).map(c=>{
      let best=null,d=Infinity;for(const u of used){const e=Math.abs(u.row-c.row)+Math.abs(u.col-c.col);if(e<d){d=e;best=u;}}
      return {cell:c,into:best};
    });
    return {mainAxis,main:main.cells,targetIndex:main.at,branches,strays};
  }

  // ---------- running merges ----------
  const runs=new Set(),claims=new Map();
  let hurry=1,generation=0,warmHolder=null;
  const tileOf=id=>{try{return graphics.getTile(id);}catch{return null;}};
  function hideTile(id){const t=tileOf(id);if(t){t.group.visible=false;}}
  function showTile(id){const t=tileOf(id);if(t){t.group.visible=true;delete t.group.userData.entryProgress;}}
  const growth=n=>Math.min(1.5,Math.cbrt(n)*.93);
  // Seconds: fused by .26 s, pop at .35 s, new stone in at .39 s (+.22 s drop).
  const TIMING={
    single:{swap:.02,fuse:.03,inflate:.13,pop:.13,drop:.16},
    absorb:{absorb:.16,swap:.16,fuse:.36,inflate:.45,pop:.45,drop:.49},
    normal:{swap:.03,fuse:.26,inflate:.35,pop:.35,drop:.39},
  };

  function startRun(spec,{tempo=1}={}){
    const plan=planGroup(spec),total=spec.cells.length,single=total===1;
    const ids=new Set(spec.cells.map(c=>c.id));
    const uOf=(cell,axis)=>((axis==='row'?cell.col:cell.row)-2)*STEP;
    const fixedOf=(cell,axis)=>axis==='row'?cell.row:cell.col;
    const run={spec,ids,stage:plan.branches.length?'absorb':'fuse',t:0,popped:false,popping:false,landed:false,resultId:spec.resultId,debris:[],
      resolvePop:null,resolveLand:null,tempo};
    run.popPromise=new Promise(r=>run.resolvePop=r);run.landPromise=new Promise(r=>run.resolveLand=r);
    // All real bodies anticipate together.
    for(const c of spec.cells){const t=tileOf(c.id);if(t){t.press.compression=Math.max(t.press.compression,.13);t.press.velocity=1.2;t.amplitude=Math.max(t.amplitude,I.softWobblePower(.3));}}
    const absorbGrow=new Map();
    if(run.stage==='absorb'){
      run.absorb=plan.branches.map(b=>{
        const cushions=b.cells.map(c=>({u:uOf(c,b.axis),value:c.value,id:c.id}));
        const line=createLine({axis:b.axis,fixed:fixedOf(b.cells[0],b.axis),cushions,targetIndex:b.at,value:spec.value});
        absorbGrow.set(b.mainIndex,growth(b.cells.length)*.96);
        line.remesh(1);
        return {line,branch:b};
      });
    }
    run.mainCushions=plan.main.map((c,i)=>({u:uOf(c,plan.mainAxis),value:c.value,id:c.id,scale:absorbGrow.get(i)||1,label:absorbGrow.has(i)?0:1}));
    run.plan=plan;run.single=single;run.total=total;
    run.T=single?TIMING.single:run.stage==='absorb'?TIMING.absorb:TIMING.normal;
    run.finalScale=single?1:growth(total);
    // The main body is meshed ahead, so it is ready the moment it takes over.
    run.main=createLine({axis:plan.mainAxis,fixed:plan.mainAxis==='row'?plan.main[0].row:plan.main[0].col,cushions:run.mainCushions,targetIndex:plan.targetIndex,value:spec.value});
    run.main.remesh(1);
    runs.add(run);
    for(const id of ids){const prev=claims.get(id);if(prev&&prev!==run)prev.lostResult=true;claims.set(id,run);}
    return run;
  }
  function stepAbsorb(run,t){
    const end=run.T.absorb,f=clamp(t/end),fe=ease(f);
    for(const {line,branch} of run.absorb){
      if(!line.shown&&(line.ready||t>.4)){line.shown=true;for(const c of branch.cells)hideTile(c.id);line.show();}
      const field=line.field,n=field.n,ti=line.targetIndex,tx=line.cushions[ti].u,grow=1+(growth(n)*.96-1)*ease(clamp(f*1.1));
      field.rippleT=t;field.k=(.05+.6*ease(clamp(f*1.3)))*(1-ease(clamp((f-.78)/.22)));
      field.ripple=.024*Math.sin(Math.PI*f);field.tremble=0;field.round=0;
      line.cushions.forEach((cu,i)=>{
        const c=field.c[i],lag=Math.abs(i-ti)*.05,p=ease(clamp((f-lag)/(1-lag)));
        c.x=cu.u+(tx-cu.u)*(p+.06*Math.sin(Math.PI*p)*(1-p));
        const wob=Math.sin(t*30+i*1.7)*.03*Math.sin(Math.PI*f);
        c.sy=grow*(1-wob)*(1+.06*fe*(1-f));c.sx=c.sz=grow*(1+wob*.5);
        const bulge=.22*Math.sin(Math.PI*clamp(f*1.6));
        c.bl=c.br=0;if(i<ti)c.br=bulge;else if(i>ti)c.bl=bulge;else{c.bl=ti>0?bulge*.6:0;c.br=ti<n-1?bulge*.6:0;}
      });
      line.remesh(1-ease(clamp((f-.15)/.45)));
    }
    // Hand over once the main body has its first mesh (a frame or two at most).
    if(f>=1&&(run.main.ready||t>end+.2)){run.stage='fuse';stepFuse(run,t);for(const {line} of run.absorb)line.dispose();run.absorb=null;}
  }
  function stepFuse(run,t){
    const T=run.T,n=run.mainCushions.length;
    const line=run.main,field=line.field,ti=line.targetIndex,tx=run.mainCushions[ti].u;
    if(!line.shown&&t>=T.swap&&(line.ready||t>T.swap+.4)){line.shown=true;for(const c of run.mainCushions)hideTile(c.id);line.show();}
    if(!line.shown){
      // Strays and real bodies just anticipate until the swap.
      if(t>=T.swap)run.t=Math.min(run.t,T.swap+.001);
      return;
    }
    const f=clamp((t-T.swap)/(T.fuse-T.swap)),fe=ease(f),inf=clamp((t-T.fuse)/(T.inflate-T.fuse));
    field.rippleT=t;
    field.k=run.single?0:.05+.62*ease(clamp(f*1.25))+.12*inf;
    field.ripple=run.single?.01*inf:.028*Math.sin(Math.PI*clamp(f*1.1))+.012*inf;
    field.tremble=.016*easeIn(clamp((t-T.inflate+.05)/.05));
    field.round=ease(inf)*(run.single?.6:1);
    const grow=1+(run.finalScale-1)*ease(clamp(f*1.1)),swell=1+.11*ease(inf)+.015*Math.sin(t*44)*inf;
    const settle=t>T.fuse&&!run.single?.08*Math.sin((t-T.fuse)*40)*Math.exp(-(t-T.fuse)*12):0;
    run.mainCushions.forEach((cu,i)=>{
      const c=field.c[i],base=cu.scale,lag=Math.abs(i-ti)*.06,p=ease(clamp((f-lag)/(1-lag)));
      c.x=cu.u+(tx-cu.u)*(p+.06*Math.sin(Math.PI*p)*(1-p));
      if(i===ti)c.x=tx+(n>1?-.05*Math.sin(Math.PI*clamp(f*1.4)):0);
      const own=base+(grow-base)*ease(clamp(f*1.1));
      const wob=Math.sin(t*30+i*1.7)*.035*(1-inf)*Math.sin(Math.PI*f);
      const squash=!T.absorb&&t<T.swap+.07?.08*Math.sin(Math.PI*clamp((t-T.swap+.03)/.1)):0;
      c.sy=(own*swell)*(1-squash-wob-settle)*(1+.08*fe*(1-inf))*(1+.03*inf);c.sx=c.sz=(own*swell)*(1+squash*.6+wob*.5+settle*.5);
      c.bl=c.br=0;
      const bulge=.22*Math.sin(Math.PI*clamp(f*1.6))*(1-inf);
      if(i<ti)c.br=bulge;else if(i>ti)c.bl=bulge;else{c.bl=ti>0?bulge*.6:0;c.br=ti<n-1?bulge*.6:0;}
    });
    // Strays slide in as real bodies and are swallowed.
    for(const s of run.plan.strays){const tile=tileOf(s.cell.id);if(tile){const k=clamp(f/.3),snap=k*k*k;tile.group.scale.setScalar(1-.94*snap);if(k>=1)tile.group.visible=false;}}
    const m=line.blob.s.body.material;m.attenuationDistance=G.attenuationDistance*(1+1.2*ease(inf));m.roughness=G.roughness*(1-.6*inf);m.envMapIntensity=G.envMapIntensity*(1+.5*inf);
    line.remesh(1-ease(clamp((f-.18)/.42)));
    if(t>=T.pop)pop(run);
  }
  // The worker cuts the skin from the current mesh; the body pops when the
  // pieces are ready (normally the next frame) and trembles until then.
  function pop(run){
    if(run.popped||run.popping)return;run.popping=true;run.popAsk=run.t;
    const line=run.main,source=line.tearSource(),obstacles=obstaclesExcept(run.ids),amount=line.blob.debris;
    const first=createDebris({source,value:run.spec.value,power:run.total,obstacles,amount,gold:run.total>=5,originAtTop:true});
    // Bigger merges throw a second, delayed spray of gel.
    if(run.total>=4&&!run.single)createDebris({source,value:run.spec.value,power:run.total*.8,obstacles,amount:amount*.7,skin:false,flash:false,delay:.07*BURST}).then(h=>h&&run.debris.push(h));
    first.then(h=>{if(h)run.debris.push(h);burst(run);});
  }
  function burst(run){
    if(run.popped||!runs.has(run))return;run.popped=true;
    const line=run.main;
    if(line){line.hideShadows();run.collapse=line.field.c.slice(0,line.field.n).map(c=>({sx:c.sx,sy:c.sy,sz:c.sz}));}
    run.popAt=run.t;
    run.resolvePop();
  }
  function stepCollapse(run){
    const line=run.main;if(!line||!line.group.visible)return;
    // The gel core snaps inward as the skin rips away from it.
    const k=clamp((run.t-run.popAt)/.03),shrink=1-easeOut(k);
    if(k>=1){line.group.visible=false;line.dispose();run.main=null;return;}
    line.field.c.slice(0,line.field.n).forEach((c,i)=>{const o=run.collapse[i];c.sx=o.sx*shrink;c.sy=o.sy*shrink;c.sz=o.sz*shrink;});
    line.field.tremble=0;line.remesh(0);
  }
  function stepResult(run){
    const id=run.resultId;
    if(id==null||id<0||run.lostResult){if(!run.landed){run.landed=true;run.resolveLand();}return;}
    const tile=tileOf(id);
    if(run.t-run.popAt<run.T.drop-run.T.pop){if(tile)tile.group.visible=false;return;}
    if(!tile){run.landed=true;run.resolveLand();return;}
    if(run.dropStart===undefined){run.dropStart=run.t;tile.group.visible=true;tile.group.userData.entryProgress=0;tile.amplitude=0;}
    const p=clamp((run.t-run.dropStart)/.22);
    if(p<1){tile.group.userData.entryProgress=p;return;}
    delete tile.group.userData.entryProgress;
    tile.press.compression=.2;tile.press.velocity=2.8;graphics.wobble(id,run.total>=5?.55:run.total===4?.48:.42);
    run.landed=true;run.resolveLand();
    I.onLand?.({kind:'result',tile,size:run.total,pan:Math.max(-.3,Math.min(.3,(tile.group?.position?.x||0)/10))});
  }
  function finishRun(run){
    runs.delete(run);
    for(const [id,r] of claims)if(r===run)claims.delete(id);
  }
  let driver=null;
  function drive(){
    if(driver)return;
    driver=I.job({update(time,dt){
      const t0=now();
      for(const run of [...runs]){
        run.t+=dt*run.tempo*hurry;
        if(run.stage==='absorb')stepAbsorb(run,run.t);
        else if(!run.popped){
          stepFuse(run,run.t);
          // A lost worker reply must never block the game.
          if(run.popping&&!run.popped&&run.t-run.popAsk>.5)burst(run);
        }
        else stepCollapse(run);
        if(run.popped)stepResult(run);
        if(run.popped&&run.landed&&!run.main)finishRun(run);
      }
      charge(t0);
      I.requestFrame({shadows:true});
      if(!runs.size){driver=null;hurry=1;prefill();return true;}
      return false;
    },cancel(){driver=null;api.clear();}});
  }
  function cleanupRun(run){
    run.absorb?.forEach(({line})=>line.dispose());run.absorb=null;
    run.main?.dispose();run.main=null;
    for(const c of run.spec.cells){showTile(c.id);const t=tileOf(c.id);if(t)t.group.scale.setScalar(1);}
    if(run.resultId!=null&&run.resultId>=0)showTile(run.resultId);
    run.resolvePop();run.resolveLand();finishRun(run);
  }
  const api={
    get active(){return runs.size>0;},
    // groups: [{cells:[{id,row,col,value}],target:[r,c],value,nextValue,resultId}]
    async play(groups,{tempo=1}={}){
      // A stone still dropping in from the previous pop lands before it fuses again.
      const pending=new Set();for(const g of groups)for(const c of g.cells){const r=claims.get(c.id);if(r&&!r.landed)pending.add(r.landPromise);}
      if(pending.size)await Promise.all(pending);
      if(!tablesReady)await Promise.race([tablesPromise,new Promise(r=>setTimeout(r,1500))]);
      const list=groups.map(g=>startRun(g,{tempo}));drive();
      await Promise.all(list.map(r=>r.popPromise));
    },
    hurry(){if(runs.size)hurry=3;},
    // Pop any gel body directly (menu buttons): the same tear, spray and flash.
    popBody(s,{value,power=3,amount=1}={}){
      const body=s.body,geo=body.geometry,pa=geo.attributes.position;if(!pa)return null;
      s.group.updateMatrixWorld(true);
      const extra=s.group.userData.burstScale||[1,1,1];
      const gm=new THREE.Matrix4().compose(s.group.position,s.group.quaternion,new THREE.Vector3(s.group.scale.x*extra[0],s.group.scale.y*extra[1]*(s.group.name.startsWith('HUD_')?INFL:1),s.group.scale.z*extra[2]));
      const matrix=gm.multiply(body.matrix),nm=new THREE.Matrix3().getNormalMatrix(matrix);
      if(!geo.attributes.normal)geo.computeVertexNormals();
      const flat=a=>{if(!a.isInterleavedBufferAttribute)return a.array.slice(0,a.count*3);const o=new Float32Array(a.count*3);for(let i=0;i<a.count;i++){o[i*3]=a.getX(i);o[i*3+1]=a.getY(i);o[i*3+2]=a.getZ(i);}return o;};
      const index=geo.index?geo.index.array.slice():Uint32Array.from({length:pa.count},(_,i)=>i);
      return createDebris({source:{index,triCount:index.length,position:flat(pa),normal:flat(geo.attributes.normal),matrix:matrix.elements.slice(),nmatrix:nm.elements.slice()},
        value:value??s.value,power,amount:amount*TIERS[tier].debris,obstacles:[]});
    },
    clear(){generation++;for(const run of [...runs])cleanupRun(run);for(const d of [...debrisSet])d.dispose();hurry=1;trimPool();},
    get stats(){const s=[...mainTimes].sort((a,b)=>a-b),q=x=>s.length?Math.round(s[Math.min(s.length-1,Math.floor(s.length*x))]*100)/100:0;
      return {runs:runs.size,debris:debrisSet.size,tier,worker:!inline,meshMs:Math.round(meshEma*100)/100,peakMs:Math.round(meshPeak*100)/100,tablesReady,
        main:{frames:s.length,p50:q(.5),p95:q(.95),max:Math.round(mainPeak*100)/100}};},
    get debug(){return [...runs].map(r=>({stage:r.stage,t:+r.t.toFixed(2),popping:r.popping,popped:r.popped,landed:r.landed,main:!!r.main,ready:r.main?.ready,shown:r.main?.shown,lost:r.lostResult,resultId:r.resultId}));},
    resetStats(){meshPeak=0;meshEma=0;mainTimes.length=0;mainPeak=0;},
    // QA: steady-state worker mesh time and main-thread cost of an n-cushion fusion.
    async bench(n=3,at=tier,frames=60){
      const keep=tier;tier=at;
      const line=createLine({axis:'row',fixed:2,cushions:Array.from({length:n},(_,i)=>({u:(i-(n>>1))*STEP,value:1})),targetIndex:n>>1,value:1});
      tier=keep;line.group.visible=false;const f=line.field;f.k=.35;f.ripple=.02;
      const work=[],main=[];
      for(let i=0;i<frames;i++){f.rippleT=i/60;f.c.slice(0,n).forEach((c,j)=>{c.x=(j-(n>>1))*STEP*(1-.3*i/frames);c.sx=c.sz=c.sy=1+.1*i/frames;});
        const before=meshEma;const got=new Promise(r=>{const orig=line.receive;line.receive=msg=>{const t0=now();orig(msg);main.push(now()-t0);work.push(msg.ms);line.receive=orig;r();};});
        const t0=now();line.remesh(1);main.push(now()-t0);await got;}
      line.dispose();
      const st=a=>{a.sort((x,y)=>x-y);return {median:+a[a.length>>1].toFixed(2),p90:+a[Math.floor(a.length*.9)].toFixed(2)};};
      return {n,tier:at,worker:st(work),main:st(main),verts:line.blob.verts};
    },
    // Warm the fused gel, skin, droplet and flash programs inside the game's own
    // entry render (behind the loading screen): first use links the program, and
    // that must not happen on the first real merge.
    warm(on){
      if(!warmHolder){
        warmHolder=new THREE.Group();warmHolder.name='Fusion_warm';warmHolder.position.set(0,-80,0);
        const blob=createBlob(1,tierFor(1));blob.s.group.visible=true;blob.geometry.setDrawRange(0,3);
        blob.s.group.scale.setScalar(1e-3);warmHolder.add(blob.s.group);
        const skin=new THREE.Mesh(dropGeometry,edgeMaterial(1)),drop=new THREE.InstancedMesh(dropGeometry,skinMaterial(1,{thick:.5,side:THREE.FrontSide}),1);
        drop.setMatrixAt(0,new THREE.Matrix4().makeScale(1e-3,1e-3,1e-3));
        const flash=new THREE.Sprite(new THREE.SpriteMaterial({map:flashTexture,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:0}));
        for(const o of [skin,drop,flash]){o.frustumCulled=false;o.scale.multiplyScalar(1e-3);warmHolder.add(o);}
        blob.s.body.frustumCulled=false;
      }
      if(on)scene.add(warmHolder);
      else{
        scene.remove(warmHolder);
        if(warmHolder){
          warmHolder.traverse(o=>{o.geometry?.dispose?.();if(o.material){const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats)m.dispose?.();}});
          warmHolder=null;
        }
        prefill();
      }
    },
    prewarm(){},
  };
  return api;
}
