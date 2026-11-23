// Same anchored constraints and pair order as the accepted SDK solver. Reuse
// contour buffers instead of allocating points/reduction arrays per slice.
export function createContactSolver(parameters) {
  const boundsCache=new WeakMap(),pairs=[];
  const makeSlice=()=>({points:new Float64Array(parameters.collisions.points*2),minX:0,maxX:0,minZ:0,maxZ:0,anchor:0});
  const pa=makeSlice(),pb=makeSlice();
  const hit={depth:0,nx:0,nz:0,anchorA:0,anchorB:0};
  const stats={steps:0,candidates:0,satTests:0,contours:0};
  function bounds(s,profile) {
    const p=s.deformation,x=s.group.position.x,z=s.group.position.z;
    let old=boundsCache.get(s);
    if(old&&old.x===x&&old.z===z&&old.sway===p.sway&&old.swayZ===p.swayZ&&old.squash===p.squash&&old.spread===parameters.motion.spreadFactor)return old;
    if(!old){old={};boundsCache.set(s,old);}
    old.x=x;old.z=z;old.sway=p.sway;old.swayZ=p.swayZ;old.squash=p.squash;old.spread=parameters.motion.spreadFactor;
    old.minX=old.minZ=Infinity;old.maxX=old.maxZ=-Infinity;
    for(const slice of profile.slices){
      const a=slice.anchor,scale=1+p.squash*a*parameters.motion.spreadFactor,e=slice.extent,px=x+p.sway*a,pz=z+p.swayZ*a;
      old.minX=Math.min(old.minX,px+e[0]*scale);old.maxX=Math.max(old.maxX,px+e[1]*scale);
      old.minZ=Math.min(old.minZ,pz+e[2]*scale);old.maxZ=Math.max(old.maxZ,pz+e[3]*scale);
    }
    return old;
  }
  function footprint(s,worldY,profile,out) {
    const pose=s.deformation,y=(worldY-s.group.position.y)/(1-pose.squash);
    if(y<=0||y>=profile.height)return false;
    const k=Math.min(profile.slices.length-2,Math.floor(y/profile.height*parameters.collisions.layers));
    const a=profile.slices[k],b=profile.slices[k+1],t=(y-a.y)/(b.y-a.y),anchor=Math.pow(y/parameters.gel.height,1.7);
    const spread=1+pose.squash*anchor*parameters.motion.spreadFactor;
    const x=s.group.position.x+pose.sway*anchor,z=s.group.position.z+pose.swayZ*anchor;
    if(out.points.length!==a.contour.length*2)out.points=new Float64Array(a.contour.length*2);
    out.anchor=anchor;out.minX=out.minZ=Infinity;out.maxX=out.maxZ=-Infinity;
    for(let i=0;i<a.contour.length;i++){
      const v=a.contour[i],w=b.contour[i],px=(v[0]+(w[0]-v[0])*t)*spread+x,pz=(v[1]+(w[1]-v[1])*t)*spread+z;
      out.points[i*2]=px;out.points[i*2+1]=pz;
      out.minX=Math.min(out.minX,px);out.maxX=Math.max(out.maxX,px);out.minZ=Math.min(out.minZ,pz);out.maxZ=Math.max(out.maxZ,pz);
    }
    stats.contours++;return true;
  }
  function separatingAxis(a,b,dx,dz) {
    let depth=Infinity,nx=0,nz=0;
    // Visit the same edges in the same order, retaining the exact minimum.
    for(let polygonIndex=0;polygonIndex<2;polygonIndex++){
      const polygon=polygonIndex?b:a;
      for(let i=0;i<polygon.length;i+=2){
        const next=(i+2)%polygon.length,ex=polygon[next]-polygon[i],ez=polygon[next+1]-polygon[i+1],length=Math.hypot(ex,ez);
        if(length<1e-7)continue;
        let x=-ez/length,z=ex/length;if(x*dx+z*dz<0){x=-x;z=-z;}
        let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;
        for(let j=0;j<a.length;j+=2){const d=a[j]*x+a[j+1]*z;amin=Math.min(amin,d);amax=Math.max(amax,d);}
        for(let j=0;j<b.length;j+=2){const d=b[j]*x+b[j+1]*z;bmin=Math.min(bmin,d);bmax=Math.max(bmax,d);}
        const overlap=Math.min(amax,bmax)-Math.max(amin,bmin);if(overlap<=0)return false;
        if(overlap<depth){depth=overlap;nx=x;nz=z;}
      }
    }
    if(!Number.isFinite(depth))return false;
    axis.depth=depth;axis.nx=nx;axis.nz=nz;return true;
  }
  const axis={depth:0,nx:0,nz:0};
  function pairContact(a,b,profile) {
    const ba=bounds(a,profile),bb=bounds(b,profile);
    if(ba.maxX<=bb.minX||bb.maxX<=ba.minX||ba.maxZ<=bb.minZ||bb.maxZ<=ba.minZ)return false;
    const dx=b.group.position.x-a.group.position.x,dz=b.group.position.z-a.group.position.z;
    const floor=Math.max(a.group.position.y,b.group.position.y),top=Math.min(a.group.position.y+profile.height*(1-a.deformation.squash),b.group.position.y+profile.height*(1-b.deformation.squash));
    let found=false;hit.depth=-Infinity;
    for(let layer=1;layer<=parameters.collisions.layers;layer++){
      const y=floor+(top-floor)*layer/(parameters.collisions.layers+1);
      if(!footprint(a,y,profile,pa)||!footprint(b,y,profile,pb))continue;
      if(pa.maxX<=pb.minX||pb.maxX<=pa.minX||pa.maxZ<=pb.minZ||pb.maxZ<=pa.minZ)continue;
      stats.satTests++;
      if(separatingAxis(pa.points,pb.points,dx,dz)&&axis.depth>hit.depth){
        found=true;hit.depth=axis.depth;hit.nx=axis.nx;hit.nz=axis.nz;hit.anchorA=pa.anchor;hit.anchorB=pb.anchor;
      }
    }
    return found;
  }
  function solve(bodies,dt,profile) {
    stats.steps++;let contacts=0,maxPenetration=0;pairs.length=0;
    for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
      const wave=bodies[i].group.userData.pressureWave?.wave;
      if(wave&&wave===bodies[j].group.userData.pressureWave?.wave)continue;
      pairs.push(bodies[i],bodies[j]);
    }
    for(let pass=0;pass<parameters.collisions.iterations;pass++){
      let corrections=0;const reverse=pass%2;
      for(let index=reverse?pairs.length-2:0;reverse?index>=0:index<pairs.length;index+=reverse?-2:2){
        const a=pairs[index],b=pairs[index+1];stats.candidates++;
        if(!pairContact(a,b,profile)||hit.depth<=parameters.collisions.tolerance+1e-7)continue;
        const wa=a.press.held?parameters.collisions.heldMobility:1,wb=b.press.held?parameters.collisions.heldMobility:1,ja=hit.anchorA,jb=hit.anchorB,den=wa*ja*ja+wb*jb*jb;
        if(den<.0005)continue;
        corrections++;
        const correction=(hit.depth-parameters.collisions.tolerance)/den,ax=-hit.nx*correction*ja*wa,az=-hit.nz*correction*ja*wa,bx=hit.nx*correction*jb*wb,bz=hit.nz*correction*jb*wb;
        a.collision.x+=ax;a.collision.z+=az;a.deformation.sway+=ax;a.deformation.swayZ+=az;a.collision.contacts++;
        b.collision.x+=bx;b.collision.z+=bz;b.deformation.sway+=bx;b.deformation.swayZ+=bz;b.collision.contacts++;
        if(pass===0){
          contacts++;maxPenetration=Math.max(maxPenetration,hit.depth);
          const av=(a.press.swipeVX+a.collision.vx)*ja,bv=(b.press.swipeVX+b.collision.vx)*jb,azv=(a.press.swipeVZ+a.collision.vz)*ja,bzv=(b.press.swipeVZ+b.collision.vz)*jb;
          const closing=Math.max(0,(av-bv)*hit.nx+(azv-bzv)*hit.nz),impulse=Math.min(parameters.collisions.maxImpulse*parameters.motion.wobbleSpeed,(1+parameters.collisions.restitution)*closing/den);
          a.collision.vx-=hit.nx*impulse*ja*wa;a.collision.vz-=hit.nz*impulse*ja*wa;b.collision.vx+=hit.nx*impulse*jb*wb;b.collision.vz+=hit.nz*impulse*jb*wb;
        }
      }
      if(!corrections)break;
    }
    // Avoid retaining removed stones after the frame; the array storage stays.
    pairs.length=0;return {contacts,maxPenetration};
  }
  solve.stats=stats;return solve;
}
