import {THREE,PARAMETERS as P} from '../squish/squish-graphics.js?v=play-sharp-1';

// A small shared mesh is enough for the softened glass image. The actual
// Squish bodies, numerals, and their materials stay in the original renderer.
function reflectionGeometry(){
  const gel=P.gel,geometry=new THREE.SphereGeometry(1,16,10);
  const points=geometry.attributes.position;
  const height=gel.height+gel.dome+gel.footClip,half=gel.width/2;
  const signedPower=(x,n)=>Math.sign(x)*Math.pow(Math.abs(x),n);
  for(let i=0;i<points.count;i++){
    const x=points.getX(i),y=points.getY(i),z=points.getZ(i);
    const radius=Math.hypot(x,z),theta=Math.atan2(z,x);
    const ring=half*Math.pow(radius,gel.ringExponent);
    points.setXYZ(i,ring*signedPower(Math.cos(theta),gel.crossExponent),
      Math.max(0,height*.5*(1+signedPower(y,gel.verticalExponent))-gel.footClip),
      ring*signedPower(Math.sin(theta),gel.crossExponent));
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createGlassReflections(light,{capacity=29}={}){
  const geometry=reflectionGeometry();
  const colors=new THREE.InstancedBufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage);
  const poses=new THREE.InstancedBufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aGelColor',colors);
  geometry.setAttribute('aGelPose',poses);
  const material=new THREE.ShaderMaterial({
    // Reflection flips the winding; draw its near surface only.
    side:THREE.BackSide,transparent:true,depthTest:true,depthWrite:false,toneMapped:false,
    uniforms:{uFloor:{value:P.board.floor},uKey:{value:light.position.clone()},
      uGelHeight:{value:P.gel.height},uSpread:{value:P.motion.spreadFactor}},
    vertexShader:`
      attribute vec3 aGelColor, aGelPose;
      uniform float uGelHeight,uSpread;
      varying vec3 vColor,vWorld,vNormal;
      varying float vHeight;
      void main(){
        float h=max(0.,position.y/uGelHeight);
        float anchor=pow(h,1.7);
        float spread=1.+aGelPose.z*anchor*uSpread;
        vec3 p=vec3(position.x*spread+aGelPose.x*anchor,position.y*(1.-aGelPose.z),
          position.z*spread+aGelPose.y*anchor);
        mat3 m=mat3(instanceMatrix);
        vec3 stretch=vec3(dot(m[0],m[0]),dot(m[1],m[1]),dot(m[2],m[2]));
        vNormal=m*(normal/max(stretch,vec3(.00001)));
        vec4 world=modelMatrix*instanceMatrix*vec4(p,1.);
        vColor=aGelColor;vHeight=h;vWorld=world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world;
      }`,
    fragmentShader:`
      uniform float uFloor;
      uniform vec3 uKey;
      varying vec3 vColor,vWorld,vNormal;
      varying float vHeight;
      void main(){
        if(vWorld.y>uFloor)discard;
        vec3 n=normalize(vNormal);
        vec3 viewDirection=normalize(cameraPosition-vWorld);
        float viewDot=max(0.,dot(n,viewDirection));
        float facing=smoothstep(.035,.38,viewDot);
        float falloff=1.-smoothstep(.15,1.14,vHeight);
        vec3 source=vec3(vWorld.x,2.*uFloor-vWorld.y,vWorld.z);
        vec3 sourceNormal=n*vec3(1.,-1.,1.);
        float lit=max(0.,dot(sourceNormal,normalize(uKey-source)));
        float glint=lit*lit*lit;
        float edge=1.-smoothstep(.12,.55,viewDot);
        float alpha=.56*facing*falloff*(.78+.22*lit);
        vec3 tint=vColor*(1.+.24*edge+.13*lit);
        gl_FragColor=vec4(mix(tint,vec3(1.14,1.01,.83),.19*glint),alpha);
      }`,
  });
  const mesh=new THREE.InstancedMesh(geometry,material,capacity);
  mesh.name='Glass_reflections';mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;mesh.renderOrder=5;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // A single instanced patch batch gives each landed gel its colored light
  // on the glass. It shares the existing reflection palette and culling.
  const spillGeometry=new THREE.PlaneGeometry(2.85,2.85).rotateX(-Math.PI/2);
  spillGeometry.setAttribute('aGelColor',colors);
  const spillMaterial=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,toneMapped:false,
    vertexShader:`
      attribute vec3 aGelColor;
      varying vec2 vSpill;varying vec3 vTint;
      void main(){
        vSpill=(uv*2.-1.)*vec2(1.,-1.);
        vTint=aGelColor;
        gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);
      }`,
    fragmentShader:`
      varying vec2 vSpill;varying vec3 vTint;
      void main(){
        vec2 p=vSpill+vec2(.024,-.024),p2=p*p;
        float r=sqrt(sqrt(dot(p2,p2)));
        float d=(r-.68)/.115;
        float side=smoothstep(.02,.94,dot(p/max(length(p),.001),vec2(-.64,.7684)));
        float opacity=exp(-d*d)*(.035+.16*side);
        gl_FragColor=vec4(vTint*.61,opacity);
      }`,
  });
  const spill=new THREE.InstancedMesh(spillGeometry,spillMaterial,capacity);
  spill.name='Glass_neon_spill';spill.count=0;spill.visible=false;spill.frustumCulled=false;spill.renderOrder=4;
  spill.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const mirror=new THREE.Matrix4().makeScale(1,-1,1).setPosition(0,2*P.board.floor,0);
  const reflected=new THREE.Matrix4(),spillPose=new THREE.Matrix4(),color=new THREE.Color();
  return {mesh,spill,
    update(owners){
      let count=0;
      for(const {group,value,deformation} of owners){
        const progress=group.userData.entryProgress;
        if(!group.visible||(progress!==undefined&&progress<1)||
          group.scale.x<=0||group.scale.y<=0||group.scale.z<=0)continue;
        if(count===capacity)break;
        reflected.multiplyMatrices(mirror,group.matrixWorld);
        mesh.setMatrixAt(count,reflected);
        spillPose.copy(group.spillMatrix||group.matrixWorld);
        spillPose.elements[13]=P.board.floor+.006;
        spill.setMatrixAt(count,spillPose);
        color.set(P.colors[value]||P.colors[(value-1)%8+1]||P.colors[1]);
        colors.setXYZ(count,color.r,color.g,color.b);
        poses.setXYZ(count,deformation?.sway||0,deformation?.swayZ||0,deformation?.squash||0);
        count++;
      }
      mesh.count=spill.count=count;mesh.visible=spill.visible=count>0;
      spill.instanceMatrix.needsUpdate=true;
      mesh.instanceMatrix.needsUpdate=true;colors.needsUpdate=true;poses.needsUpdate=true;
    },
    dispose(){mesh.dispose();geometry.dispose();material.dispose();spill.dispose();spillGeometry.dispose();spillMaterial.dispose();},
  };
}
