// 2D-Comic-Effekte der Hilfsmittel (launch-12): Raketenflug mit Rauchspur,
// BOOM-Explosion, Funkeln (Zauberstab), Hinweis-Pfeil und Zahlen-Auswahl.
// Eigene Ebene über allem (position:fixed), Koordinaten = Client-Pixel.
import {TOOL_ICONS,boomSvg,SPARK_SVG,ARROW_SVG} from './tool-icons.mjs?v=launch-18';

export function createToolFx({reduceMotion,root=document.body,shakeTarget=null}={}){
  const layer=document.createElement('div');layer.className='tool-fx';layer.setAttribute('aria-hidden','true');root.append(layer);
  const reduced=()=>!!reduceMotion?.matches;
  const add=(cls,html='',parent=layer)=>{const d=document.createElement('div');d.className=cls;d.innerHTML=html;parent.append(d);return d;};
  const place=(d,p,w,h=w)=>{d.style.left=`${p.x-w/2}px`;d.style.top=`${p.y-h/2}px`;d.style.width=`${w}px`;d.style.height=`${h}px`;};
  const autoRemove=(d,ms)=>{d.addEventListener('animationend',()=>d.remove(),{once:true});setTimeout(()=>d.remove(),ms+400);};
  const stats={rockets:0,booms:0,sparkles:0,arrows:0,pickers:0};

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
  // Zauberstab: Funkeln rund um den Stein.
  function sparkle(p,size){
    stats.sparkles++;
    const n=reduced()?3:9;
    for(let i=0;i<n;i++){
      const s=add('tfx-spark is-magic'+(reduced()?' is-reduced':''),SPARK_SVG),a=i/n*Math.PI*2,r=size*(.55+.25*(i%3)/2);
      s.style.setProperty('--dx',`${Math.cos(a)*r*.6}px`);s.style.setProperty('--dy',`${Math.sin(a)*r*.6-size*.2}px`);
      s.style.animationDelay=`${(i%4)*45}ms`;
      place(s,{x:p.x+Math.cos(a)*r*.5,y:p.y+Math.sin(a)*r*.5},size*(.26+.1*(i%2)));autoRemove(s,800);
    }
  }
  // Hinweis: goldene Bahn über der Reihe/Spalte und ein Pfeil an der Einschubseite.
  function hintArrow(lane,size,ms){
    stats.arrows++;
    const xs=lane.map(p=>p.x),ys=lane.map(p=>p.y),pad=size*.62;
    const band=add('tfx-lane');
    band.style.left=`${Math.min(...xs)-pad}px`;band.style.top=`${Math.min(...ys)-pad}px`;
    band.style.width=`${Math.max(...xs)-Math.min(...xs)+pad*2}px`;band.style.height=`${Math.max(...ys)-Math.min(...ys)+pad*2}px`;
    const step={x:lane[1].x-lane[0].x,y:lane[1].y-lane[0].y},sl=Math.hypot(step.x,step.y)||1;
    const entry={x:lane[0].x-step.x/sl*size*1.02,y:lane[0].y-step.y/sl*size*1.02};
    const arrow=add('tfx-arrow'+(reduced()?' is-reduced':''),ARROW_SVG);place(arrow,entry,size*.95);
    arrow.style.setProperty('--rot',`${Math.atan2(step.y,step.x)*180/Math.PI}deg`);
    return new Promise(resolve=>setTimeout(()=>{band.remove();arrow.remove();resolve();},ms));
  }
  // Zahlen-Auswahl (Zauberstab): Comic-Panel mit Pillen in den Squish-Farben.
  function picker({anchor,choices,colors,current,onPick,onCancel}){
    stats.pickers++;
    const veil=add('tfx-picker-veil');veil.style.pointerEvents='auto';
    const panel=add('tfx-picker','',veil);panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Zauberstab: neue Zahl wählen');
    const title=document.createElement('div');title.className='tfx-picker-title';title.textContent='Zauberstab';
    const sub=document.createElement('div');sub.className='tfx-picker-sub';sub.textContent=`Aus der ${current} wird …`;
    const grid=document.createElement('div');grid.className='tfx-picker-grid';
    let done=false;
    const close=()=>{if(done)return;done=true;document.removeEventListener('keydown',key);veil.remove();};
    for(const v of choices){
      const b=document.createElement('button');b.type='button';b.className='tfx-num';b.textContent=String(v);b.dataset.value=String(v);
      const c=colors(v);b.style.setProperty('--hi',c.hi);b.style.setProperty('--mid',c.mid);b.style.setProperty('--lo',c.lo);
      b.setAttribute('aria-label',`Zahl ${v}`);
      b.addEventListener('click',ev=>{ev.stopPropagation();close();onPick?.(v);});grid.append(b);
    }
    const cancel=document.createElement('button');cancel.type='button';cancel.className='tfx-cancel';cancel.textContent='Abbrechen';
    cancel.addEventListener('click',ev=>{ev.stopPropagation();close();onCancel?.();});
    veil.addEventListener('pointerdown',ev=>{if(ev.target===veil){ev.preventDefault();close();onCancel?.();}});
    function key(ev){if(ev.key==='Escape'){ev.preventDefault();close();onCancel?.();}}
    document.addEventListener('keydown',key);
    panel.append(title,sub,grid,cancel);
    const vh=innerHeight,below=anchor.y<vh*.42;
    panel.style.top=below?`${anchor.y+anchor.size*.8}px`:'';panel.style.bottom=below?'':`${vh-anchor.y+anchor.size*.8}px`;
    requestAnimationFrame(()=>grid.querySelector('button')?.focus({preventScroll:true}));
    return {close,element:panel};
  }
  return {rocket,boom,sparkle,hintArrow,picker,layer,stats};
}
