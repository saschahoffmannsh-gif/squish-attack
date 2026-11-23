// Kurzer Konfetti-Regen (Canvas) für "Level geschafft". Keine Abhängigkeiten.
const COLORS=['#ffd25a','#ff9224','#e9402f','#48ba22','#2794ec','#9150ea','#fff3b0','#ff5fa2'];
export function createConfetti(page=document){
  let canvas=null,raf=0,parts=[],until=0,timeScale=1;
  function ensure(){
    if(canvas)return canvas;
    canvas=page.createElement('canvas');canvas.className='aw-confetti';canvas.setAttribute('aria-hidden','true');
    page.body.append(canvas);return canvas;
  }
  function stop(){
    cancelAnimationFrame(raf);raf=0;parts=[];
    if(canvas){canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);canvas.hidden=true;}
  }
  // rect: Bereich (Brett), aus dem das Konfetti kommt. Liefert ein Promise,
  // das nach `burstMs` erfüllt ist (die Teilchen fallen danach noch kurz weiter).
  function burst(rect,{reduced=false,burstMs=1200,count,speed=1}={}){
    timeScale=speed;
    const c=ensure(),dpr=Math.min(2,globalThis.devicePixelRatio||1),W=innerWidth,H=innerHeight;
    c.hidden=false;c.width=Math.round(W*dpr);c.height=Math.round(H*dpr);
    const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
    const r=rect||{left:0,top:H*.25,width:W,height:H*.4};
    const n=count??(reduced?36:150);
    parts=[];
    for(let i=0;i<n;i++){
      // Drei Quellen: links unten, rechts unten (schräg nach oben) und Mitte oben.
      const src=i%3,x=src===0?r.left+r.width*.1:src===1?r.left+r.width*.9:r.left+r.width*(.3+Math.random()*.4);
      const y=src===2?r.top+r.height*.15:r.top+r.height*.85;
      const ang=src===0?-Math.PI*(.28+Math.random()*.22):src===1?-Math.PI*(.5+Math.random()*.22):-Math.PI*(.15+Math.random()*.7);
      const sp=(src===2?7:17)+Math.random()*(src===2?7:9);
      parts.push({x,y,vx:Math.cos(ang)*sp,vy:Math.sin(ang)*sp,rot:Math.random()*6.28,vr:(Math.random()-.5)*.4,
        w:5+Math.random()*6,h:8+Math.random()*7,c:COLORS[i%COLORS.length],round:Math.random()<.25,wob:Math.random()*6.28,life:0});
    }
    const start=performance.now(),total=burstMs+1800/timeScale;until=start+total;
    if(!raf)raf=requestAnimationFrame(frame);
    return new Promise(res=>setTimeout(res,burstMs));
  }
  let last=0;
  function frame(now){
    const dt=Math.min(2.4,last?(now-last)/16.7:1)*timeScale;last=now;
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
    const fade=Math.max(0,Math.min(1,(until-now)/(900/timeScale)));
    for(const p of parts){
      // Luftwiderstand + Endgeschwindigkeit: Konfetti flattert langsam herab.
      p.vx*=Math.pow(.965,dt);p.vy=Math.min(2.6+p.w*.08,p.vy*Math.pow(.975,dt)+.2*dt);p.wob+=.12*dt;
      p.x+=(p.vx+Math.sin(p.wob)*.9)*dt;p.y+=p.vy*dt;p.rot+=p.vr*dt;
      ctx.save();ctx.globalAlpha=fade;ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.scale(1,Math.cos(p.wob));ctx.fillStyle=p.c;
      if(p.round){ctx.beginPath();ctx.arc(0,0,p.w*.55,0,6.283);ctx.fill();}else ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);
      ctx.restore();
    }
    if(now<until)raf=requestAnimationFrame(frame);else{last=0;stop();}
  }
  return {burst,stop,get active(){return !!raf;}};
}
