// Merge lab: real squish cushions fuse into one gel body and pop like a balloon.
// Fusion is a live implicit surface (smooth union of the original cushion
// shape), meshed every frame and shaded with the game's own gel optics.
const rawRaf=window.requestAnimationFrame.bind(window);
let speed=1,virtualNow=null,lastReal=null;
// Slow motion slows every spring in the scene, not just the merge.
window.requestAnimationFrame=cb=>rawRaf(now=>{
  if(lastReal===null){lastReal=now;virtualNow=now;}else{virtualNow+=(now-lastReal)*speed;lastReal=now;}
  cb(virtualNow);
});
const {createGameGraphics}=await import('../game/graphics-adapter.mjs?v=menu-1');
const {pillowTopHeight}=await import('../game/original-gel-models.js?v=menu-1');

const host=document.getElementById('graphics');
const visual=createGameGraphics(host);window.__labVisual=visual;
const I=visual.internals,{THREE}=I,P=I.PARAMETERS,G=I.HUD_PARAMETERS.gel;
const pitch=P.board.pitch,floor=P.board.floor;
const BOARD=new THREE.Vector3(1.02,1.02/.92,1.02),INFL=1.12;
const ROWZ=0,STEP=pitch/1.02;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const ease=t=>t*t*(3-2*t),easeOut=t=>1-(1-t)**3,easeIn=t=>t*t*t;
const rand=(()=>{let s=7;return ()=>{s=(s*16807)%2147483647;return (s-1)/2147483646;};})();

// ---------- the original cushion, as a radial distance table ----------
const half=G.width/2,J=G.height+G.dome+G.footClip,clip=G.footClip,HD=G.height+G.dome,Y0=J/2-clip;
const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
function boundary(x,y,z){
  if(y<0)return 1-y*8;
  let qx=x,qy=y,qz=z;
  for(let k=0;k<4;k++){
    const ax=qx/half,az=qz/half,r=Math.sqrt(Math.sqrt(ax**4+az**4)),u=qy/HD;
    const s=1+G.rimExpansion*sstep(.2,.68,u)*sstep(.42,.82,r);
    const vx=(ax-G.dimpleOffset[0])/G.dimpleAspect[0],vz=(az-G.dimpleOffset[1])/G.dimpleAspect[1];
    const r2=vx*vx+vz*vz+G.dimpleSkew*vx*vz,t=clamp((u-.62)/.33),cap=t*t*t*(t*(t*6-15)+10);
    const d=G.topIndent*cap*Math.exp(-G.dimpleFalloff*r2);
    qx=x/s;qy=y+d;qz=z/s;
  }
  const X=Math.abs(qx)/half,Y=Math.abs((qy+clip-J/2)/(J/2)),Z=Math.abs(qz)/half;
  return Math.pow(Math.pow(X,2/G.crossExponent)+Math.pow(Z,2/G.crossExponent),G.crossExponent/G.ringExponent)+Math.pow(Y,2/G.verticalExponent);
}
const TH=96,PH=192,R0=new Float32Array(TH*PH);
for(let i=0;i<TH;i++){const th=i/(TH-1)*Math.PI,st=Math.sin(th),ct=Math.cos(th);
  for(let j=0;j<PH;j++){const ph=j/PH*Math.PI*2,dx=st*Math.cos(ph),dz=st*Math.sin(ph);
    let lo=0,hi=2.2;for(let k=0;k<22;k++){const m=(lo+hi)/2;if(boundary(dx*m,Y0+ct*m,dz*m)<1)lo=m;else hi=m;}
    R0[i*PH+j]=(lo+hi)/2;}}
// CPU lookup: octahedral map (no trig per sample).
const OS=160,OCT=new Float32Array(OS*OS);
for(let a=0;a<OS;a++)for(let b=0;b<OS;b++){
  const ox=b/(OS-1)*2-1,oz=a/(OS-1)*2-1;let nx=ox,nz=oz,ny=1-Math.abs(ox)-Math.abs(oz);
  if(ny<0){nx=(1-Math.abs(oz))*Math.sign(ox||1);nz=(1-Math.abs(ox))*Math.sign(oz||1);}
  const l=Math.hypot(nx,ny,nz);nx/=l;ny/=l;nz/=l;
  let lo=0,hi=2.2;for(let k=0;k<22;k++){const m=(lo+hi)/2;if(boundary(nx*m,Y0+ny*m,nz*m)<1)lo=m;else hi=m;}
  OCT[a*OS+b]=(lo+hi)/2;
}
function r0(vx,vy,vz){
  const l1=Math.abs(vx)+Math.abs(vy)+Math.abs(vz)||1e-9;let ox=vx/l1,oz=vz/l1;
  if(vy<0){const tx=(1-Math.abs(oz))*(ox<0?-1:1),tz=(1-Math.abs(ox))*(oz<0?-1:1);ox=tx;oz=tz;}
  const fb=(ox*.5+.5)*(OS-1),fa=(oz*.5+.5)*(OS-1),b0=Math.min(OS-2,fb|0),a0=Math.min(OS-2,fa|0),tb=fb-b0,ta=fa-a0,i=a0*OS+b0;
  return (OCT[i]*(1-tb)+OCT[i+1]*tb)*(1-ta)+(OCT[i+OS]*(1-tb)+OCT[i+OS+1]*tb)*ta;
}
function r0Spherical(vx,vy,vz,len){
  const th=Math.acos(clamp(vy/len,-1,1))/Math.PI*(TH-1);let ph=Math.atan2(vz,vx)/(Math.PI*2);if(ph<0)ph+=1;ph*=PH;
  const i0=Math.min(TH-2,th|0),ti=th-i0,j0=ph|0,tj=ph-j0,j1=(j0+1)%PH,a=j0%PH;
  return (R0[i0*PH+a]*(1-tj)+R0[i0*PH+j1]*tj)*(1-ti)+(R0[(i0+1)*PH+a]*(1-tj)+R0[(i0+1)*PH+j1]*tj)*ti;
}
const r0Texture=(()=>{const data=new Uint16Array(TH*PH);for(let i=0;i<TH*PH;i++)data[i]=THREE.DataUtils.toHalfFloat(R0[i]);
  const t=new THREE.DataTexture(data,PH,TH,THREE.RedFormat,THREE.HalfFloatType);
  t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.ClampToEdgeWrapping;t.magFilter=t.minFilter=THREE.LinearFilter;t.needsUpdate=true;return t;})();

// ---------- the live field: smooth union of N cushions ----------
const MAXN=5;
const field={n:2,k:0,ripple:0,rippleT:0,tremble:0,round:0,c:Array.from({length:MAXN},()=>({x:0,z:0,sx:1,sy:1,sz:1,bl:0,br:0}))};
function cushionDistance(c,px,py,pz){
  let qx=px-c.x;qx/=1+(qx>0?c.br:c.bl);
  const vx=qx/c.sx,vy=py/c.sy-Y0,vz=(pz-c.z)/c.sz,len=Math.hypot(vx,vy,vz)||1e-6;
  // Toward the balloon the cushion rounds out into an even radius.
  const base=r0(vx,vy,vz),target=Math.min(base,.98+.12*vy/len);
  const radius=base+(target-base)*field.round;
  return (len-radius)*Math.min(c.sx,c.sy,c.sz);
}
function smin(a,b,k){if(k<=1e-5)return Math.min(a,b);const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25;}
function ripple(px,py,pz){
  if(!field.ripple&&!field.tremble)return 0;
  const t=field.rippleT;
  return field.ripple*Math.sin(px*5.3-t*21)*Math.cos(pz*4.1+t*13)*clamp(py/.9)
    +field.tremble*Math.sin(px*17+t*93)*Math.sin(py*15-t*71)*Math.cos(pz*13+t*57);
}
function F(px,py,pz){
  if(py<0)return -py+.001;
  let d=1e9;for(let i=0;i<field.n;i++){const c=field.c[i];
    const ex=Math.abs(px-c.x)-(1.5+Math.max(c.bl,c.br))*c.sx;if(ex>field.k)continue;d=smin(d,cushionDistance(c,px,py,pz),field.k);}
  return d+ripple(px,py,pz);
}

// ---------- the gel material with the fused boundary ----------
function fusedMaterial(value){
  const material=I.createHudMaterial(value);
  const u={uFuseA:{value:Array.from({length:MAXN},()=>new THREE.Vector4())},uFuseB:{value:Array.from({length:MAXN},()=>new THREE.Vector4())},
    uFuseN:{value:2},uFuseK:{value:0},uFuseW:{value:new THREE.Vector4()},uFuseR0:{value:r0Texture}};
  const base=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
  material.onBeforeCompile=function(shader,renderer){
    base.call(this,shader,renderer);Object.assign(shader.uniforms,u);
    const glsl=`
      uniform vec4 uFuseA[${MAXN}];uniform vec4 uFuseB[${MAXN}];uniform int uFuseN;uniform float uFuseK;uniform vec4 uFuseW;uniform sampler2D uFuseR0;
      float fuseCushion(vec4 a,vec4 b,vec3 p){
        float qx=p.x-a.x;qx/=1.0+(qx>0.0?b.z:b.y);
        vec3 v=vec3(qx/a.z,p.y/a.w-${Y0.toFixed(5)},(p.z-a.y)/b.x);float len=max(length(v),1e-5);
        float th=acos(clamp(v.y/len,-1.0,1.0))/3.14159265;float ph=atan(v.z,v.x)/6.2831853;
        float r=texture2D(uFuseR0,vec2(ph+.5/${PH}.0,th*${(TH-1)/TH}+.5/${TH}.0)).r;
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
      float gelBoundaryOriginal(vec3 p){`;
    shader.fragmentShader=shader.fragmentShader.replace('float gelBoundary(vec3 p){',glsl);
  };
  material.customProgramCacheKey=()=>key()+'|fused-lab-1';
  material.userData.fuse=u;
  return material;
}
function syncUniforms(material){
  const u=material.userData.fuse;u.uFuseN.value=field.n;u.uFuseK.value=field.k;
  u.uFuseW.value.set(field.ripple,field.rippleT,field.tremble,field.round);
  field.c.forEach((c,i)=>{u.uFuseA.value[i].set(c.x,c.z,c.sx,c.sy);u.uFuseB.value[i].set(c.sz,c.bl,c.br,0);});
}

// ---------- the fused mesh ----------
const PHI=64,CAP=14;
function createBlob(value){
  const s=I.buildSquishy(value,fusedMaterial(value));
  s.group.name='HUD_lab_blob';s.group.visible=false;s.deformation={sway:0,swayZ:0,squash:0};
  s.group.remove(s.label);s.label.geometry.dispose();s.label.material.dispose();s.label=null;
  const geometry=new THREE.BufferGeometry();s.body.geometry.dispose();s.body.geometry=geometry;s.body.frustumCulled=false;
  I.bindGelOptics(s);s.bubbles.visible=false;
  return {s,geometry,rings:0,radii:null,mid:0};
}
function layoutBlob(blob,mid){
  const rings=CAP*2+mid+1,count=rings*PHI;
  blob.mid=mid;blob.rings=rings;blob.radii=new Float32Array(count);
  blob.position=new Float32Array(count*3);blob.uv=new Float32Array(count*2);
  const index=[];
  for(let r=0;r<rings-1;r++)for(let m=0;m<PHI;m++){const a=r*PHI+m,b=r*PHI+(m+1)%PHI,c=a+PHI,d=b+PHI;index.push(a,b,c,b,d,c);}
  const g=blob.geometry;g.setIndex(index);
  g.setAttribute('position',new THREE.BufferAttribute(blob.position,3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv',new THREE.BufferAttribute(blob.uv,2).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(count*3),3).setUsage(THREE.DynamicDrawUsage));
  g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),12);
}
const cosP=Float32Array.from({length:PHI},(_,m)=>Math.cos(m/PHI*Math.PI*2)),sinP=Float32Array.from({length:PHI},(_,m)=>Math.sin(m/PHI*Math.PI*2));
function solve(ox,oy,oz,dx,dy,dz,prev){
  let lo=0,hi=3.4;
  if(prev>0){const a=Math.max(0,prev-.07),b=prev+.07;
    if(F(ox+dx*a,oy+dy*a,oz+dz*a)<0&&F(ox+dx*b,oy+dy*b,oz+dz*b)>=0){lo=a;hi=b;for(let k=0;k<6;k++){const m=(lo+hi)/2;if(F(ox+dx*m,oy+dy*m,oz+dz*m)<0)lo=m;else hi=m;}return (lo+hi)/2;}}
  for(let k=0;k<14;k++){const m=(lo+hi)/2;if(F(ox+dx*m,oy+dy*m,oz+dz*m)<0)lo=m;else hi=m;}
  return (lo+hi)/2;
}
function meshBlob(blob){
  const n=field.n,cs=field.c.slice(0,n);
  let xl=Infinity,xr=-Infinity,sy=0;for(const c of cs){xl=Math.min(xl,c.x);xr=Math.max(xr,c.x);sy+=c.sy;}
  const want=Math.max(4,Math.ceil((xr-xl)/.05/4)*4);if(want!==blob.mid)layoutBlob(blob,want);
  const oy=Y0*sy/n,pos=blob.position,uv=blob.uv,radii=blob.radii;let v=0;
  for(let r=0;r<blob.rings;r++){
    let ox,ax,rad;
    if(r<CAP){const b=r/CAP*Math.PI/2;ox=xl;ax=-Math.cos(b);rad=Math.sin(b);}
    else if(r<=CAP+blob.mid){const t=(r-CAP)/blob.mid;ox=xl+(xr-xl)*t;ax=0;rad=1;}
    else{const b=(blob.rings-1-r)/CAP*Math.PI/2;ox=xr;ax=Math.cos(b);rad=Math.sin(b);}
    let near=cs[0];for(const c of cs)if(Math.abs(c.x-ox)<Math.abs(near.x-ox))near=c;
    const inside=F(ox,oy,0)<0;
    for(let m=0;m<PHI;m++,v++){
      const dx=ax,dy=rad*cosP[m],dz=rad*sinP[m];
      const len=inside?solve(ox,oy,0,dx,dy,dz,radii[v]):0;radii[v]=len;
      const x=ox+dx*len,y=Math.max(0,oy+dy*len),z=dz*len;
      pos[v*3]=x;pos[v*3+1]=y;pos[v*3+2]=z;
      uv[v*2]=(x-near.x)/G.width+.5;uv[v*2+1]=z/G.width+.5;
    }
  }
  const g=blob.geometry;g.attributes.position.needsUpdate=true;g.attributes.uv.needsUpdate=true;
  g.computeVertexNormals();
}
function topAt(x,z,y0,prev){
  let lo=y0,hi=y0+2.4,steps=12;
  if(prev>y0&&F(x,prev-.06,z)<0&&F(x,prev+.06,z)>=0){lo=prev-.06;hi=prev+.06;steps=5;}
  else if(F(x,y0,z)>=0)return null;
  for(let k=0;k<steps;k++){const m=(lo+hi)/2;if(F(x,m,z)<0)lo=m;else hi=m;}return (lo+hi)/2;
}

// ---------- scene objects ----------
const W=G.width;
function cushionBody(value,col,row){
  I.ensureColor(value);
  const s=I.buildSquishy(value,I.createHudMaterial(value));
  s.group.name=`HUD_lab_${col}_${row}`;s.group.position.set((col-2)*pitch,floor,(row-2)*pitch);s.group.scale.copy(BOARD);
  I.initializeMotion(s);I.bindGelOptics(s);I.addBody(s);I.setting.addHudShadow(s);return s;
}
function removeBody(s){I.setting.removeHudShadow(s);I.removeBody(s);}
function proxyFor(blob,i){
  const c=()=>field.c[i],m=new THREE.Matrix4(),q=new THREE.Quaternion(),pos=new THREE.Vector3(),scale=new THREE.Vector3();
  return {get value(){return blob.value;},deformation:{sway:0,swayZ:0,squash:0},group:{
    get visible(){return blob.s.group.visible&&i<field.n;},userData:{},
    get position(){return pos.set(c().x*BOARD.x,floor,ROWZ+c().z*BOARD.z);},
    get scale(){return scale.set(BOARD.x*c().sx,BOARD.y*INFL*c().sy,BOARD.z*c().sz);},
    get matrixWorld(){return m.compose(this.position,q,this.scale);},
  }};
}

// ---------- debris ----------
const flashTexture=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');
  const g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.18,'rgba(255,250,240,.85)');g.addColorStop(.5,'rgba(255,240,230,.22)');g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=g;x.fillRect(0,0,128,128);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
function skinMaterial(value,{thick=.12,side=THREE.DoubleSide}={}){
  const tint=new THREE.Color(P.colors[value]||P.colors[1]);
  const dye=tint.clone();const mx=Math.max(dye.r,dye.g,dye.b)||1;dye.multiplyScalar(1/mx);
  return new THREE.MeshPhysicalMaterial({color:tint.clone().multiplyScalar(.82),metalness:0,roughness:.1,transmission:.32,thickness:thick,ior:1.42,
    attenuationColor:new THREE.Color(Math.max(.02,dye.r**1.3),Math.max(.02,dye.g**1.3),Math.max(.02,dye.b**1.3)),attenuationDistance:.16,
    clearcoat:1,clearcoatRoughness:.03,side,envMap:visual.graphics.scene.environment,envMapIntensity:1.7,specularIntensity:1});
}
function createDebris(blob,value,matrix,origin){
  const group=new THREE.Group();group.name='Lab_debris';visual.graphics.scene.add(group);
  const pos=blob.position,count=blob.rings*PHI,center=new THREE.Vector3();
  const world=new Float32Array(count*3),v=new THREE.Vector3();
  for(let i=0;i<count;i++){v.set(pos[i*3],pos[i*3+1],pos[i*3+2]).applyMatrix4(matrix);world[i*3]=v.x;world[i*3+1]=v.y;world[i*3+2]=v.z;}
  const index=blob.geometry.index.array,normal=blob.geometry.attributes.normal.array,nm=new THREE.Matrix3().getNormalMatrix(matrix);
  // Area-weighted sampling: the collapsed middle rings must not bias anything.
  const live=[],cum=[];let areaSum=0;
  const P3=i=>world.subarray(i*3,i*3+3);
  for(let t=0;t<index.length;t+=3){const A=P3(index[t]),B=P3(index[t+1]),C=P3(index[t+2]);
    const ux=B[0]-A[0],uy=B[1]-A[1],uz=B[2]-A[2],wx=C[0]-A[0],wy=C[1]-A[1],wz=C[2]-A[2];
    const area=.5*Math.hypot(uy*wz-uz*wy,uz*wx-ux*wz,ux*wy-uy*wx);if(area<1e-6)continue;
    live.push(t);areaSum+=area;cum.push(areaSum);center.x+=(A[0]+B[0]+C[0])/3*area;center.y+=(A[1]+B[1]+C[1])/3*area;center.z+=(A[2]+B[2]+C[2])/3*area;}
  center.multiplyScalar(1/areaSum);
  function sample(){
    const x=rand()*areaSum;let lo=0,hi=cum.length-1;while(lo<hi){const m=(lo+hi)>>1;if(cum[m]<x)lo=m+1;else hi=m;}
    const t=live[lo];let a=rand(),b=rand();if(a+b>1){a=1-a;b=1-b;}
    const A=P3(index[t]),B=P3(index[t+1]),C=P3(index[t+2]);
    return new THREE.Vector3(A[0]+(B[0]-A[0])*a+(C[0]-A[0])*b,A[1]+(B[1]-A[1])*a+(C[1]-A[1])*b,A[2]+(B[2]-A[2])*a+(C[2]-A[2])*b);
  }
  const K=20+field.n*6,seeds=Array.from({length:K},sample);
  // Domain-warped Voronoi distance gives curved, ragged tear lines.
  const warp=new Float32Array(count*3);
  for(let i=0;i<count;i++){const x=world[i*3],y=world[i*3+1],z=world[i*3+2];
    warp[i*3]=x+.16*Math.sin(y*3.1+z*2.3)+.05*Math.sin(z*11.3+y*7.1);warp[i*3+1]=y+.16*Math.sin(z*2.7+x*3.3)+.05*Math.sin(x*12.1);warp[i*3+2]=z+.16*Math.sin(x*2.9+y*2.1)+.05*Math.sin(y*10.7+x*9.3);}
  const sw=seeds.map(s=>[s.x+.16*Math.sin(s.y*3.1+s.z*2.3)+.05*Math.sin(s.z*11.3+s.y*7.1),s.y+.16*Math.sin(s.z*2.7+s.x*3.3)+.05*Math.sin(s.x*12.1),s.z+.16*Math.sin(s.x*2.9+s.y*2.1)+.05*Math.sin(s.y*10.7+s.x*9.3)]);
  const dist=new Float32Array(count*K),nearest=new Int16Array(count),fray=new Float32Array(count);
  for(let i=0;i<count;i++){let best=0,bd=Infinity;
    for(let k=0;k<K;k++){const d=Math.hypot(warp[i*3]-sw[k][0],warp[i*3+1]-sw[k][1],warp[i*3+2]-sw[k][2]);dist[i*K+k]=d;if(d<bd){bd=d;best=k;}}
    nearest[i]=best;const x=world[i*3],y=world[i*3+1],z=world[i*3+2];fray[i]=.012*Math.sin(x*53+z*47)*Math.sin(y*61+x*13);}
  const edge=(i,k)=>{let o=Infinity;for(let j=0;j<K;j++)if(j!==k)o=Math.min(o,dist[i*K+j]);return o-dist[i*K+k]+fray[i]-.006;};
  const lists=Array.from({length:K},()=>[]);
  for(const t of live){const ks=new Set([nearest[index[t]],nearest[index[t+1]],nearest[index[t+2]]]);for(const k of ks)lists[k].push(t);}
  let total=0;for(const l of lists)total+=l.length*3;
  const sPos=new Float32Array(total*3),sNor=new Float32Array(total*3),rest=new Float32Array(total*3),restN=new Float32Array(total*3),aEdge=new Float32Array(total),shardOf=new Uint16Array(total);
  const shards=[];let w=0;const n3=new THREE.Vector3();
  lists.forEach((list,k)=>{
    if(!list.length)return;const c=seeds[k].clone(),avgN=new THREE.Vector3();
    for(const t of list)for(let q=0;q<3;q++){const i=index[t+q];n3.fromArray(normal,i*3).applyMatrix3(nm).normalize();avgN.add(n3);
      rest[w*3]=world[i*3]-c.x;rest[w*3+1]=world[i*3+1]-c.y;rest[w*3+2]=world[i*3+2]-c.z;restN[w*3]=n3.x;restN[w*3+1]=n3.y;restN[w*3+2]=n3.z;
      aEdge[w]=edge(i,k);shardOf[w]=shards.length;w++;}
    avgN.normalize();
    const shard={c0:c.clone(),p:c.clone(),v:new THREE.Vector3(),axis:new THREE.Vector3(rand()-.5,rand()-.5,rand()-.5).normalize(),spin:(rand()*2-1)*13,
      q:new THREE.Quaternion(),start:0,life:.38+rand()*.32,landed:false,n:avgN,curl:(.7+rand()*1.1)};
    const away=c.clone().sub(origin),d=away.length();away.normalize();shard.start=d/42;
    const out=c.clone().sub(center).normalize();
    shard.v.copy(out).multiplyScalar(2.9+rand()*1.9).addScaledVector(away,1.4+rand()).add(new THREE.Vector3(0,1.1+rand()*1.2,0));
    shards.push(shard);
  });
  const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(sPos,3).setUsage(THREE.DynamicDrawUsage));
  sg.setAttribute('normal',new THREE.BufferAttribute(sNor,3).setUsage(THREE.DynamicDrawUsage));sg.setAttribute('aEdge',new THREE.BufferAttribute(aEdge,1));
  sg.boundingSphere=new THREE.Sphere(new THREE.Vector3(),40);
  const skinMat=skinMaterial(value,{thick:.22});
  skinMat.onBeforeCompile=sh=>{
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute float aEdge;varying float vEdge;').replace('#include <begin_vertex>','#include <begin_vertex>\nvEdge=aEdge;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying float vEdge;').replace('void main() {','void main() {\nif(vEdge<0.0)discard;');
  };
  skinMat.customProgramCacheKey=()=>'lab-skin-edge-1';
  const skin=new THREE.Mesh(sg,skinMat);skin.frustumCulled=false;skin.castShadow=true;group.add(skin);
  // Gel droplets: the inside of the balloon sprays out.
  const D=40+field.n*10,drops=[];
  const dg=new THREE.SphereGeometry(1,18,12),dm=skinMaterial(value,{thick:.5,side:THREE.FrontSide});dm.attenuationDistance=.35;
  const im=new THREE.InstancedMesh(dg,dm,D);im.frustumCulled=false;im.castShadow=true;group.add(im);
  for(let d=0;d<D;d++){
    const p=sample().lerp(center,.1+rand()*.75);
    const dir=p.clone().sub(center).normalize(),r=(.028+rand()**2*.09)*(1+field.n*.06);
    drops.push({p,v:dir.multiplyScalar(2+rand()*3.6).add(new THREE.Vector3((rand()-.5)*1,1.4+rand()*2.3,(rand()-.5)*1)),r,landed:0,life:.42+rand()*.4,delay:rand()*.04});
  }
  const flash=new THREE.Sprite(new THREE.SpriteMaterial({map:flashTexture,color:new THREE.Color(P.colors[value]).lerp(new THREE.Color(1,1,1),.3),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));
  flash.position.copy(center);flash.renderOrder=5;group.add(flash);
  const core=new THREE.Sprite(new THREE.SpriteMaterial({map:flashTexture,color:0xffffff,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));
  core.position.copy(center);core.renderOrder=6;group.add(core);
  const g=-17,ground=floor+.012,m4=new THREE.Matrix4(),q=new THREE.Quaternion(),qs=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),sc=new THREE.Vector3(),tmp=new THREE.Vector3();
  let age=0;
  function update(dt){
    age+=dt;
    // Flash: a white core snap and a tinted bloom, both gone in ~0.2 s.
    const fa=age/.2;flash.visible=fa<1;core.visible=age<.09;
    if(flash.visible){const s=(1.4+4.2*easeOut(fa))*(1+field.n*.12);flash.scale.set(s,s,1);flash.material.opacity=(1-fa)**2*.8;}
    if(core.visible){const s=(.9+2.2*easeOut(age/.09));core.scale.set(s,s,1);core.material.opacity=1-age/.09;}
    for(const s of shards){
      const t=age-s.start;
      if(t<=0){s.scale=.985;continue;}
      if(!s.landed){s.v.y+=g*.55*dt;s.v.multiplyScalar(Math.exp(-dt*2.6));s.p.addScaledVector(s.v,dt);
        s.q.premultiply(qs.setFromAxisAngle(s.axis,s.spin*dt));
        if(s.p.y<ground+.03&&s.v.y<0){s.p.y=ground+.03;s.v.y*=-.22;s.v.x*=.45;s.v.z*=.45;s.spin*=.3;if(Math.abs(s.v.y)<.4)s.landed=true;}}
      // Torn rubber snaps back toward each piece's centre, then fades away.
      const snap=1-.58*easeOut(clamp(t/.16)),fade=1-ease(clamp((t-s.life)/.28));s.scale=snap*fade;s.bend=s.curl*easeOut(clamp(t/.2));
    }
    for(let i=0;i<shardOf.length;i++){
      const s=shards[shardOf[i]],k=i*3;
      tmp.set(rest[k],rest[k+1],rest[k+2]);const r2=tmp.lengthSq();
      const sc0=s.scale??1;tmp.multiplyScalar(sc0);tmp.addScaledVector(s.n,-(s.bend||0)*Math.min(r2,.35)*.8*sc0);
      tmp.applyQuaternion(s.q).add(s.start<age?s.p:s.c0);
      if(s.start>=age)tmp.addScaledVector(s.n,.004);
      sPos[k]=tmp.x;sPos[k+1]=Math.max(ground,tmp.y);sPos[k+2]=tmp.z;
      tmp.set(restN[k],restN[k+1],restN[k+2]).applyQuaternion(s.q);sNor[k]=tmp.x;sNor[k+1]=tmp.y;sNor[k+2]=tmp.z;
    }
    sg.attributes.position.needsUpdate=true;sg.attributes.normal.needsUpdate=true;
    drops.forEach((d,i)=>{
      const t=age-d.delay;let shown=t>0?1:0;
      if(t>0&&!d.landed){d.v.y+=g*dt;d.v.multiplyScalar(Math.exp(-dt*.9));d.p.addScaledVector(d.v,dt);
        if(d.p.y<ground+d.r*.35){d.p.y=ground+d.r*.35;d.landed=t;d.v.set(d.v.x*.12,0,d.v.z*.12);}}
      else if(d.landed)d.p.addScaledVector(d.v,dt);
      if(t>0){
        if(d.landed){const lt=t-d.landed;const spread=1+.9*easeOut(clamp(lt/.08));const fade=1-ease(clamp((t-d.life)/.25));
          sc.set(d.r*spread*fade,d.r*.38*fade,d.r*spread*fade);q.identity();}
        else{const sp=d.v.length(),st=1+Math.min(1.6,sp*.07);sc.set(d.r/Math.sqrt(st),d.r*st,d.r/Math.sqrt(st));q.setFromUnitVectors(up,tmp.copy(d.v).normalize());}
        if(sc.x<1e-4)shown=0;
      }
      if(!shown)sc.set(0,0,0);
      m4.compose(d.p,q,sc);im.setMatrixAt(i,m4);
    });
    im.instanceMatrix.needsUpdate=true;
    return age<2.2;
  }
  function dispose(){visual.graphics.scene.remove(group);sg.dispose();skinMat.dispose();dg.dispose();dm.dispose();im.dispose();flash.material.dispose();core.material.dispose();}
  return {update,dispose,center};
}

// ---------- the merge timeline ----------
const VALUE=2,CONTEXT=[[0,0,5],[0,3,1],[4,1,4],[4,4,6],[0,4,7]];
let n=2,cushions=[],blob=null,labels=[],result=null,debris=null,proxies=[],job=null,state='idle',stats={meshMs:0,frames:0,peakMs:0};
const context=[];
const cols=()=>Array.from({length:n},(_,i)=>i+(n===2?1:n===3?1:0));
const targetIndex=()=>n===2?1:Math.floor(n/2);
const resultValue=()=>VALUE+(n>=5?2:1);
function clearRun(){
  job?.cancel();job=null;debris?.dispose();debris=null;
  for(const s of cushions)removeBody(s);cushions=[];
  if(result){removeBody(result);result=null;}
  for(const p of proxies)I.setting.removeHudShadow(p);proxies=[];
  if(blob){visual.graphics.scene.remove(blob.s.group);blob.s.body.geometry.dispose();blob.s.body.material.dispose();for(const l of labels){l.geometry.dispose();l.material.dispose();}labels=[];blob=null;}
}
function setup(count){
  clearRun();n=count;state='idle';
  for(const o of document.querySelectorAll('[data-count]'))o.setAttribute('aria-pressed',String(+o.dataset.count===n));
  cushions=cols().map(col=>cushionBody(VALUE,col,2));
  I.requestFrame({shadows:true});
}
function labelFor(value){
  const label=I.createLabel(value);label.material.transparent=true;
  const rest=label.userData.rest||label.geometry.attributes.position.array.slice(),off=new Float32Array(rest.length/3);
  for(let i=0;i<off.length;i++)off[i]=rest[i*3+1]-pillowTopHeight(rest[i*3],rest[i*3+2]);
  label.userData.rest=rest;label.userData.off=off;return label;
}
function drapeLabel(label,c,opacity,oy){
  label.material.opacity=opacity;label.visible=opacity>.01;if(!label.visible)return;
  const rest=label.userData.rest,off=label.userData.off,a=label.geometry.attributes.position.array,tops=label.userData.tops||(label.userData.tops=new Float32Array(off.length));
  for(let i=0;i<off.length;i++){
    const x=c.x+rest[i*3]*c.sx,z=c.z+rest[i*3+2]*c.sz,top=topAt(x,z,oy,tops[i]);tops[i]=top??0;
    a[i*3]=x;a[i*3+2]=z;a[i*3+1]=top===null?oy:top+off[i]*c.sy;
  }
  label.geometry.attributes.position.needsUpdate=true;label.geometry.computeBoundingSphere();
  label.material.opacity=opacity;label.visible=opacity>.01;
}
function play(){
  if(state==='running')return;
  if(state==='done'||!cushions.length)setup(n);
  state='running';stats={meshMs:0,frames:0,peakMs:0};
  const xs=cols().map(col=>(col-2)*STEP),ti=targetIndex(),tx=xs[ti];
  blob=createBlob(VALUE);blob.value=VALUE;
  layoutBlob(blob,4);
  blob.s.group.position.set(0,floor,ROWZ);blob.s.group.scale.copy(BOARD);visual.graphics.scene.add(blob.s.group);
  labels=xs.map(()=>{const l=labelFor(VALUE);blob.s.group.add(l);return l;});
  proxies=xs.map((_,i)=>proxyFor(blob,i));
  field.n=n;field.k=0;field.ripple=0;field.tremble=0;field.round=0;
  xs.forEach((x,i)=>Object.assign(field.c[i],{x,z:0,sx:1,sy:1,sz:1,bl:0,br:0}));
  const bubbles=blob.s.bubbles.children,layout=I.HUD_PARAMETERS.bubbles.layout;
  // Real bodies anticipate; the fused body takes over once a neck exists.
  for(const s of cushions){s.press.compression=.13;s.press.velocity=1.2;s.amplitude=I.softWobblePower(.3);}
  const T={swap:.08,fuse:.55,inflate:.8,pop:.8,drop:.88,end:2.4};
  const finalScale=Math.min(1.5,Math.cbrt(n)*.93),startTime=I.time;let popped=false,swapped=false,matrix=new THREE.Matrix4();
  job=I.job({update(time,dt){
    const t=time-startTime;field.rippleT=t;
    if(!swapped&&t>=T.swap){swapped=true;for(const s of cushions){s.group.visible=false;I.setting.removeHudShadow(s);}blob.s.group.visible=true;for(const p of proxies)I.setting.addHudShadow(p);}
    if(!popped){
      // Fusion: necks form between neighbours, everything flows to the target cell.
      const f=clamp((t-T.swap)/(T.fuse-T.swap)),fe=ease(f),inf=clamp((t-T.fuse)/(T.inflate-T.fuse));
      field.k=.05+.62*ease(clamp(f*1.25))+.12*inf;
      field.ripple=.028*Math.sin(Math.PI*clamp(f*1.1))+.012*inf;
      field.tremble=.016*easeIn(clamp((t-T.inflate+.14)/.14));
      field.round=ease(inf);
      const grow=1+(finalScale-1)*ease(clamp(f*1.1)),swell=1+.11*ease(inf)+.015*Math.sin(t*44)*inf;
      const settle=t>T.fuse?.08*Math.sin((t-T.fuse)*26)*Math.exp(-(t-T.fuse)*7):0;
      xs.forEach((x0,i)=>{
        const c=field.c[i],dir=Math.sign(tx-x0),lag=Math.abs(i-ti)*.06,p=ease(clamp((f-lag)/(1-lag)));
        // Overshoot a little and settle, like gel being pulled in.
        c.x=x0+(tx-x0)*(p+.06*Math.sin(Math.PI*p)*(1-p));
        if(i===ti)c.x=tx+(xs.length>1?-.05*Math.sin(Math.PI*clamp(f*1.4)):0);
        const wob=Math.sin(t*19+i*1.7)*.035*(1-inf)*Math.sin(Math.PI*f);
        const squash=t<T.swap+.12?.08*Math.sin(Math.PI*clamp((t)/(T.swap+.12))):0;
        c.sy=(grow*swell)*(1-squash-wob-settle)*(1+.08*fe*(1-inf))*(1+.03*inf);c.sx=c.sz=(grow*swell)*(1+squash*.6+wob*.5+settle*.5);
        c.bl=dir>0||i===ti&&ti>0?.0:.0;c.br=0;
        const bulge=.22*Math.sin(Math.PI*clamp(f*1.6))*(1-inf);
        if(i<ti)c.br=bulge;else if(i>ti)c.bl=bulge;else{c.bl=ti>0?bulge*.6:0;c.br=ti<xs.length-1?bulge*.6:0;}
      });
      const m=blob.s.body.material;m.attenuationDistance=G.attenuationDistance*(1+1.2*ease(inf));m.roughness=G.roughness*(1-.6*inf);m.envMapIntensity=G.envMapIntensity*(1+.5*inf);
      syncUniforms(m);
      const t0=performance.now();meshBlob(blob);
      const oy=Y0*field.c[0].sy;
      xs.forEach((_,i)=>drapeLabel(labels[i],field.c[i],1-ease(clamp((f-.18)/.42)),oy));
      const ms=performance.now()-t0;stats.meshMs=stats.meshMs*.9+ms*.1;stats.peakMs=Math.max(stats.peakMs,ms);stats.frames++;
      bubbles.forEach((b,k)=>{const c=field.c[k%n],l=layout[k];b.position.set(c.x+l[0]*c.sx,l[1]*c.sy,c.z+l[2]*c.sz);b.scale.set(c.sx,c.sy,c.sz);});
      if(t>=T.pop){
        popped=true;
        matrix.compose(blob.s.group.position,blob.s.group.quaternion,new THREE.Vector3(BOARD.x,BOARD.y*INFL,BOARD.z));
        let top=0,ti2=0;for(let i=0;i<blob.rings*PHI;i++)if(blob.position[i*3+1]>top){top=blob.position[i*3+1];ti2=i;}
        const origin=new THREE.Vector3().fromArray(blob.position,ti2*3).add(new THREE.Vector3(.25,0,.35)).applyMatrix4(matrix);
        debris=createDebris(blob,VALUE,matrix,origin);
        for(const p of proxies)I.setting.removeHudShadow(p);blob.collapse=field.c.slice(0,n).map(c=>({sx:c.sx,sy:c.sy,sz:c.sz}));
        window.dispatchEvent(new CustomEvent('lab-pop'));
      }
    }
    else if(blob.s.group.visible){
      // The gel core snaps inward as the skin rips away from it.
      const k=clamp((t-T.pop)/.05),shrink=1-easeOut(k);
      if(k>=1)blob.s.group.visible=false;
      else{field.c.slice(0,n).forEach((c,i)=>{const o=blob.collapse[i];c.sx=o.sx*shrink;c.sy=o.sy*shrink;c.sz=o.sz*shrink;});
        field.tremble=0;syncUniforms(blob.s.body.material);meshBlob(blob);}
    }
    if(debris)debris.update(dt);
    if(popped&&!result&&t>=T.drop){
      result=I.buildSquishy(resultValue(),I.createHudMaterial(resultValue()));
      result.group.name='HUD_lab_result';result.group.position.set(tx*BOARD.x,floor,ROWZ);result.group.scale.copy(BOARD);
      I.initializeMotion(result);I.bindGelOptics(result);I.addBody(result);I.setting.addHudShadow(result);
      result.group.userData.entryProgress=0;result.amplitude=0;result.dropStart=t;
    }
    if(result&&result.dropStart!==undefined){
      const p=clamp((t-result.dropStart)/.4);
      if(p<1)result.group.userData.entryProgress=p;
      else{delete result.group.userData.entryProgress;result.dropStart=undefined;result.press.compression=.2;result.press.velocity=2.8;result.amplitude=I.softWobblePower(.42);}
    }
    I.requestFrame({shadows:true});
    if(t<T.end)return false;
    debris?.dispose();debris=null;state='done';job=null;window.dispatchEvent(new CustomEvent('lab-done'));return true;
  },cancel(){}});
}

// ---------- page ----------
await visual.ready;
visual.graphics.pause(false);
for(const [row,col,value] of CONTEXT)context.push(cushionBody(value,col,row));
setup(2);
const ui={play:document.getElementById('lab-play'),slow:document.getElementById('lab-slow'),counts:[...document.querySelectorAll('[data-count]')]};
function setSlow(on){speed=on?.2:1;ui.slow.setAttribute('aria-pressed',String(on));}
ui.play.addEventListener('click',()=>{if(state==='running')return;setup(n);requestAnimationFrame(()=>play());});
ui.slow.addEventListener('click',()=>setSlow(speed===1));
for(const b of ui.counts)b.addEventListener('click',()=>{if(state!=='running')setup(+b.dataset.count);});
window.MergeLab={play,setup,setSlow,get state(){return state;},get stats(){return {...stats,n};},visual,
  set speed(v){speed=v;},get speed(){return speed;}};
document.documentElement.dataset.lab='ready';
