// Fullscreen must be requested inside the original play/button gesture.
// Browser refusal is harmless: the viewport layout works without this API.
export function installFullscreen(page=document) {
  const root=page.documentElement,button=page.getElementById('fullscreen-toggle');
  const request=root.requestFullscreen||root.webkitRequestFullscreen;
  const exit=page.exitFullscreen||page.webkitExitFullscreen;
  const supported=!!request&&page.fullscreenEnabled!==false&&page.webkitFullscreenEnabled!==false;
  const active=()=>!!(page.fullscreenElement||page.webkitFullscreenElement);
  function sync(){
    if(!button)return;
    button.hidden=!supported;
    button.setAttribute('aria-pressed',String(active()));
    button.setAttribute('aria-label',active()?'Vollbild verlassen':'Vollbild einschalten');
    button.querySelector('[data-fullscreen-label]').textContent=active()?'Vollbild verlassen':'Vollbild';
  }
  async function enter(){
    if(!supported||active())return active();
    try{await request.call(root);sync();return active();}catch{return false;}
  }
  button?.addEventListener('click',async()=>{
    if(active()){try{await exit?.call(page);}catch{}}
    else await enter();
    sync();
  });
  page.addEventListener('fullscreenchange',sync);
  page.addEventListener('webkitfullscreenchange',sync);
  sync();
  return {enter};
}
