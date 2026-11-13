// Pre-rendered VFX flipbooks (Blender/Cycles, see /vfx in the source repo).
// Each atlas is channel-packed: R = luminance tinted with the tile's gel
// colour, G = white-hot cores and specular glints, B = coverage of physical
// gel / chrome bodies. One small WebGL layer draws them as batched quads on
// top of the board; the board renderer gains no passes, targets or textures.
const MAX_SPRITES=320,FLOATS=17,VERTS=6;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export function hexColor(hex){const n=parseInt(String(hex).slice(1),16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];}

const VS=`attribute vec2 p;attribute vec4 uv;attribute float m;attribute vec3 tint;attribute vec4 k;
varying vec4 vUv;varying float vM;varying vec3 vT;varying vec4 vK;uniform vec2 view;
void main(){vUv=uv;vM=m;vT=tint;vK=k;gl_Position=vec4(p.x/view.x*2.-1.,1.-p.y/view.y*2.,0.,1.);}`;
const FS=`precision mediump float;varying vec4 vUv;varying float vM;varying vec3 vT;varying vec4 vK;uniform sampler2D atlas;
void main(){vec3 c=mix(texture2D(atlas,vUv.xy).rgb,texture2D(atlas,vUv.zw).rgb,vM);
vec3 rgb=(vT*c.r*vK.x+vec3(c.g)*vK.y)*vK.w;float cover=c.b*vK.z*vK.w;
gl_FragColor=vec4(rgb,clamp(max(cover,max(rgb.r,max(rgb.g,rgb.b))*.55),0.,1.));}`;

export function createFlipbookLayer(layer,{page=document,base=new URL('./assets/vfx/',import.meta.url),ratioCap=2}={}){
  const canvas=page.createElement('canvas');canvas.className='vfx-canvas';canvas.setAttribute('aria-hidden','true');layer.prepend(canvas);
  const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'default'});
  const sprites=[],atlases=new Map(),data=new Float32Array(MAX_SPRITES*VERTS*FLOATS);
  let timeScale=1,manifest=null,program=null,buffer=null,loc={},width=1,height=1,ratio=1,raf=0,disposed=false,lost=false,clean=true,drawn=0,frameCost=0;
  let clock=null;
  const now=()=>clock?clock():performance.now();
  function compile(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);return s;}
  function init(){
    if(!gl)return;
    program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,VS));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,FS));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){program=null;return;}
    buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data.byteLength,gl.DYNAMIC_DRAW);
    for(const name of ['p','uv','m','tint','k'])loc[name]=gl.getAttribLocation(program,name);
    loc.view=gl.getUniformLocation(program,'view');loc.atlas=gl.getUniformLocation(program,'atlas');
    gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  }
  init();
  function resize(){
    width=Math.max(1,layer.clientWidth);height=Math.max(1,layer.clientHeight);ratio=Math.min(ratioCap,globalThis.devicePixelRatio||1);
    const w=Math.round(width*ratio),h=Math.round(height*ratio);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;clean=false;}
    if(sprites.length)wake();else if(!clean)clear();
  }
  const observer=new ResizeObserver(resize);observer.observe(layer);resize();
  const ready=fetch(new URL('vfx-atlas.json?v=vfx-3',base)).then(r=>r.json()).then(json=>{manifest=json;return json;}).catch(()=>null);
  function upload(entry){
    if(!gl||lost||!entry.image)return;
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,entry.image);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    entry.texture=texture;
    // The GPU copy is all we need; let the decoded bitmap go.
    entry.image=null;
  }
  // Load once, in a fixed order, then keep: no textures are created per event.
  function load(name){
    if(atlases.has(name))return atlases.get(name).promise;
    const entry={name,texture:null,image:null};atlases.set(name,entry);
    entry.promise=ready.then(json=>{
      const meta=json?.[name];if(!meta)return null;entry.meta=meta;
      return decode(entry);
    }).catch(()=>null);
    return entry.promise;
  }
  function decode(entry){
    const image=new Image();image.decoding='async';image.src=new URL(`${entry.meta.file}?v=${entry.meta.v||1}`,base).href;
    return image.decode().then(()=>{entry.image=image;upload(entry);if(sprites.length)wake();return entry;});
  }
  function preload(names){names.reduce((chain,name)=>chain.then(()=>load(name)),Promise.resolve());}
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;for(const a of atlases.values())a.texture=null;});
  canvas.addEventListener('webglcontextrestored',()=>{lost=false;init();for(const a of atlases.values())if(a.meta)decode(a).catch(()=>{});});
  function play(name,o){
    if(!gl||!program||disposed||page.hidden)return null;
    load(name);
    if(sprites.length>=MAX_SPRITES){const i=sprites.findIndex(s=>!s.keep);sprites.splice(i<0?0:i,1);}
    const s={name,start:(o.at??now())+(o.delay||0),fps:o.fps||30,from:o.from||0,to:o.to,loop:o.loop,wrap:o.wrap,life:o.life,x:o.x,y:o.y,w:o.w,h:o.h||o.w,ax:o.ax??.5,ay:o.ay??.5,
      tint:o.tint||[1,1,1],gain:o.gain??1.2,hot:o.hot??1,cover:o.cover??.85,alpha:o.alpha??1,fadeIn:o.fadeIn||0,fadeOut:o.fadeOut||0,rotate:o.rotate||0,spin:o.spin||0,keep:!!o.keep,track:o.track};
    sprites.push(s);wake();return s;
  }
  // Static cells (rendered gel beads, glints, pearls) for moving particles.
  function stamp(name,cell,o){return play(name,{...o,from:cell,to:cell,life:o.life??16,fps:1});}
  function wake(){if(!raf&&!disposed&&!page.hidden)raf=requestAnimationFrame(draw);}
  function clear(){if(!gl)return;gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);clean=true;}
  function write(offset,x,y,u0,v0,u1,v1,m,s,alpha){
    const k=offset;data[k]=x;data[k+1]=y;data[k+2]=u0;data[k+3]=v0;data[k+4]=u1;data[k+5]=v1;data[k+6]=m;
    data[k+7]=s.tint[0];data[k+8]=s.tint[1];data[k+9]=s.tint[2];data[k+10]=s.gain;data[k+11]=s.hot;data[k+12]=s.cover;data[k+13]=alpha;
  }
  function draw(time){
    raf=0;if(disposed)return;if(page.hidden){sprites.length=0;return;}
    const began=now();
    if(clock||typeof time!=='number')time=now();
    const groups=new Map();let alive=0;
    for(let i=sprites.length-1;i>=0;i--){
      const s=sprites[i],entry=atlases.get(s.name),meta=entry?.meta;
      const age=(time-s.start)/1000*timeScale;
      if(age<0){alive++;continue;}
      if(s.track)s.track(s,age);
      const frames=meta?meta.frames:0,last=s.to??(frames-1),span=Math.max(1,last-s.from+1);
      const length=s.life??(span/s.fps);
      if((meta&&age>=length)||(!meta&&age>4)){sprites.splice(i,1);continue;}
      alive++;
      if(!entry?.texture)continue;
      let f=age*s.fps,a,b,m;
      if(s.wrap)f=f%span;
      else if(s.loop){const p=f%(span*2-2||1);f=p<span?p:span*2-2-p;}
      f=Math.min(f,span-1);a=s.from+Math.floor(f);b=s.wrap?s.from+(Math.floor(f)+1)%span:Math.min(s.from+span-1,a+1);m=f-Math.floor(f);
      if(span===1){a=b=s.from;m=0;}
      let alpha=s.alpha;if(s.fadeIn)alpha*=clamp(age/s.fadeIn);if(s.fadeOut)alpha*=clamp((length-age)/s.fadeOut);
      if(alpha<=.002)continue;
      if(!groups.has(entry))groups.set(entry,[]);groups.get(entry).push({s,a,b,m,alpha,age});
    }
    if(!gl||lost||!program){if(alive)wake();return;}
    gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    const stride=FLOATS*4;
    gl.enableVertexAttribArray(loc.p);gl.vertexAttribPointer(loc.p,2,gl.FLOAT,false,stride,0);
    gl.enableVertexAttribArray(loc.uv);gl.vertexAttribPointer(loc.uv,4,gl.FLOAT,false,stride,8);
    gl.enableVertexAttribArray(loc.m);gl.vertexAttribPointer(loc.m,1,gl.FLOAT,false,stride,24);
    gl.enableVertexAttribArray(loc.tint);gl.vertexAttribPointer(loc.tint,3,gl.FLOAT,false,stride,28);
    gl.enableVertexAttribArray(loc.k);gl.vertexAttribPointer(loc.k,4,gl.FLOAT,false,stride,40);
    gl.uniform2f(loc.view,width,height);gl.uniform1i(loc.atlas,0);gl.activeTexture(gl.TEXTURE0);
    drawn=0;
    for(const [entry,list] of groups){
      const {cols,rows,w:cw,h:ch}=entry.meta,iw=1/cols,ih=1/rows,pu=.5/(cols*cw),pv=.5/(rows*ch);
      let n=0;
      for(const {s,a,b,m,alpha,age} of list){
        const angle=s.rotate+s.spin*age,c=Math.cos(angle),sn=Math.sin(angle);
        const corners=[[0,0],[1,0],[0,1],[1,0],[1,1],[0,1]];
        const ua=(a%cols)*iw,va=Math.floor(a/cols)*ih,ub=(b%cols)*iw,vb=Math.floor(b/cols)*ih;
        for(const [cx,cy] of corners){
          const lx=(cx-s.ax)*s.w,ly=(cy-s.ay)*s.h,x=s.x+lx*c-ly*sn,y=s.y+lx*sn+ly*c;
          const du=cx?iw-pu:pu,dv=cy?ih-pv:pv;
          write(n*FLOATS,x,y,ua+du,va+dv,ub+du,vb+dv,m,s,alpha);n++;
        }
      }
      gl.bindTexture(gl.TEXTURE_2D,entry.texture);
      gl.bufferSubData(gl.ARRAY_BUFFER,0,data.subarray(0,n*FLOATS));
      gl.drawArrays(gl.TRIANGLES,0,n);drawn+=n/VERTS;
    }
    clean=false;
    frameCost=frameCost*.85+(now()-began)*.15;
    if(alive)wake();else clear();
  }
  function visibility(){if(page.hidden){sprites.length=0;if(raf)cancelAnimationFrame(raf);raf=0;clear();}}
  page.addEventListener('visibilitychange',visibility);
  return {
    ready,load,preload,play,stamp,
    get size(){return {width,height};},
    // QA only: slow motion for stills.
    set clock(fn){clock=typeof fn==='function'?fn:null;},
    set timeScale(v){timeScale=Math.max(.01,Math.min(1,Number(v)||1));},
    clear(){sprites.length=0;if(raf)cancelAnimationFrame(raf);raf=0;clear();},
    dispose(){disposed=true;observer.disconnect();page.removeEventListener('visibilitychange',visibility);sprites.length=0;if(raf)cancelAnimationFrame(raf);
      if(gl){for(const a of atlases.values())if(a.texture)gl.deleteTexture(a.texture);gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();}
      atlases.clear();canvas.remove();},
    get stats(){return {sprites:sprites.length,drawn,running:!!raf,textures:[...atlases.values()].filter(a=>a.texture).length,ms:Math.round(frameCost*100)/100,supported:!!(gl&&program)};},
  };
}
