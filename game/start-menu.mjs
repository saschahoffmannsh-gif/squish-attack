const controllerKey=Symbol.for('squish.start-menu-controller');

// The splash hands over to the in-world menu: the empty glass table, with wide
// gel cushions as buttons. The DOM keeps invisible buttons for keyboards and
// assistive technology, plus the loading status and retry for failures.
export function installStartMenu({
  page=document,
  loadGame=()=>import('./game.mjs?v=launch-1'),
  paint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),
  delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  splashMs=4000,timeoutMs=30000,
}={}) {
  const overlay=page.getElementById('loading-screen');
  if(overlay[controllerKey])return overlay[controllerKey];
  const controller={ready:null};overlay[controllerKey]=controller;
  const panel=page.getElementById('main-menu'),splash=page.getElementById('brand-splash');
  const logo=page.getElementById('brand-logo'),theme=page.getElementById('theme-color');
  const progress=page.getElementById('splash-progress'),caption=page.getElementById('splash-caption');
  const status=page.getElementById('loading-status'),retry=page.getElementById('loading-retry');
  const game=page.querySelector('.game');
  const legacy=['menu-new','menu-continue','menu-multiplayer','menu-settings'].map(id=>page.getElementById(id)).filter(Boolean);
  let app,available=false,launching=false,failed=false,introDone=!splash,inWorld=false,timer;
  for(const button of legacy){button.disabled=true;button.hidden=true;}
  function animateProgress(){
    const duration=Math.max(0,splashMs-180),start=Date.now();let tick;
    splash.style?.setProperty('--loading-time',`${duration}ms`);
    splash.dataset.loading='running';
    function complete(){
      clearTimeout(tick);progress?.setAttribute('aria-valuenow','100');
      splash.dataset.loading='complete';if(caption)caption.textContent='Bereit zum Ploppen!';
    }
    function update(){
      const value=duration?Math.min(100,Math.floor((Date.now()-start)/duration*100)):100;
      progress?.setAttribute('aria-valuenow',String(value));
      if(value<100)tick=setTimeout(update,160);else complete();
    }
    update();return complete;
  }
  function enterWorld(){
    if(inWorld||!introDone||!available||failed||launching)return;
    inWorld=true;overlay.dataset.mode='world';overlay.dataset.phase='menu';
    panel.setAttribute('aria-busy','false');status.textContent='';
    void app.menuActions.world.open({launch}).catch(()=>failure('Das Menü konnte nicht geladen werden. Bitte erneut laden.'));
  }
  function revealMenu(){
    introDone=true;if(splash)splash.hidden=true;
    page.documentElement?.classList?.remove('is-boot-splash');
    theme?.setAttribute('content','#08080a');
    if(overlay.dataset.phase==='complete')return;
    overlay.hidden=false;overlay.inert=false;
    if(failed)retry.focus({preventScroll:true});else if(available)enterWorld();else panel.focus({preventScroll:true});
  }
  function failure(message){
    failed=true;available=false;launching=false;inWorld=false;delete overlay.dataset.mode;
    overlay.hidden=!introDone;overlay.inert=!introDone;
    overlay.dataset.phase='error';panel.setAttribute('aria-busy','false');
    game.inert=true;game.setAttribute('aria-hidden','true');
    status.textContent=message;retry.hidden=false;if(introDone)retry.focus({preventScroll:true});
  }
  async function launch(newGame){
    if(!introDone||!available||launching||failed)return;
    launching=true;panel.setAttribute('aria-busy','true');
    try{
      app.menuActions.prepare();
      await app.menuActions.select(newGame);
      overlay.hidden=true;overlay.dataset.phase='complete';panel.setAttribute('aria-busy','false');
      game.inert=false;game.removeAttribute('aria-hidden');
      await app.menuActions.start();
      page.getElementById('playfield').focus({preventScroll:true});
    }catch{failure('Das Spiel konnte nicht gestartet werden. Bitte erneut laden.');}
  }
  retry.addEventListener('click',()=>page.defaultView.location.reload());
  overlay.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const items=[...overlay.querySelectorAll('button')].filter(button=>!button.disabled&&!button.hidden&&button.isConnected);
    const first=items[0],last=items.at(-1);
    if(!first){event.preventDefault();return;}
    if(event.shiftKey&&(page.activeElement===first||page.activeElement===panel)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&page.activeElement===last){event.preventDefault();first.focus();}
  });
  overlay.hidden=!!splash;overlay.inert=!!splash;overlay.dataset.phase='loading';
  panel.setAttribute('aria-busy','true');
  const intro=(async()=>{
    if(splash){
      if(typeof logo?.decode==='function'){try{await logo.decode();}catch{}}
      await paint();const complete=animateProgress();
      try{await delay(splashMs);}finally{complete();}
      await paint();
    }
  })().then(revealMenu,revealMenu);
  const boot=Promise.race([
    (async()=>{
      await paint();
      const loaded=await loadGame();await loaded.ready;
      if(failed)return;
      app=loaded;available=true;
      // Compile the wide cushions while the splash is still up.
      void app.menuActions.world.preload();
      enterWorld();
    })(),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Loading timeout')),timeoutMs);}),
  ]).catch(()=>failure('Das Spiel konnte nicht geladen werden. Bitte erneut versuchen.'))
    .finally(()=>clearTimeout(timer));
  controller.ready=Promise.all([intro,boot]);
  return controller;
}
