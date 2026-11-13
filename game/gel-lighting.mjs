import {THREE,PARAMETERS as P} from '../squish/squish-graphics.js?v=play-sharp-1';

// Optical controls only: the accepted silhouette, foot, dimple, bubbles,
// number geometry, camera and deformation parameters are never changed here.
export const GEL_LIGHTING=Object.freeze({
  attenuationDistance:.82,transmissionGain:1.08,focusStrength:3.95,
  rimGlow:1.32,footGlow:.66,topGlow:.27,
});
export function applyGelLighting(...parameterSets){
  for(const parameters of parameterSets)Object.assign(parameters.gel,GEL_LIGHTING);
}

// The studio environment and both gel shaders read this direction as well
// as the scene's physical key, so all three agree on the upper-right source.
export const GLASS_KEY_POSITION=Object.freeze([12,16,-10]);
export function applyGlassKeyLighting(...parameterSets){
  for(const parameters of parameterSets){
    parameters.lighting.keyPosition.splice(0,3,...GLASS_KEY_POSITION);
    parameters.lighting.keyIntensity=4.1;
    parameters.lighting.coolIntensity=.075;
    parameters.gel.directSpecularWeight=.30;
  }
}

const NEON_COLORS=Object.freeze({
  1:'#00c9ff',2:'#ff2455',3:'#39ff29',4:'#ff7816',
  5:'#a440ff',6:'#fff13b',7:'#ff42ca',8:'#11ffe0',
});

export function applyNeonGlassLighting(...parameterSets){
  applyGelLighting(...parameterSets);
  applyGlassKeyLighting(...parameterSets);
  for(const parameters of parameterSets){
    Object.assign(parameters.colors,NEON_COLORS);
    // Keep the dense neon gel. The localized interior caustics were reading
    // as white balls; the shared material glow below replaces them.
    Object.assign(parameters.gel,{
      attenuationDistance:.89,transmissionGain:1.12,focusStrength:0,
      rimGlow:2.42,footGlow:1.36,topGlow:.55,
      // Sharpen and brighten the reflected softboxes while keeping the
      // ambient sheen steady and the interior gel settings intact.
      clearcoatRoughness:.011,reflectionFilterWidth:.065,
      reflectionAmbient:.35,envMapIntensity:2.76,
    });
    Object.assign(parameters.bloom,{threshold:1.13,strength:.53,blurRadius:1.10});
  }
}

// A low, even emission in the dye color maintains the neon body without
// putting a bright point source inside the gel.
export function applyDiffuseGelGlow(material){
  material.emissive.copy(material.attenuationColor);
  material.emissiveIntensity=.23;
  return material;
}

// A single instanced batch supplies the soft, colored bounce around every
// landed gel. Existing refracted caustics and contact shadows stay intact.
export function createGroundLight({capacity=33,worldBoard=false}={}){
  const colors=new THREE.InstancedBufferAttribute(new Float32Array(capacity*3),3);
  colors.setUsage(THREE.DynamicDrawUsage);
  const geometry=new THREE.PlaneGeometry(1,1);geometry.setAttribute('aSpillColor',colors);
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:worldBoard,toneMapped:false,
    blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,
    blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,
    uniforms:{uPlateMask:{value:null},uStoneTop:{value:1},uStrength:{value:.32}},
    vertexShader:`
      attribute vec3 aSpillColor;
      varying vec2 vUv;varying vec3 vSpillColor;varying vec4 vPhotoClip;
      void main(){
        vUv=uv;vSpillColor=aSpillColor;
        gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);
        vPhotoClip=gl_Position;
      }`,
    fragmentShader:`
      uniform sampler2D uPlateMask;uniform float uStrength,uStoneTop;
      varying vec2 vUv;varying vec3 vSpillColor;varying vec4 vPhotoClip;
      void main(){
        vec2 photoUv=vPhotoClip.xy/vPhotoClip.w*.5+.5;
        float stone=${worldBoard?"1.":"texture2D(uPlateMask,photoUv).r*(1.-step(uStoneTop,photoUv.y))"};
        vec2 p=vUv*2.-1.+vec2(.045,.055);
        vec2 p2=p*p;
        float r=sqrt(sqrt(dot(p2,p2)));
        float offset=(r-.60)/.24;
        float softness=exp(-1.8*offset*offset)*(1.-smoothstep(.76,.98,r));
        vec2 direction=p/max(length(p),.0001);
        float bounce=.72+.28*max(0.,dot(direction,vec2(-.707107)));
        gl_FragColor=vec4(vSpillColor*uStrength*softness*bounce*stone,0.);
      }`,
  });
  const mesh=new THREE.InstancedMesh(geometry,material,capacity);
  mesh.name='Gel_ground_light';mesh.visible=false;mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=5;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3();
  const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
  const color=new THREE.Color();
  return {mesh,
    setMask(texture,stoneTop){material.uniforms.uPlateMask.value=texture;material.uniforms.uStoneTop.value=stoneTop;},
    update(owners){
      let count=0;
      for(const tile of owners){
        const group=tile.group,p=group.userData.entryProgress;
        if(!group.visible||(p!==undefined&&p<1)||group.scale.x<=0||group.scale.z<=0)continue;
        if(count===capacity)break;
        position.set(group.position.x,P.board.floor+.012,group.position.z);
        const ground=group.groundScale||group.scale;scale.set(2.7*ground.x,2.7*ground.z,1);
        matrix.compose(position,rotation,scale);mesh.setMatrixAt(count,matrix);
        color.set(P.colors[tile.value]||P.colors[(tile.value-1)%8+1]||P.colors[1]);
        colors.setXYZ(count,color.r,color.g,color.b);count++;
      }
      mesh.count=count;mesh.instanceMatrix.needsUpdate=true;colors.needsUpdate=true;mesh.visible=false;
    },
    dispose(){mesh.dispose();geometry.dispose();material.dispose();},
  };
}
