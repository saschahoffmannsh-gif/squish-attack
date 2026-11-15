// Render density for the comic renderer (launch-8). Squishes are flat, opaque
// and drawn straight into the canvas: no HDR target, no gel bloom mask and no
// refraction pass any more. That budget goes into native resolution: iPhones
// render at their full 3x, with the canvas' own multisampling (antialias).
const LOST_KEY='squish-render-cap';
export function renderCaps({dpr=globalThis.devicePixelRatio||1,ios=false,mobile=false,lostCap=null}={}){
  // A lost WebGL context once on this device: stay one notch lower next time.
  const cap=lostCap??(ios?3:mobile?3:2);
  const maximum=Math.max(1,Math.min(dpr,cap));
  const minimum=mobile?Math.min(maximum,2):Math.min(maximum,1.5);
  return {maximum,minimum};
}
// Only drop density under genuine, sustained load: frames that actually
// rendered, slower than ~36 fps on average for about 2 s; single hitches,
// background tabs and idle frames do not count. Recover when it is smooth again.
export function createQualityGovernor({maximum,minimum,mobile,slowMs=mobile?28:34,fastMs=17,window=120,cooldown=6}){
  let average=0,samples=0,lastChange=-Infinity,current=maximum;
  return {
    get average(){return average;},get samples(){return samples;},
    sample(dtSeconds,time,{rendered=true,settled=true}={}){
      if(rendered&&Number.isFinite(dtSeconds)&&dtSeconds>0&&dtSeconds<=.12){
        const ms=dtSeconds*1000;average=samples?average+(ms-average)*.04:ms;samples++;
      }
      if(!settled||samples<window||time-lastChange<cooldown)return current;
      let next=current;
      if(average>slowMs)next=Math.max(minimum,current-.25);
      else if(average<fastMs&&current<maximum)next=Math.min(maximum,current+.25);
      if(next!==current){current=next;lastChange=time;samples=0;}
      return current;
    },
  };
}
export function configureRenderQuality(graphics) {
  const renderer=graphics.renderer,mobile=matchMedia('(max-width:700px), (pointer:coarse)').matches;
  const ios=/iP(hone|ad|od)/.test(navigator.userAgent||'')||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  let lostCap=null;try{const v=Number(sessionStorage.getItem(LOST_KEY));if(v>0)lostCap=v;}catch{}
  const {maximum,minimum}=renderCaps({ios,mobile,lostCap});
  // Bloom targets stay unused (bloom off); keep them single-sampled and tiny.
  const target=graphics.bloom?.targets?.base;if(target)target.samples=0;
  renderer.setPixelRatio(maximum);
  renderer.transmissionResolutionScale=mobile?.35:1;
  // Shadow maps follow board changes; an idle table must not redraw them.
  renderer.shadowMap.autoUpdate=false;
  renderer.shadowMap.needsUpdate=true;
  const gl=renderer.getContext();
  const governor=createQualityGovernor({maximum,minimum,mobile});
  const stats={mobile,ios,averageFrameMs:0,changes:0,pixelRatio:renderer.getPixelRatio(),minimum,maximum,
    antialias:!!gl.getContextAttributes?.()?.antialias,bloom:!!graphics.bloom?.enabled,lostCap};
  renderer.domElement.addEventListener('webglcontextlost',()=>{
    // Remember a lower ceiling for the rest of this session.
    try{sessionStorage.setItem(LOST_KEY,String(Math.max(2,Math.min(maximum,renderer.getPixelRatio())-.5)));}catch{}
  });
  graphics.quality={stats,invalidateShadows(){renderer.shadowMap.needsUpdate=true;},update(dt,time,allowResize=true,rendered=true){
    const next=governor.sample(dt,time,{rendered,settled:allowResize});
    stats.averageFrameMs=governor.average;
    const current=renderer.getPixelRatio();
    if(Math.abs(next-current)>.001){renderer.setPixelRatio(next);stats.changes++;stats.pixelRatio=next;renderer.shadowMap.needsUpdate=true;}
  }};
}
