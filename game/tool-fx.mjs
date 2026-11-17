// 2D-Comic-Effekte der Hilfsmittel (launch-12): Raketenflug mit Rauchspur,
// BOOM-Explosion (launch-29: Zauberstab-Funkeln, Hinweis-Pfeil und Zahlen-Auswahl entfernt).
// Eigene Ebene über allem (position:fixed), Koordinaten = Client-Pixel.
import {TOOL_ICONS,boomSvg,SPARK_SVG} from './tool-icons.mjs?v=launch-32';

export function createToolFx({reduceMotion,root=document.body,shakeTarget=null}={}){
  const layer=document.createElement('div');layer.className='tool-fx';layer.setAttribute('aria-hidden','true');root.append(layer);
  const reduced=()=>!!reduceMotion?.matches;
  const add=(cls,html='',parent=layer)=>{const d=document.createElement('div');d.className=cls;d.innerHTML=html;parent.append(d);return d;};
  const place=(d,p,w,h=w)=>{d.style.left=`${p.x-w/2}px`;d.style.top=`${p.y-h/2}px`;d.style.width=`${w}px`;d.style.height=`${h}px`;};
  const autoRemove=(d,ms)=>{d.addEventListener('animationend',()=>d.remove(),{once:true});setTimeout(()=>d.remove(),ms+400);};
  const stats={rockets:0,booms:0};

  // Rakete fliegt auf einer leichten Kurve vom Werkzeug zum Stein, mit Rauchwölkchen.
  function rocket(from,to,size){
    stats.rockets++;
    if(reduced())return Promise.resolve();
    const w=Math.max(34,size*.9),rk=add('tfx-rocket',TOOL_ICONS.rocket);place(rk,from,w);
    const dx=to.x-from.x,dy=to.y-from.y,len=Math.hypot(dx,dy)||1;
    const ctrl={x:from.x+dx*.5-dy/len*Math.min(90,len*.28),y:from.y+dy*.5+dx/len*Math.min(90,len*.28)};
    const at=t=>({x:(1-t)**2*from.x+2*(1-t)*t*ctrl.x+t*t*to.x,y:(1-t)**2*from.y+2*(1-t)*t*ctrl.y+t*t*to.y});
    const duration=Math.min(720,380+len*.55),t0=performance.now();let lastPuff=0;
    return new Promise(resolve=>{
      function frame(now){
        const u=Math.min(1,(now-t0)/duration),t=u*u*(1.6-.6*u),p=at(t),q=at(Math.min(1,t+.02));
        const ang=Math.atan2(q.y-p.y,q.x-p.x)*180/Math.PI+48;
        rk.style.transform=`translate(${p.x-from.x}px,${p.y-from.y}px) rotate(${ang}deg)`;
        if(now-lastPuff>34&&u<.97){lastPuff=now;const back={x:p.x-(q.x-p.x)*6,y:p.y-(q.y-p.y)*6};
          const puff=add('tfx-puff');place(puff,back,w*(.32+.18*Math.random()));autoRemove(puff,520);}
        if(u<1)requestAnimationFrame(frame);else{rk.remove();resolve();}
      }
      requestAnimationFrame(frame);
    });
  }
  // BOOM: gezackter Comic-Stern mit Schrift, Funken, leichtes Wackeln des Spielfelds.
  function boom(p,size){
    stats.booms++;
    const b=add('tfx-boom'+(reduced()?' is-reduced':''),boomSvg());place(b,p,size*2.5);autoRemove(b,700);
    if(reduced())return;
    for(let i=0;i<8;i++){
      const s=add('tfx-spark',SPARK_SVG),a=i/8*Math.PI*2+Math.random()*.4,r=size*(1.1+Math.random()*.5);
      s.style.setProperty('--dx',`${Math.cos(a)*r}px`);s.style.setProperty('--dy',`${Math.sin(a)*r}px`);
      place(s,p,size*.34);autoRemove(s,600);
    }
    const target=shakeTarget?.();
    if(target){target.classList.remove('tfx-shake');void target.offsetWidth;target.classList.add('tfx-shake');setTimeout(()=>target.classList.remove('tfx-shake'),380);}
  }
  return {rocket,boom,layer,stats};
}
