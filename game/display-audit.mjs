import {apiFetch} from './api.mjs?v=sq-1';
import {DISPLAY_BUILD,DISPLAY_REPORT_UNTIL,measureDisplay} from './display-report.mjs?v=display-99';

async function send(phase) {
  if(Date.now()>DISPLAY_REPORT_UNTIL)return false;
  const report=measureDisplay(window,document,phase);if(!report)return false;
  try {
    const response=await apiFetch('/display-report',{method:'POST',credentials:'omit',cache:'no-store',keepalive:true,
      headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});
    return response.ok;
  }catch{return false;}
}
const button=document.getElementById('display-check');
if(Date.now()>DISPLAY_REPORT_UNTIL){if(button)button.hidden=true;const status=document.getElementById('display-check-status');if(status)status.textContent=`Stand ${DISPLAY_BUILD}`;}
button?.addEventListener('click',async()=>{
  button.disabled=true;const ok=await send('manual');
  document.getElementById('display-check-status').textContent=ok?`Bildschirmprüfung gesendet · Stand ${DISPLAY_BUILD}`:'Prüfung momentan nicht erreichbar.';
  button.disabled=false;
});
// Temporary, once-per-tab support measurements during this diagnosis. There
// is no persistent device identity, no game data and no image capture.
if(Date.now()<=DISPLAY_REPORT_UNTIL) {
  let sent=false;try{sent=sessionStorage.getItem('squish-display-99')==='sent';sessionStorage.setItem('squish-display-99','sent');}catch{}
  if(!sent||new URLSearchParams(location.search).has('displaycheck')){
    requestAnimationFrame(()=>requestAnimationFrame(()=>void send('boot')));
    setTimeout(()=>void send('ready'),5500);
  }
}
