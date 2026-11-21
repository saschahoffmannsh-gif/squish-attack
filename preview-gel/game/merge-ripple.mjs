export const MAX_RIPPLE_POWER=.72;
export function planMergeRipple(board,groups,{combo=1,moves=0}={}){
  const results=new Set(groups.map(g=>board[g.target[0]][g.target[1]]?.id));
  const chain=Math.min(.08,Math.max(0,combo-1)*.025);
  const reach=Math.min(.7,Math.max(0,combo-1)*.20);
  const waves=groups.map(g=>({row:g.target[0],col:g.target[1],count:g.cells.length,
    power:(g.cells.length>=5?.68:g.cells.length===4?.55:.40)+chain,
    radius:(g.cells.length>=5?5.8:g.cells.length===4?3.9:2.8)+reach,
    echo:g.cells.length>=4||combo>=2}));
  const pulses=[];
  board.forEach((line,row)=>line.forEach((tile,col)=>{
    if(!tile||results.has(tile.id))return;
    let chosen;
    for(const wave of waves){
      const distance=Math.hypot(row-wave.row,col-wave.col);
      if(distance>wave.radius)continue;
      const power=wave.power/Math.max(1,distance)**1.05;
      if(!chosen||power>chosen.power)chosen={power,distance,echo:wave.echo};
    }
    if(!chosen)return;
    const seed=Math.sin(tile.id*12.9898+(moves+1)*78.233)*43758.5453,variation=seed-Math.floor(seed);
    const power=Math.min(MAX_RIPPLE_POWER,chosen.power*(.92+.16*variation));
    const delay=.018+chosen.distance*.045+variation*.025;
    pulses.push({id:tile.id,power,delay});
    if(chosen.echo)pulses.push({id:tile.id,power:power*.52,delay:delay+.19+chosen.distance*.025});
  }));
  return pulses;
}
// Fast cascades share spring kicks instead of stacking an unbounded backlog.
export function enqueueRippleImpulse(queue,event){
  event={...event,power:Math.max(0,Math.min(MAX_RIPPLE_POWER,event.power))};
  const pending=queue.filter(p=>p.tile===event.tile);
  const near=pending.find(p=>Math.abs(p.time-event.time)<.085);
  if(near){near.power=Math.max(near.power,event.power);near.time=Math.min(near.time,event.time);return;}
  if(pending.length>=2){const later=pending.reduce((a,b)=>a.time>b.time?a:b);later.power=Math.max(later.power,event.power);later.time=Math.min(later.time,event.time);return;}
  queue.push(event);
  if(queue.length>50){const weakest=queue.reduce((a,p,i)=>p.power<queue[a].power?i:a,0);queue.splice(weakest,1);}
}
