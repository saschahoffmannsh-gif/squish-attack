export const DISPLAY_BUILD='99';
export const DISPLAY_REPORT_UNTIL=Date.parse('2026-11-05T00:00:00Z');
const fields={
  screen:['width','height','availableHeight','dpr'],
  viewport:['width','height','clientWidth','clientHeight','visualWidth','visualHeight','offsetTop','offsetLeft','scale'],
  units:['vh','dvh','svh','lvh'],safe:['top','right','bottom','left'],
  game:['left','top','width','height'],stage:['left','top','width','height'],
  forest:['left','top','width','height'],video:['left','top','width','height'],
  splash:['left','top','width','height'],
};

// Only these non-identifying display measurements may enter the support log.
// Extra fields, URLs, cookies, player identifiers and user text are discarded.
export function cleanDisplayReport(input) {
  if(!input||input.build!==DISPLAY_BUILD||!['boot','ready','manual'].includes(input.phase))return null;
  const out={build:DISPLAY_BUILD,phase:input.phase};
  for(const [group,keys] of Object.entries(fields)) {
    if(!input[group]||typeof input[group]!=='object')return null;
    out[group]={};
    for(const key of keys) {
      const value=input[group][key];
      if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>20000)return null;
      out[group][key]=Math.round(value*100)/100;
    }
  }
  out.mode={};
  for(const key of ['standalone','fullscreen','embedded','chatgpt','splashVisible']) {
    if(typeof input.mode?.[key]!=='boolean')return null;
    out.mode[key]=input.mode[key];
  }
  out.videoSource=input.videoSource==='native'?'native':'expanded';
  return out;
}

export function measureDisplay(view=window,page=document,phase='manual') {
  const rect=selector=>{
    const r=page.querySelector(selector)?.getBoundingClientRect();
    return Object.fromEntries(['left','top','width','height'].map(key=>[key,r?.[key]||0]));
  };
  const probe=page.createElement('div');
  probe.style.cssText='position:fixed;left:0;top:0;width:1px;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);box-sizing:content-box;';
  page.body.append(probe);
  const css=view.getComputedStyle(probe),safe={};
  for(const edge of ['top','right','bottom','left'])safe[edge]=parseFloat(css.getPropertyValue(`padding-${edge}`))||0;
  probe.style.padding='0';const units={};
  for(const unit of ['vh','dvh','svh','lvh']){probe.style.height=`100${unit}`;units[unit]=probe.getBoundingClientRect().height;}
  probe.remove();
  const visual=view.visualViewport,splash=page.getElementById('brand-splash');
  return cleanDisplayReport({build:DISPLAY_BUILD,phase,
    screen:{width:view.screen.width,height:view.screen.height,availableHeight:view.screen.availHeight,dpr:view.devicePixelRatio},
    viewport:{width:view.innerWidth,height:view.innerHeight,clientWidth:page.documentElement.clientWidth,clientHeight:page.documentElement.clientHeight,
      visualWidth:visual?.width??view.innerWidth,visualHeight:visual?.height??view.innerHeight,offsetTop:visual?.offsetTop||0,offsetLeft:visual?.offsetLeft||0,scale:visual?.scale||1},
    units,safe,game:rect('.game'),stage:rect('.game-stage'),forest:rect('#forest-viewport'),video:rect('#living-background'),splash:rect('#brand-splash'),
    mode:{standalone:view.navigator.standalone===true||view.matchMedia('(display-mode:standalone)').matches,fullscreen:!!page.fullscreenElement||view.matchMedia('(display-mode:fullscreen)').matches,
      embedded:view.self!==view.top,chatgpt:/ChatGPT/i.test(view.navigator.userAgent),splashVisible:!!splash&&!splash.hidden},
    videoSource:page.getElementById('living-background')?.getAttribute('src')?.includes('plants-only-loop')?'native':'expanded',
  });
}
