import {THREE,PARAMETERS as P} from '../squish/squish-graphics.js?v=play-sharp-1';

export function createGlassShadows(light,{capacity=29}={}){
  const geometry=new THREE.PlaneGeometry(1,1);
  const opacity=new THREE.InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aOpacity',opacity);
  const material=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,depthTest:true,toneMapped:false,
    vertexShader:`
      attribute float aOpacity;
      varying vec2 vFoot;
      varying float vOpacity;
      void main(){
        vFoot=2.*uv-1.;vOpacity=aOpacity;
        gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);
      }`,
    fragmentShader:`
      varying vec2 vFoot;
      varying float vOpacity;
      void main(){
        vec2 q=abs(vFoot)-vec2(.48,.45);
        float edge=length(max(q,0.))+min(max(q.x,q.y),0.)-.23;
        float core=1.-smoothstep(-.04,.10,edge);
        float penumbra=1.-smoothstep(-.07,.28,edge);
        gl_FragColor=vec4(0.,0.,0.,vOpacity*(.58*core+.18*penumbra));
      }`,
  });
  const mesh=new THREE.InstancedMesh(geometry,material,capacity);
  mesh.name='Glass_contact_shadows';mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;
  // A shadow darkens the glass and the mirror image right at the contact.
  mesh.renderOrder=6;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),size=new THREE.Vector3();
  const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
  const direction=light.position.clone().divideScalar(Math.max(1,light.position.y));
  return {mesh,
    update(owners){
      let count=0;
      for(const {group,deformation} of owners){
        const entry=group.userData.entryProgress;
        if(!group.visible||(entry!==undefined&&entry<1)||
          group.scale.x<=0||group.scale.y<=0||group.scale.z<=0)continue;
        if(count===capacity)break;
        position.setFromMatrixPosition(group.matrixWorld);
        const height=Math.max(0,position.y-P.board.floor);
        const strength=1-THREE.MathUtils.smoothstep(height,.02,.75);
        if(strength<=0)continue;
        const cast=.23*group.scale.y*(1-(deformation?.squash||0))+height;
        position.set(position.x-direction.x*cast,P.board.floor+.002,position.z-direction.z*cast);
        size.set(P.gel.width*1.22*group.scale.x,P.gel.width*1.20*group.scale.z,1);
        matrix.compose(position,rotation,size);
        mesh.setMatrixAt(count,matrix);opacity.setX(count,strength);count++;
      }
      mesh.count=count;mesh.visible=count>0;
      mesh.instanceMatrix.needsUpdate=true;opacity.needsUpdate=true;
    },
    dispose(){mesh.dispose();geometry.dispose();material.dispose();},
  };
}
