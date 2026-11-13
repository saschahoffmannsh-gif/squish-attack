import {pressureTiming,samplePressure,PRESSURE_TIMING} from './pressure-wave.mjs?v=soft-gel-1';
const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const p=clamp(value);return p*p*(3-2*p);};

export function contactCompression(depth,rank,elapsed){
  const timing=pressureTiming(depth,rank),front=.36-.05*(depth-1),back=.24-.06*(depth-1);
  const peak=front+(back-front)*rank/depth;
  if(elapsed<timing.release)return peak*smooth((elapsed-timing.contact)/(timing.charged-timing.contact));
  const u=clamp((elapsed-timing.release)/PRESSURE_TIMING.travel);
  return peak*(1-u)**3;
}

// Bounds in the final photographic world space, after the board footprint fit.
// Only the active chain is measured. No vertex buffers or rest shapes change.
export function bodyAxisBounds(tile,key){
  const values=tile.body.geometry.attributes.position.array,axis=key==='x'?0:2,scale=tile.group.scale[key];
  let min=Infinity,max=-Infinity;
  for(let i=axis;i<values.length;i+=3){const value=values[i]*scale;min=Math.min(min,value);max=Math.max(max,value);}
  return {min,max};
}

function peakBounds(entry,wave,key,baseScale,parameters){
  const time=pressureTiming(wave.depth,wave.depth).release,pose=samplePressure(wave.depth,entry.rank,time-1e-8);
  const compression=contactCompression(wave.depth,entry.rank,time-1e-8),axis=key==='x'?0:2;
  const direction=wave.axis[key],scale=baseScale*(1-compression),rest=entry.tile.rest;
  let min=Infinity,max=-Infinity;
  for(let i=axis;i<rest.length;i+=3){
    const y=rest[i-axis+1],anchor=(Math.max(0,y)/parameters.gel.height)**1.7;
    const value=(rest[i]*(1+pose.squash*anchor*parameters.motion.spreadFactor)+direction*pose.lean*anchor)*scale;
    min=Math.min(min,value);max=Math.max(max,value);
  }
  return {min,max};
}

export function packedCenters(sources,bounds,sign,weights){
  const centers=sources.slice();
  for(let i=centers.length-2;i>=0;i--){
    const forward=sign>0?bounds[i].max:-bounds[i].min,back=sign>0?-bounds[i+1].min:bounds[i+1].max;
    const contact=centers[i+1]-sign*(forward+back+.002);
    centers[i]+=(contact-centers[i])*weights[i];
  }
  return centers;
}

// Called only inside withPhotoPositions. Its finally block restores every
// root and scale, including picking, material masks, refraction and shadows.
export function applyPressureContacts(tiles,mapPosition,parameters,projectionRevision=0){
  const waves=new Set(tiles.map(tile=>tile.group.userData.pressureWave?.wave).filter(Boolean));
  for(const wave of waves){
    const {entries,depth,elapsed}=wave,key=wave.axis.x?'x':'z',cross=key==='x'?'z':'x',sign=wave.axis[key];
    // Each insertion keeps the same source/destination wells. Reuse their
    // ray projections and vectors until camera calibration changes.
    if(wave.projectionCache?.revision!==projectionRevision||wave.projectionCache.map!==mapPosition)wave.projectionCache={
      revision:projectionRevision,map:mapPosition,sources:entries.map(entry=>mapPosition(entry.from).clone()),
      targets:entries.map(entry=>mapPosition(entry.to).clone())};
    const {sources,targets}=wave.projectionCache;
    const baseScales=entries.map(entry=>entry.tile.group.scale[key]);
    entries.forEach(entry=>{
      const amount=contactCompression(depth,entry.rank,elapsed),scale=entry.tile.group.scale;
      scale[key]*=1-amount;scale[cross]*=1+amount*.20;scale.y*=1+amount*.60;
    });
    // Rest geometry and full-load shape are constant for this short wave.
    // Cache that scan; moving frames only measure the current axial bounds.
    const signature=[key,...baseScales,parameters.gel.height,parameters.motion.spreadFactor].join(':');
    if(wave.contactCache?.signature!==signature)wave.contactCache={signature,
      bounds:entries.map((entry,i)=>peakBounds(entry,wave,key,baseScales[i],parameters))};
    const peak=wave.contactCache.bounds;
    const loaded=packedCenters(sources.map(p=>p[key]),peak,sign,entries.map(()=>1));
    const firstPop=pressureTiming(depth,depth).release;
    const current=elapsed<firstPop?packedCenters(sources.map(p=>p[key]),entries.map(entry=>bodyAxisBounds(entry.tile,key)),sign,
      entries.slice(0,-1).map((_,i)=>smooth((elapsed-pressureTiming(depth,i+1).contact+PRESSURE_TIMING.contactBlend)/PRESSURE_TIMING.contactBlend))):loaded;
    entries.forEach((entry,i)=>{
      const {tile,rank}=entry,timing=pressureTiming(depth,rank),source=sources[i],target=targets[i];
      const travel=target[key]-source[key],position=elapsed<firstPop?current[i]:loaded[i];
      const progress=(position-source[key])/travel;
      // Source and destination share the photographed row/column's slight
      // perspective drift; follow that path while bringing the surfaces together.
      tile.group.position.lerpVectors(source,target,progress);
      if(elapsed>=timing.release){
        const u=clamp((elapsed-timing.release)/PRESSURE_TIMING.travel);
        tile.group.position.lerp(target,1-(1-u)**3);
      }
    });
  }
}
