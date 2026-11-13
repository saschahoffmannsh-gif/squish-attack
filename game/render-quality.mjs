// Bound the cost of the live gel layers and HDR resolves on mobile GPUs
// without softening the backing store. iPhone numbers went mushy when the
// previous pass started at 1.25x and could fall to 1x.
export function configureRenderQuality(graphics) {
  const renderer=graphics.renderer,mobile=matchMedia('(max-width:700px), (pointer:coarse)').matches;
  const ios=/iP(hone|ad|od)/.test(navigator.userAgent||'')||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  // Real iPhones report 2x or 3x. Keep at least ~2x so gel edges and
  // numerals stay sharp. Cap iOS at 2x: 2.5x plus fusion blobs was enough
  // to lose the WebGL context after the starting stones landed.
  const maximum=Math.min(devicePixelRatio,ios?2:mobile?2.5:2);
  const minimum=mobile?Math.min(maximum,ios?1.75:2):Math.min(maximum,1.5);
  const target=graphics.bloom.targets.base;
  // The SDK intentionally starts mobile HDR without MSAA. Do not override it
  // with several full-screen multisampled buffers on iPhone.
  target.samples=0;
  if(!mobile){
    const gl=renderer.getContext(),format=graphics.bloom.hdr?gl.RGBA16F:gl.RGBA8;
    const supported=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,format,gl.SAMPLES)||[]).filter(n=>n>=2&&n<=4).sort((a,b)=>a-b);
    target.samples=supported[0]||0;
  }
  renderer.setPixelRatio(maximum);
  // Recover the extra pixel cost in the refraction resolve, not in density.
  renderer.transmissionResolutionScale=mobile?.35:1;
  // Shadow maps follow board changes; an idle table must not redraw them.
  renderer.shadowMap.autoUpdate=false;
  renderer.shadowMap.needsUpdate=true;
  const slowFrame=mobile?.022:.032;
  let average=1/60,samples=0,lastChange=0;
  const stats={mobile,averageFrameMs:0,changes:0,pixelRatio:renderer.getPixelRatio(),minimum,maximum,msaaSamples:target.samples,transmissionScale:renderer.transmissionResolutionScale};
  graphics.quality={stats,invalidateShadows(){renderer.shadowMap.needsUpdate=true;},update(dt,time,allowResize=true){
    if(!Number.isFinite(dt)||dt<=0||dt>.25)return;
    average+=(Math.min(dt,.1)-average)*.06;samples++;stats.averageFrameMs=average*1000;
    // Reallocating all HDR/mask targets during a slide creates a visible stall.
    // Measure continuously, but apply density changes after the action settles.
    if(!allowResize||samples<45||time-lastChange<4)return;
    const current=renderer.getPixelRatio();let next=current;
    if(average>slowFrame)next=Math.max(minimum,current-.25);
    else if(average<.016)next=Math.min(maximum,current+.25);
    if(Math.abs(next-current)>.001){renderer.setPixelRatio(next);lastChange=time;samples=0;stats.changes++;stats.pixelRatio=next;renderer.shadowMap.needsUpdate=true;}
  }};
}
