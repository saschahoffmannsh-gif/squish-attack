// Seconds on the renderer's bounded animation clock, never wall-clock timers.
const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const p=clamp(value);return p*p*(3-2*p);};
export const PRESSURE_TIMING=Object.freeze({approach:.036,contactStep:.018,charge:.057,popStep:.025,travel:.066,settle:.039,peakLead:.007,contactBlend:.022});
const vectors={right:{x:1,z:0},left:{x:-1,z:0},down:{x:0,z:1},up:{x:0,z:-1}};
const timelines=Array.from({length:5},()=>[]);

export function pressureTiming(depth,rank){
  if(!Number.isInteger(depth)||depth<1||depth>4||!Number.isInteger(rank)||rank<0||rank>depth)throw new RangeError('Invalid pressure chain');
  if(timelines[depth][rank])return timelines[depth][rank];
  const p=PRESSURE_TIMING;
  const contact=p.approach+Math.max(0,rank-1)*p.contactStep;
  const firstPop=p.approach+(depth-1)*p.contactStep+p.charge;
  const release=firstPop+(depth-rank)*p.popStep;
  return timelines[depth][rank]=Object.freeze({contact,charged:firstPop-p.peakLead,release,land:release+p.travel,end:release+p.travel+p.settle});
}

export function samplePressure(depth,rank,elapsed,out={}){
  const timing=pressureTiming(depth,rank),charge=smooth((elapsed-timing.contact)/(timing.charged-timing.contact));
  // The strong squeeze is now along the push axis at draw time. Keep only a
  // small height spring here; flattening downwards was hiding the contact.
  const peakSquash=rank===0?.085:.075-(rank-1)*.012;
  const peakLean=.025;
  const nudge=rank===0?.095+.025*charge:.035*charge*(1-(rank-1)*.12);
  if(elapsed<timing.release){
    out.progress=rank===0&&elapsed<timing.contact?.095*smooth(elapsed/timing.contact):nudge;
    out.squash=peakSquash*charge;out.lean=peakLean*charge;out.phase=charge===0?'contact':'squeeze';out.done=false;return out;
  }
  if(elapsed<timing.land){
    const u=clamp((elapsed-timing.release)/PRESSURE_TIMING.travel),ease=1-(1-u)**3;
    out.progress=nudge+(1-nudge)*ease;out.squash=peakSquash*(1-ease)-.075*Math.sin(Math.PI*u);
    out.lean=peakLean*(1-ease)-.12*Math.sin(Math.PI*u);out.phase='pop';out.done=false;return out;
  }
  const u=clamp((elapsed-timing.land)/PRESSURE_TIMING.settle),echo=Math.exp(-4*u)*Math.sin(2*Math.PI*u);
  out.progress=1;out.squash=u===1?0:-.035*echo;out.lean=u===1?0:.06*echo;out.phase=u===1?'rest':'settle';out.done=u===1;return out;
}

// syncTiles has already created the original meshes and their from/to vectors.
// Override only this insertion's trajectory and the existing anchored gel pose.
export function installPressureWave(tiles,{id,direction},start,onPop=()=>{}){
  const axis=vectors[direction];if(!axis)throw new RangeError('Invalid push direction');
  const chain=tiles.filter(tile=>tile.motion).sort((a,b)=>(a.col-b.col)*axis.x+(a.row-b.row)*axis.z);
  if(chain.length<2||chain.length>5||chain[0].id!==id)return 0;
  const depth=chain.length-1;
  const wave={axis,depth,elapsed:0,entries:chain.map((tile,rank)=>({tile,rank,from:tile.motion.from.clone(),to:tile.motion.to.clone()}))};
  chain.forEach((tile,rank)=>{
    const motion=tile.motion,timing=pressureTiming(depth,rank);
    let popped=false;const framePose={};
    // A held pointer and the generic travel wobble must not fight this load.
    Object.assign(tile.press,{held:false,releaseQueued:false,compression:0,velocity:0,hasSwipe:false,
      dragX:0,dragZ:0,swipeX:0,swipeZ:0,swipeVX:0,swipeVZ:0});
    tile.amplitude=0;motion.start=start;motion.duration=timing.end;
    tile.group.userData.pressureWave={wave,rank};
    motion.pressureWave={depth,rank,release:timing.release,phase:'contact'};
    motion.sample=(body,time)=>{
      const elapsed=Math.max(0,time-start),pose=samplePressure(depth,rank,elapsed,framePose);
      wave.elapsed=elapsed;
      Object.assign(body.collision,{x:0,z:0,vx:0,vz:0});
      body.group.position.lerpVectors(motion.from,motion.to,pose.progress);
      body.deformation.sway=axis.x*pose.lean;
      body.deformation.swayZ=axis.z*pose.lean;
      body.deformation.squash=pose.squash;
      motion.pressureWave.phase=pose.phase;
      if(!popped&&elapsed>=timing.release){popped=true;onPop(body.id,rank);}
      if(pose.done){
        body.motion=null;body.amplitude=Math.max(body.amplitude,.18);
        if(rank===0)for(const entry of wave.entries)delete entry.tile.group.userData.pressureWave;
      }
    };
  });
  return chain.length;
}
