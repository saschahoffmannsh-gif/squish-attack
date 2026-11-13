export const SWARM_LIMITS=Object.freeze({score:128,record:64});
const clamp=x=>Math.max(0,Math.min(1,x));
const noise=i=>{const n=Math.sin(i*127.1+31.7)*43758.5453;return n-Math.floor(n);};
const mix=(a,b,t)=>a+(b-a)*t;

export function swarmDensity(group,kind='score',combo=group.combo||1){
  const count=group.cells?.length||3;
  const base=kind==='record'?(count>=5?54:count===4?42:30):(group.street?22+(count-3)*8:count>=5?44:count===4?28:18);
  return Math.min(64,base+Math.min(12,Math.max(0,combo-1)*4));
}

// Paths use the accepted photograph's normalized coordinates. Every bead
// leaves a real source cell, gathers at the merge, and reaches its own HUD.
export function createMergeSwarm(group,target,{kind='score',seed=1,limit=Infinity}={}){
  const requested=swarmDensity(group,kind),count=Math.min(requested,Math.max(0,limit));
  const sources=group.sources?.length?group.sources:[{...group.position,value:group.value||group.nextValue}];
  const hub={x:group.position.x,y:group.position.y},all=[];
  for(let i=0;i<requested;i++){
    const sourceIndex=i%sources.length,source=sources[sourceIndex],phase=noise(i+seed)*Math.PI*2;
    const lane=(i%7-3)/3,wide=kind==='record'?1.2:1;
    const delay=35+(group.street?sourceIndex*26:sourceIndex*8)+Math.floor(i/sources.length)*12+noise(i+seed+19)*28;
    const duration=(kind==='record'?690:740)+(group.cells?.length>=5?90:0)+noise(i*3+seed)*150;
    const first={x:hub.x+(target.x>=hub.x?8:-8)+lane*9*wide,y:hub.y-9-noise(i+3)*5};
    const second={x:target.x+lane*7*wide,y:target.y+8+noise(i+7)*5};
    all.push({source:{x:source.x,y:source.y},hub,target:{x:target.x,y:target.y},first,second,
      phase,scatterX:Math.cos(phase)*1.8,scatterY:Math.sin(phase)*1.0,wiggle:.45+noise(i+5)*.8,
      delay,duration,value:kind==='record'?group.nextValue:(source.value||group.value||group.nextValue),
      golden:i%5===0,style:i%7===0?'gel':['pearl','spark','crystal'][i%3],size:i%7===0?3.8+noise(i)*1.4:1.6+noise(i+seed+2)*1.7});
  }
  const beads=Array.from({length:count},(_,i)=>all[Math.floor(i*requested/count)]);
  const timing=beads.length?beads:all;
  return {beads,requested,firstArrival:Math.min(...timing.map(b=>b.delay+b.duration)),settleAt:Math.max(...timing.map(b=>b.delay+b.duration))};
}

export function swarmPoint(bead,t){
  t=clamp(t);
  if(t<=.18){
    const u=t/.18,s=1-(1-u)**3,arc=Math.sin(u*Math.PI);
    return {x:mix(bead.source.x,bead.hub.x,s)+bead.scatterX*arc,y:mix(bead.source.y,bead.hub.y,s)+bead.scatterY*arc};
  }
  const u=(t-.18)/.82,s=u*u*(3-2*u),a=1-s,envelope=Math.sin(s*Math.PI)*(1-s);
  return {x:a**3*bead.hub.x+3*a*a*s*bead.first.x+3*a*s*s*bead.second.x+s**3*bead.target.x+Math.sin(bead.phase+s*9)*bead.wiggle*envelope,
    y:a**3*bead.hub.y+3*a*a*s*bead.first.y+3*a*s*s*bead.second.y+s**3*bead.target.y+Math.cos(bead.phase+s*9)*bead.wiggle*.4*envelope};
}
