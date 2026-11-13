import {THREE,PARAMETERS as P} from '../squish/squish-graphics.js?v=play-sharp-1';
import {GLASS_KEY_POSITION} from './gel-lighting.mjs?v=menu-1';
import {createGlassReflections} from './glass-reflections.mjs?v=menu-1';
import {createGlassShadows} from './glass-shadows.mjs?v=play-sharp-1';
import {applyPressureContacts} from './pressure-contact.mjs?v=soft-gel-1';
import {createChromeFrame} from './chrome-frame.mjs?v=play-sharp-1';

// Fit the original stone mesh, including its front edge, into the board slot.
export function fitStoneBoard(camera,width,height,bounds,slot) {
  const target=new THREE.Vector3(...P.camera.target);
  const reference=new THREE.Vector3(...P.camera.position).sub(target);
  const elevation=Math.atan2(reference.y,Math.hypot(reference.x,reference.z))+THREE.MathUtils.degToRad(13);
  const direction=new THREE.Vector3(0,Math.sin(elevation),Math.cos(elevation));
  const corners=[];
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])corners.push(new THREE.Vector3(x,y,z));
  const point=new THREE.Vector3();
  // A slightly wider lens lets the camera move closer while fitting the outer wells.
  camera.fov=P.camera.fov+4;
  camera.aspect=width/height;
  camera.updateProjectionMatrix();
  function measure(distance) {
    camera.position.copy(target).addScaledVector(direction,distance);
    camera.lookAt(target);camera.updateMatrixWorld();
    let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
    for(const corner of corners){
      point.copy(corner).project(camera);
      left=Math.min(left,point.x);right=Math.max(right,point.x);
      bottom=Math.min(bottom,point.y);top=Math.max(top,point.y);
    }
    return {left,right,bottom,top};
  }
  let lo=12,hi=65;
  for(let i=0;i<24;i++){
    const mid=(lo+hi)/2,b=measure(mid);
    if((b.right-b.left)*width/2>slot.width||(b.top-b.bottom)*height/2>slot.height)lo=mid;else hi=mid;
  }
  const b=measure(hi);
  const dx=2*(slot.left+slot.width/2)/width-1-(b.left+b.right)/2;
  const dy=1-2*(slot.top+slot.height/2)/height-(b.top+b.bottom)/2;
  camera.projectionMatrix.elements[8]-=dx;
  camera.projectionMatrix.elements[9]-=dy;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

export function installCleanScreen(graphics,host) {
  const {renderer,scene,camera,board}=graphics;
  // The sizing anchor is a sibling of the canvas host inside the playfield.
  const slot=host.parentElement?.querySelector(':scope > .board-slot');
  if(!slot)throw new Error('Missing board layout anchor in playfield');
  scene.getObjectByName('Water_surface').visible=false;
  scene.background=null;renderer.setClearColor(0,0);
  const key=graphics.lighting.key;
  key.position.fromArray(GLASS_KEY_POSITION);
  Object.assign(key.shadow.camera,{left:-15,right:15,top:15,bottom:-15});
  key.shadow.camera.updateProjectionMatrix();
  // The invisible stone mesh keeps the grid centered and fitted at the new angle.
  const bounds=new THREE.Box3().setFromObject(board);
  const boardWasVisible=board.visible;
  board.visible=false;
  const chromeFrame=createChromeFrame(graphics);
  scene.add(chromeFrame.group);
  const inflatedHeight=1.12,boardFootprint=1.02,boardHeight=inflatedHeight*boardFootprint/.92;
  const hudOwners=new Set(),glassOwners=[];
  const reflection=createGlassReflections(key),shadows=createGlassShadows(key);
  scene.add(reflection.spill,reflection.mesh,shadows.mesh);
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const floor=new THREE.Plane(new THREE.Vector3(0,1,0),-P.board.floor);
  const point=new THREE.Vector3(),wells=Array.from({length:5},()=>Array.from({length:5},()=>[0,0]));
  const transformPosition=position=>position;
  let projectionRevision=0;
  function projectPoint(position){
    point.copy(position).project(camera);return [(point.x+1)/2,(1-point.y)/2];
  }
  function screenToWorld(x,y,lift=0){
    pointer.set(x*2-1,1-y*2);ray.setFromCamera(pointer,camera);
    const plane=lift?new THREE.Plane(floor.normal,floor.constant-lift):floor;
    return ray.ray.intersectPlane(plane,new THREE.Vector3());
  }
  function calibrate(){
    const width=host.clientWidth,height=host.clientHeight;
    if(!width||!height)return;
    fitStoneBoard(camera,width,height,bounds,{left:slot.offsetLeft,top:slot.offsetTop,width:slot.offsetWidth,height:slot.offsetHeight});
    projectionRevision++;
    for(let row=0;row<5;row++)for(let col=0;col<5;col++)
      wells[row][col]=projectPoint(new THREE.Vector3((col-2)*P.board.pitch,P.board.floor,(row-2)*P.board.pitch));
  }
  // Reuse the board snapshot across positioning, contacts and glass effects.
  const pressureOwners=new Map(),entering=new Map(),boardScale=new THREE.Vector3(boardFootprint,boardHeight,boardFootprint);
  function withBoardPositions(callback) {
    const tiles=graphics.tiles,saved=[],effectVisibility=[];
    pressureOwners.clear();entering.clear();
    for(const tile of tiles) {
      const {group}=tile,p=group.userData.entryProgress;
      if(group.userData.pressureWave||p!==undefined){
        const key=`${group.position.x}:${group.position.z}`;
        if(group.userData.pressureWave)pressureOwners.set(key,tile);
        if(p!==undefined)entering.set(key,p);
      }
      saved.push([group,group.position.clone(),group.scale.clone()]);
      if(p!==undefined&&p<1){
        const [x,y]=projectPoint(group.position),remaining=1-p*p;
        // Move straight down its screen column while also lowering the real
        // mesh above the receiver. Draw-only transforms never move game cells.
        group.position.copy(screenToWorld(x,y-(y+.22)*remaining,5*remaining));
      }
      group.scale.multiply(boardScale);
    }
    applyPressureContacts(tiles,transformPosition,P,projectionRevision);
    for(const object of scene.children)if(object.isGroup&&object.name.startsWith('HUD_')) {
      saved.push([object,object.position.clone(),object.scale.clone()]);
      const p=object.userData.entryProgress;
      if(p!==undefined&&p<1){
        const [x,y]=projectPoint(object.position),remaining=1-p*p;
        object.position.copy(screenToWorld(x,y-(y+.22)*remaining,5*remaining));
      }
      if(object.userData.burstScale)object.scale.multiply(new THREE.Vector3(...object.userData.burstScale));
      object.scale.y*=inflatedHeight;
    }
    for(const object of scene.children){
      if(object.name==='Contact_shadow'||object.name==='Refracted_key_light'){
        effectVisibility.push([object,object.visible]);object.visible=false;
        continue;
      }
      if(object.name!=='Refracted_key_light')continue;
      saved.push([object,object.position.clone(),object.scale.clone()]);
      const owner=pressureOwners.get(`${object.position.x}:${object.position.z}`);
      const p=entering.get(`${object.position.x}:${object.position.z}`);
      if(p!==undefined&&p<1){effectVisibility.push([object,object.visible]);object.visible=false;}
      object.scale.setScalar(boardFootprint);
      if(owner){
        object.position.x=owner.group.position.x;object.position.z=owner.group.position.z;
        object.scale.set(owner.group.scale.x,owner.group.scale.z,1);
      }
    }
    try{scene.updateMatrixWorld(true);return callback(tiles);}
    finally{for(const [object,position,scale] of saved){object.position.copy(position);object.scale.copy(scale);}for(const [object,visible] of effectVisibility)object.visible=visible;}
  }
  const originalBloom=graphics.bloom.render;
  const previousSkipComposite=graphics.bloom.skipComposite;
  graphics.bloom.skipComposite=true;
  // One transparent output pass replaces the photographic masks and effects
  // compositing. The SDK still renders its original HDR lighting and bloom.
  const screenScene=new THREE.Scene(),screenCamera=new THREE.Camera();
  const material=new THREE.ShaderMaterial({
    depthTest:false,depthWrite:false,toneMapped:true,
    defines:graphics.bloom.targets.base.samples>0?{}:{SILHOUETTE_AA:1},
    uniforms:{
      uBase:{value:graphics.bloom.targets.base.texture},uGlow:{value:graphics.bloom.targets.glow.texture},
      uStrength:{value:graphics.bloom.strength},uTexelSize:{value:new THREE.Vector2()},
    },
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`
      varying vec2 vUv;uniform sampler2D uBase,uGlow;uniform float uStrength;
      #ifdef SILHOUETTE_AA
        uniform vec2 uTexelSize;
        vec4 antialiasSilhouette(vec4 center){
          vec2 offset=uTexelSize*.65;
          // Two bilinear probes cover all four neighbors without a 2x2
          // derivative seam. Sample the other diagonal only on a contour.
          vec4 a=texture2D(uBase,vUv+offset);
          vec4 b=texture2D(uBase,vUv-offset);
          float edge=max(abs(a.a-center.a),abs(b.a-center.a));
          if(edge<.06)return center;
          vec2 opposite=vec2(offset.x,-offset.y);
          vec4 c=texture2D(uBase,vUv+opposite);
          vec4 d=texture2D(uBase,vUv-opposite);
          // Average coverage and premultiplied color together. Opaque
          // numbers and highlights never enter this silhouette-only filter.
          return mix(center,(a+b+c+d)*.25,.72*smoothstep(.06,.20,edge));
        }
      #endif
      void main(){
        vec4 base=texture2D(uBase,vUv);
        #ifdef SILHOUETTE_AA
          base=antialiasSilhouette(base);
        #endif
        vec3 glow=texture2D(uGlow,vUv).rgb*uStrength;
        float alpha=max(base.a,clamp(max(glow.r,max(glow.g,glow.b)),0.,1.));
        gl_FragColor=vec4((base.rgb+glow)/max(alpha,.0001),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb*=alpha;
      }`,
  });
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);quad.frustumCulled=false;screenScene.add(quad);
  graphics.bloom.render=()=>withBoardPositions(tiles=>{
    glassOwners.length=0;
    for(const tile of tiles)glassOwners.push(tile);
    for(const tile of hudOwners)glassOwners.push(tile);
    reflection.update(glassOwners);
    shadows.update(glassOwners);
    try{originalBloom.call(graphics.bloom);}finally{reflection.spill.visible=reflection.mesh.visible=shadows.mesh.visible=false;}
    material.uniforms.uStrength.value=graphics.bloom.strength;
    const {width=1,height=1}=graphics.bloom.targets.base;
    material.uniforms.uTexelSize.value.set(1/width,1/height);
    renderer.setRenderTarget(null);renderer.render(screenScene,screenCamera);
  });
  const resize=new ResizeObserver(calibrate);resize.observe(host);resize.observe(slot);calibrate();
  return {ready:Promise.resolve(),update(){},wells,withBoardPositions,
    addHudShadow(tile){hudOwners.add(tile);},
    removeHudShadow(tile){hudOwners.delete(tile);},
    dispose(){
      resize.disconnect();graphics.bloom.render=originalBloom;graphics.bloom.skipComposite=previousSkipComposite;
      board.visible=boardWasVisible;
      scene.remove(chromeFrame.group);chromeFrame.dispose();
      scene.remove(reflection.spill,reflection.mesh,shadows.mesh);reflection.dispose();shadows.dispose();
      quad.geometry.dispose();material.dispose();
      hudOwners.clear();glassOwners.length=0;
    }
  };
}
