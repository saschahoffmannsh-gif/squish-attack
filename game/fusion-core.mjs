// Fusion geometry core: the original cushion as radial tables, the fused
// smooth-union field, the capsule-ring mesher, label draping and the tear
// prep for the pop. Pure math, no DOM / THREE: it runs in a Web Worker so the
// main thread never meshes (fallback: the same code inline).
// Triangles of a capsule with `ringCount` rings of PHI vertices; any prefix of
// rings uses a prefix of this index, so one buffer serves every neck length.
export function capsuleIndex(ringCount,PHI){
  const count=ringCount*PHI,index=new (count>65000?Uint32Array:Uint16Array)((ringCount-1)*PHI*6);let w=0;
  for(let r=0;r<ringCount-1;r++)for(let m=0;m<PHI;m++){const a=r*PHI+m,b=r*PHI+(m+1)%PHI,c=a+PHI,d=b+PHI;index[w++]=a;index[w++]=b;index[w++]=c;index[w++]=b;index[w++]=d;index[w++]=c;}
  return index;
}
export function createCore(G){
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
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
  const radius=(nx,ny,nz)=>{let lo=0,hi=2.2;for(let k=0;k<20;k++){const m=(lo+hi)/2;if(boundary(nx*m,Y0+ny*m,nz*m)<1)lo=m;else hi=m;}return (lo+hi)/2;};
  const TH=96,PH=192,R0=new Float32Array(TH*PH),OS=160,OCT=new Float32Array(OS*OS);
  function buildTables(){
    for(let a=0;a<OS;a++)for(let b=0;b<OS;b++){
      const ox=b/(OS-1)*2-1,oz=a/(OS-1)*2-1;let nx=ox,nz=oz,ny=1-Math.abs(ox)-Math.abs(oz);
      if(ny<0){nx=(1-Math.abs(oz))*Math.sign(ox||1);nz=(1-Math.abs(ox))*Math.sign(oz||1);}
      const l=Math.hypot(nx,ny,nz);OCT[a*OS+b]=radius(nx/l,ny/l,nz/l);}
    for(let i=0;i<TH;i++){const th=i/(TH-1)*Math.PI,st=Math.sin(th),ct=Math.cos(th);
      for(let j=0;j<PH;j++){const ph=j/PH*Math.PI*2;R0[i*PH+j]=radius(st*Math.cos(ph),ct,st*Math.sin(ph));}}
    return R0;
  }
  function r0(vx,vy,vz){
    const l1=Math.abs(vx)+Math.abs(vy)+Math.abs(vz)||1e-9;let ox=vx/l1,oz=vz/l1;
    if(vy<0){const tx=(1-Math.abs(oz))*(ox<0?-1:1),tz=(1-Math.abs(ox))*(oz<0?-1:1);ox=tx;oz=tz;}
    const fb=(ox*.5+.5)*(OS-1),fa=(oz*.5+.5)*(OS-1),b0=Math.min(OS-2,fb|0),a0=Math.min(OS-2,fa|0),tb=fb-b0,ta=fa-a0,i=a0*OS+b0;
    return (OCT[i]*(1-tb)+OCT[i+1]*tb)*(1-ta)+(OCT[i+OS]*(1-tb)+OCT[i+OS+1]*tb)*ta;
  }
  // field: {n,k,ripple,rippleT,tremble,round,c:Float64Array(n*7)} as x,z,sx,sy,sz,bl,br
  function cushionDistance(round,c,o,px,py,pz){
    let qx=px-c[o];qx/=1+(qx>0?c[o+6]:c[o+5]);
    const sx=c[o+2],sy=c[o+3],sz=c[o+4];
    const vx=qx/sx,vy=py/sy-Y0,vz=(pz-c[o+1])/sz,len=Math.sqrt(vx*vx+vy*vy+vz*vz)||1e-6;
    const base=r0(vx,vy,vz),target=Math.min(base,.98+.12*vy/len);
    return (len-(base+(target-base)*round))*Math.min(sx,sy,sz);
  }
  function F(f,px,py,pz){
    if(py<0)return -py+.001;
    const c=f.c,k=f.k;let d=1e9;
    for(let i=0;i<f.n;i++){const o=i*7;
      const ex=Math.abs(px-c[o])-(1.5+Math.max(c[o+5],c[o+6]))*c[o+2];if(ex>k)continue;
      const e=cushionDistance(f.round,c,o,px,py,pz);
      if(k<=1e-5)d=Math.min(d,e);else{const h=Math.max(k-Math.abs(d-e),0)/k;d=Math.min(d,e)-h*h*k*.25;}}
    if(f.ripple||f.tremble){const t=f.rippleT;
      d+=f.ripple*Math.sin(px*5.3-t*21)*Math.cos(pz*4.1+t*13)*clamp(py/.9)
        +f.tremble*Math.sin(px*17+t*93)*Math.sin(py*15-t*71)*Math.cos(pz*13+t*57);}
    return d;
  }
  function solve(f,ox,oy,oz,dx,dy,dz,prev){
    let lo=0,hi=3.4;
    if(prev>0){const a=Math.max(0,prev-.07),b=prev+.07;
      if(F(f,ox+dx*a,oy+dy*a,oz+dz*a)<0&&F(f,ox+dx*b,oy+dy*b,oz+dz*b)>=0){lo=a;hi=b;for(let k=0;k<6;k++){const m=(lo+hi)/2;if(F(f,ox+dx*m,oy+dy*m,oz+dz*m)<0)lo=m;else hi=m;}return (lo+hi)/2;}}
    for(let k=0;k<14;k++){const m=(lo+hi)/2;if(F(f,ox+dx*m,oy+dy*m,oz+dz*m)<0)lo=m;else hi=m;}
    return (lo+hi)/2;
  }
  const trig=new Map();
  function rings(PHI){let t=trig.get(PHI);if(!t){t={cos:Float32Array.from({length:PHI},(_,m)=>Math.cos(m/PHI*Math.PI*2)),sin:Float32Array.from({length:PHI},(_,m)=>Math.sin(m/PHI*Math.PI*2))};trig.set(PHI,t);}return t;}
  const midFor=(f,midStep)=>{let xl=Infinity,xr=-Infinity;for(let i=0;i<f.n;i++){xl=Math.min(xl,f.c[i*7]);xr=Math.max(xr,f.c[i*7]);}return Math.max(4,Math.ceil((xr-xl)/midStep/4)*4);};
  // line: {PHI,CAP,midStep,capMid,radii,index}; out arrays sized for capMid.
  function mesh(line,f,pos,nor,uv){
    const {PHI,CAP}=line,{cos,sin}=rings(PHI),n=f.n,c=f.c;
    let xl=Infinity,xr=-Infinity,sy=0;for(let i=0;i<n;i++){xl=Math.min(xl,c[i*7]);xr=Math.max(xr,c[i*7]);sy+=c[i*7+3];}
    const mid=Math.min(line.capMid,midFor(f,line.midStep)),ringCount=CAP*2+mid+1;
    // A new neck length re-seeds the warm start.
    if(mid!==line.mid){line.mid=mid;line.radii.fill(0);}
    const oy=Y0*sy/n,radii=line.radii;let v=0;
    for(let r=0;r<ringCount;r++){
      let ox,ax,rad;
      if(r<CAP){const b=r/CAP*Math.PI/2;ox=xl;ax=-Math.cos(b);rad=Math.sin(b);}
      else if(r<=CAP+mid){const t=(r-CAP)/mid;ox=xl+(xr-xl)*t;ax=0;rad=1;}
      else{const b=(ringCount-1-r)/CAP*Math.PI/2;ox=xr;ax=Math.cos(b);rad=Math.sin(b);}
      let near=c[0];for(let i=1;i<n;i++)if(Math.abs(c[i*7]-ox)<Math.abs(near-ox))near=c[i*7];
      const inside=F(f,ox,oy,0)<0;
      for(let m=0;m<PHI;m++,v++){
        const dx=ax,dy=rad*cos[m],dz=rad*sin[m];
        const len=inside?solve(f,ox,oy,0,dx,dy,dz,radii[v]):0;radii[v]=len;
        const x=ox+dx*len,y=Math.max(0,oy+dy*len),z=dz*len;
        pos[v*3]=x;pos[v*3+1]=y;pos[v*3+2]=z;
        uv[v*2]=(x-near)/G.width+.5;uv[v*2+1]=z/G.width+.5;
      }
    }
    // Area-weighted vertex normals over the used rings.
    const index=line.index,tri=(ringCount-1)*PHI*6;nor.fill(0,0,v*3);
    for(let t=0;t<tri;t+=3){const a=index[t]*3,b=index[t+1]*3,d=index[t+2]*3;
      const ux=pos[b]-pos[a],uy=pos[b+1]-pos[a+1],uz=pos[b+2]-pos[a+2],wx=pos[d]-pos[a],wy=pos[d+1]-pos[a+1],wz=pos[d+2]-pos[a+2];
      const nx=uy*wz-uz*wy,ny=uz*wx-ux*wz,nz=ux*wy-uy*wx;
      nor[a]+=nx;nor[a+1]+=ny;nor[a+2]+=nz;nor[b]+=nx;nor[b+1]+=ny;nor[b+2]+=nz;nor[d]+=nx;nor[d+1]+=ny;nor[d+2]+=nz;}
    for(let i=0;i<v*3;i+=3){const l=Math.hypot(nor[i],nor[i+1],nor[i+2])||1;nor[i]/=l;nor[i+1]/=l;nor[i+2]/=l;}
    return {mid,rings:ringCount,verts:v,tris:tri};
  }
  function topAt(f,x,z,y0,prev){
    let lo=y0,hi=y0+2.4,steps=12;
    if(prev>y0&&F(f,x,prev-.06,z)<0&&F(f,x,prev+.06,z)>=0){lo=prev-.06;hi=prev+.06;steps=5;}
    else if(F(f,x,y0,z)>=0)return NaN;
    for(let k=0;k<steps;k++){const m=(lo+hi)/2;if(F(f,x,m,z)<0)lo=m;else hi=m;}return (lo+hi)/2;
  }
  // Label heights: rx/rz are the digit's rest coordinates (already turned).
  function drape(f,ci,rx,rz,prev,out,oy){
    const o=ci*7,cx=f.c[o],cz=f.c[o+1],sx=f.c[o+2],sz=f.c[o+4];
    for(let i=0;i<rx.length;i++){const t=topAt(f,cx+rx[i]*sx,cz+rz[i]*sz,oy,prev[i]);out[i]=t;prev[i]=t===t?t:0;}
  }
  // Tear prep: area sampling, warped Voronoi cells, per-cell triangle soup.
  function tear({world,normals,index,triCount,K,D,seed}){
    let s=seed||11;const rand=()=>{s=(s*16807)%2147483647;return (s-1)/2147483646;};
    const live=[],cum=[];let areaSum=0,cx=0,cy=0,cz=0;
    for(let t=0;t<triCount;t+=3){const a=index[t]*3,b=index[t+1]*3,c=index[t+2]*3;
      const ux=world[b]-world[a],uy=world[b+1]-world[a+1],uz=world[b+2]-world[a+2],wx=world[c]-world[a],wy=world[c+1]-world[a+1],wz=world[c+2]-world[a+2];
      const area=.5*Math.hypot(uy*wz-uz*wy,uz*wx-ux*wz,ux*wy-uy*wx);if(area<1e-6)continue;
      live.push(t);areaSum+=area;cum.push(areaSum);
      cx+=(world[a]+world[b]+world[c])/3*area;cy+=(world[a+1]+world[b+1]+world[c+1])/3*area;cz+=(world[a+2]+world[b+2]+world[c+2])/3*area;}
    if(!live.length)return null;
    const center=[cx/areaSum,cy/areaSum,cz/areaSum];
    const sample=out=>{
      const x=rand()*areaSum;let lo=0,hi=cum.length-1;while(lo<hi){const m=(lo+hi)>>1;if(cum[m]<x)lo=m+1;else hi=m;}
      const t=live[lo];let a=rand(),b=rand();if(a+b>1){a=1-a;b=1-b;}
      const A=index[t]*3,B=index[t+1]*3,C=index[t+2]*3;
      for(let q=0;q<3;q++)out[q]=world[A+q]+(world[B+q]-world[A+q])*a+(world[C+q]-world[A+q])*b;return out;
    };
    const drops=new Float32Array(D*3),tmp=[0,0,0];
    for(let d=0;d<D;d++){sample(tmp);const k=.1+rand()*.75;for(let q=0;q<3;q++)drops[d*3+q]=tmp[q]+(center[q]-tmp[q])*k;}
    if(!K)return {center,drops,K:0};
    const seeds=new Float32Array(K*3);for(let k=0;k<K;k++){sample(tmp);seeds[k*3]=tmp[0];seeds[k*3+1]=tmp[1];seeds[k*3+2]=tmp[2];}
    const wx=(x,y,z)=>x+.16*Math.sin(y*3.1+z*2.3)+.05*Math.sin(z*11.3+y*7.1),wy=(x,y,z)=>y+.16*Math.sin(z*2.7+x*3.3)+.05*Math.sin(x*12.1),wz=(x,y,z)=>z+.16*Math.sin(x*2.9+y*2.1)+.05*Math.sin(y*10.7+x*9.3);
    const sw=new Float32Array(K*3);for(let k=0;k<K;k++){const x=seeds[k*3],y=seeds[k*3+1],z=seeds[k*3+2];sw[k*3]=wx(x,y,z);sw[k*3+1]=wy(x,y,z);sw[k*3+2]=wz(x,y,z);}
    const count=world.length/3,warp=new Float32Array(count*3),nearest=new Int16Array(count),d1=new Float32Array(count),d2=new Float32Array(count);
    for(let i=0;i<count;i++){const x=world[i*3],y=world[i*3+1],z=world[i*3+2],X=wx(x,y,z),Y=wy(x,y,z),Z=wz(x,y,z);warp[i*3]=X;warp[i*3+1]=Y;warp[i*3+2]=Z;
      let b=0,a1=Infinity,a2=Infinity;
      for(let k=0;k<K;k++){const dx=X-sw[k*3],dy=Y-sw[k*3+1],dz=Z-sw[k*3+2],d=dx*dx+dy*dy+dz*dz;if(d<a1){a2=a1;a1=d;b=k;}else if(d<a2)a2=d;}
      nearest[i]=b;d1[i]=Math.sqrt(a1);d2[i]=Math.sqrt(a2);}
    const edge=(i,k)=>{
      const fray=.012*Math.sin(world[i*3]*53+world[i*3+2]*47)*Math.sin(world[i*3+1]*61+world[i*3]*13);
      if(nearest[i]===k)return d2[i]-d1[i]+fray-.006;
      const dx=warp[i*3]-sw[k*3],dy=warp[i*3+1]-sw[k*3+1],dz=warp[i*3+2]-sw[k*3+2];
      return d1[i]-Math.sqrt(dx*dx+dy*dy+dz*dz)+fray-.006;
    };
    const lists=Array.from({length:K},()=>[]);
    for(const t of live){const a=nearest[index[t]],b=nearest[index[t+1]],c=nearest[index[t+2]];lists[a].push(t);if(b!==a)lists[b].push(t);if(c!==a&&c!==b)lists[c].push(t);}
    let total=0,used=0;for(const l of lists){total+=l.length*3;if(l.length)used++;}
    const rest=new Float32Array(total*3),restN=new Float32Array(total*3),aEdge=new Float32Array(total),aShard=new Float32Array(total);
    const centers=new Float32Array(used*3),avgN=new Float32Array(used*3);let w=0,sh=0;
    for(let k=0;k<K;k++){const list=lists[k];if(!list.length)continue;
      const sx=seeds[k*3],sy=seeds[k*3+1],sz=seeds[k*3+2];let ax=0,ay=0,az=0;
      for(const t of list)for(let q=0;q<3;q++){const i=index[t+q];let nx=normals[i*3],ny=normals[i*3+1],nz=normals[i*3+2];const l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;ax+=nx;ay+=ny;az+=nz;
        rest[w*3]=world[i*3]-sx;rest[w*3+1]=world[i*3+1]-sy;rest[w*3+2]=world[i*3+2]-sz;restN[w*3]=nx;restN[w*3+1]=ny;restN[w*3+2]=nz;
        aEdge[w]=edge(i,k);aShard[w]=sh;w++;}
      const l=Math.hypot(ax,ay,az)||1;centers[sh*3]=sx;centers[sh*3+1]=sy;centers[sh*3+2]=sz;avgN[sh*3]=ax/l;avgN[sh*3+1]=ay/l;avgN[sh*3+2]=az/l;sh++;}
    return {center,drops,K:used,centers,avgN,rest,restN,aEdge,aShard};
  }
  return {buildTables,mesh,drape,tear,capsuleIndex,midFor,Y0,TH,PH};
}
// Message protocol shared by the worker and the inline fallback.
export function createHost(post){
  let core=null;const lines=new Map();
  const transform=(src,m,out,dir)=>{for(let i=0;i<out.length;i+=3){const x=src[i],y=src[i+1],z=src[i+2];
    if(dir){out[i]=m[0]*x+m[3]*y+m[6]*z;out[i+1]=m[1]*x+m[4]*y+m[7]*z;out[i+2]=m[2]*x+m[5]*y+m[8]*z;}
    else{out[i]=m[0]*x+m[4]*y+m[8]*z+m[12];out[i+1]=m[1]*x+m[5]*y+m[9]*z+m[13];out[i+2]=m[2]*x+m[6]*y+m[10]*z+m[14];}}};
  return function handle(msg){
    if(msg.type==='init'){core=createCore(msg.G);const t0=performance.now();const R0=core.buildTables().slice();
      post({type:'tables',R0,ms:performance.now()-t0},[R0.buffer]);
      // Warm the JIT so the first real merge meshes at full speed.
      const warm={PHI:48,CAP:11,midStep:.065,capMid:64,mid:0,radii:new Float32Array(150*48),index:core.capsuleIndex(150,48)};
      const pos=new Float32Array(150*48*3),nor=new Float32Array(150*48*3),uv=new Float32Array(150*48*2);
      for(let i=0;i<24;i++){const c=new Float64Array(21);for(let j=0;j<3;j++)c.set([(j-1)*(1.2-.03*i),0,1+.004*i,1,1,0,0],j*7);core.mesh(warm,{n:3,k:.3,ripple:.02,rippleT:i/60,tremble:0,round:.2,c},pos,nor,uv);}
      return;}
    if(msg.type==='open'){const {id,PHI,CAP,midStep,capMid,labels}=msg,ringCount=CAP*2+capMid+1;
      lines.set(id,{PHI,CAP,midStep,capMid,mid:0,radii:new Float32Array(ringCount*PHI),index:core.capsuleIndex(ringCount,PHI),labels:labels.map(l=>({rx:l.rx,rz:l.rz,prev:new Float32Array(l.rx.length)})),bufs:null});return;}
    if(msg.type==='close'){lines.delete(msg.id);return;}
    if(msg.type==='mesh'){
      const line=lines.get(msg.id);if(!line)return;const ringCount=line.CAP*2+line.capMid+1,nv=ringCount*line.PHI;
      let b=msg.bufs;if(!b||b.pos.length!==nv*3)b={pos:new Float32Array(nv*3),nor:new Float32Array(nv*3),uv:new Float32Array(nv*2)};
      const t0=performance.now(),info=core.mesh(line,msg.field,b.pos,b.nor,b.uv);
      const tops=[],transfer=[b.pos.buffer,b.nor.buffer,b.uv.buffer];
      for(const {i,oy} of msg.drape){const l=line.labels[i];if(!l)continue;const out=msg.topBufs?.[i]?.length===l.rx.length?msg.topBufs[i]:new Float32Array(l.rx.length);
        core.drape(msg.field,i,l.rx,l.rz,l.prev,out,oy);tops.push({i,out});transfer.push(out.buffer);}
      post({type:'mesh',id:msg.id,seq:msg.seq,info,bufs:b,tops,ms:performance.now()-t0},transfer);return;}
    if(msg.type==='tear'){
      const t0=performance.now();let index=msg.index,triCount=msg.triCount;
      if(msg.lineId!=null){const line=lines.get(msg.lineId);if(!line){post({type:'tear',rid:msg.rid,out:null});return;}index=line.index;}
      const world=new Float32Array(msg.position.length),normals=new Float32Array(msg.normal.length);
      transform(msg.position,msg.matrix,world,false);transform(msg.normal,msg.nmatrix,normals,true);
      const out=core.tear({world,normals,index,triCount,K:msg.K,D:msg.D,seed:msg.seed});
      let top=-Infinity,ti=0;for(let i=1;i<world.length;i+=3)if(world[i]>top){top=world[i];ti=i-1;}
      if(out)out.top=[world[ti],world[ti+1],world[ti+2]];
      const transfer=out?[out.drops.buffer,...(out.K?[out.centers.buffer,out.avgN.buffer,out.rest.buffer,out.restN.buffer,out.aEdge.buffer,out.aShard.buffer]:[])]:[];
      post({type:'tear',rid:msg.rid,out,ms:performance.now()-t0},transfer);}
  };
}
