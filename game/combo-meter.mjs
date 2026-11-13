import {getLabelShapes} from './original-gel-models.js?v=menu-1';

// Combo meter: vector glyphs taken from the squish numerals' own typeface
// (the same outlines the 3D labels use), staged with the rendered gel VFX.
const NS='http://www.w3.org/2000/svg';
const TIERS=['#00b5ff','#00dc45','#ff850c','#f44ebd','#9239ff','#ffce70'];
const cache=new Map();
function glyphs(text) {
  let entry=cache.get(text);if(entry)return entry;
  let d='',minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const shape of getLabelShapes(text))for(const path of [shape.getPoints(10),...shape.holes.map(h=>h.getPoints(10))]){
    path.forEach((p,i)=>{d+=`${i?'L':'M'}${p.x.toFixed(4)} ${(-p.y).toFixed(4)}`;minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,-p.y);maxY=Math.max(maxY,-p.y);});
    d+='Z';
  }
  entry={d,minX,maxX,minY,maxY};cache.set(text,entry);return entry;
}
const mix=(hex,t,to=255)=>'#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*(1-t)+to*t).toString(16).padStart(2,'0')).join('');
export const comboTint=n=>TIERS[Math.min(TIERS.length-1,Math.max(0,n-2))];

export function createComboMeter(element,{page=document,reduceMotion}={}) {
  if(!element)return {show(){},end(){},clear(){}};
  const svg=page.createElementNS(NS,'svg');svg.setAttribute('class','combo-svg');svg.setAttribute('aria-hidden','true');
  svg.innerHTML=`<defs><linearGradient id="combo-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0"/><stop offset=".55"/><stop offset="1"/></linearGradient></defs>
    <g class="combo-depth" transform="translate(0 .05)"><path/><path/></g><g class="combo-face"><path/><path/></g><g class="combo-shine"><path/><path/></g>`;
  element.append(svg);
  const stops=[...svg.querySelectorAll('stop')],groups=['.combo-depth','.combo-face','.combo-shine'].map(s=>[...svg.querySelector(s).children]);
  let shown=0,animation=null;
  function layout(n) {
    const word=glyphs('COMBO'),count=glyphs(`x${n}`),ws=.56,gap=.16;
    const wordW=(word.maxX-word.minX)*ws,countW=count.maxX-count.minX,width=wordW+gap+countW;
    // Baselines align; the count stands taller than the word.
    const wordT=`translate(${(-word.minX*ws).toFixed(4)} 0) scale(${ws})`,countT=`translate(${(wordW+gap-count.minX).toFixed(4)} 0)`;
    for(const [a,b] of groups){a.setAttribute('d',word.d);a.setAttribute('transform',wordT);b.setAttribute('d',count.d);b.setAttribute('transform',countT);}
    const top=Math.min(word.minY*ws,count.minY)-.09,bottom=Math.max(word.maxY*ws,count.maxY)+.12;
    svg.setAttribute('viewBox',`-0.08 ${top.toFixed(3)} ${(width+.16).toFixed(3)} ${(bottom-top).toFixed(3)}`);
    const tint=comboTint(n);
    stops[0].setAttribute('stop-color',mix(tint,.62));stops[1].setAttribute('stop-color',mix(tint,.08));stops[2].setAttribute('stop-color',mix(tint,.35,0));
    element.style.setProperty('--combo-tint',tint);element.style.setProperty('--combo-deep',mix(tint,.62,0));
    element.style.setProperty('--combo-scale',String(1+Math.min(.2,(n-2)*.04)));
    element.dataset.tier=String(Math.min(7,n));
  }
  return {
    show(n) {
      if(n<2)return;
      layout(n);shown=n;element.hidden=false;element.classList.remove('is-ending');
      animation?.cancel();
      if(reduceMotion?.matches)return;
      const energy=Math.min(1,(n-2)/5);
      animation=element.animate([
        {transform:`translate(-50%,-50%) scale(calc(var(--combo-scale) * ${1.55+energy*.35})) rotate(${-6-energy*4}deg)`,opacity:.2},
        {transform:'translate(-50%,-50%) scale(calc(var(--combo-scale) * .9)) rotate(2deg)',opacity:1,offset:.32},
        {transform:'translate(-50%,-50%) scale(calc(var(--combo-scale) * 1.06)) rotate(-1deg)',offset:.58},
        {transform:'translate(-50%,-50%) scale(var(--combo-scale)) rotate(0deg)',opacity:1}],
        {duration:520+energy*120,easing:'cubic-bezier(.2,.9,.25,1)'});
      animation.finished.catch(()=>{});
    },
    // The combo ends: it sinks, softens and fades instead of blinking out.
    end() {
      if(!shown)return 0;const was=shown;shown=0;animation?.cancel();
      if(reduceMotion?.matches){element.hidden=true;return was;}
      element.classList.add('is-ending');
      animation=element.animate([
        {transform:'translate(-50%,-50%) scale(var(--combo-scale))',opacity:1,filter:'blur(0px)'},
        {transform:'translate(-50%,-44%) scale(calc(var(--combo-scale) * 1.08))',opacity:.9,offset:.25},
        {transform:'translate(-50%,-20%) scale(calc(var(--combo-scale) * .62))',opacity:0,filter:'blur(3px)'}],
        {duration:720,easing:'cubic-bezier(.4,0,.6,1)',fill:'forwards'});
      animation.finished.then(()=>{if(!shown){element.hidden=true;element.classList.remove('is-ending');}},()=>{});
      return was;
    },
    clear(){shown=0;animation?.cancel();animation=null;element.hidden=true;element.classList.remove('is-ending');},
    get value(){return shown;},
  };
}
