// Presentation only: authoritative scores never wait for visual effects.
export function createScoreLedger(write) {
  let target=0,settled=0,shown=0,pending=[],tween=null,last=-1;
  function publish(){const value=Math.round(shown);if(value!==last){last=value;write(value);}}
  function reset(value){target=settled=shown=value;pending=[];tween=null;publish();}
  function sync(value,force=false){if(force||value!==target)reset(value);}
  function queue(from,to,awards,now){
    if(to===target||to<=from)return false;
    if(target!==from)reset(from);
    target=to;
    if(awards.reduce((sum,a)=>sum+a.points,0)!==to-from)awards=[{points:to-from,delay:800}];
    for(const award of awards)pending.push({points:award.points,at:now+award.delay});
    return true;
  }
  function update(now){
    if(tween){const t=Math.min(1,Math.max(0,(now-tween.at)/220));shown=tween.from+(tween.to-tween.from)*(1-(1-t)**3);if(t===1)tween=null;}
    let arrived=0;
    pending=pending.filter(item=>{if(item.at<=now){arrived+=item.points;return false;}return true;});
    if(arrived){settled=Math.min(target,settled+arrived);tween={from:shown,to:settled,at:now};}
    publish();
  }
  return {sync,queue,update,finish(){reset(target);},get target(){return target;},get displayed(){return Math.round(shown);},get busy(){return pending.length>0||!!tween;}};
}
