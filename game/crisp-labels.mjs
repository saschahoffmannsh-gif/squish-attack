import {THREE} from '../squish/squish-graphics.js?v=play-sharp-1';
import {getLabelShapes,pillowTopHeight} from './original-gel-models.js?v=menu-1';

// Keep the accepted typeface and curved placement, but not the 10k–84k
// extruded vertices per digit. Coverage carries the subpixel glyph edges;
// a small indexed surface follows the exact same anchored body deformation.
export function createCrispLabelFactory({canvasFactory=()=>document.createElement('canvas'),anisotropy=8}={}) {
  const textures=new Map();
  function coverage(value) {
    let entry=textures.get(String(value));if(entry)return entry;
    const shapes=getLabelShapes(value),contours=shapes.map(shape=>({outline:shape.getPoints(24),holes:shape.holes.map(h=>h.getPoints(24))}));
    const points=contours.flatMap(s=>s.outline);
    const padding=.035,minX=Math.min(...points.map(p=>p.x))-padding,maxX=Math.max(...points.map(p=>p.x))+padding;
    const minY=Math.min(...points.map(p=>p.y))-padding,maxY=Math.max(...points.map(p=>p.y))+padding;
    const width=maxX-minX,height=maxY-minY,canvas=canvasFactory();
    // 512-tall coverage is enough for a 2–2.5x backing store on a large well.
    const scale=512/height;canvas.height=512;canvas.width=Math.ceil(width*scale);
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Ziffern konnten nicht vorbereitet werden.');
    ctx.imageSmoothingEnabled=true;if('imageSmoothingQuality' in ctx)ctx.imageSmoothingQuality='high';
    ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.setTransform(canvas.width/width,0,0,-512/height,-minX*canvas.width/width,maxY*512/height);
    ctx.fillStyle='#fff';ctx.beginPath();
    for(const contour of contours)for(const path of [contour.outline,...contour.holes]) {
      ctx.moveTo(path[0].x,path[0].y);for(let i=1;i<path.length;i++)ctx.lineTo(path[i].x,path[i].y);ctx.closePath();
    }
    ctx.fill('evenodd');
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.NoColorSpace;
    texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
    texture.generateMipmaps=true;texture.anisotropy=Math.max(8,anisotropy);
    entry={texture,width,height,minX,maxX,minY,maxY,refs:0};textures.set(String(value),entry);return entry;
  }
  return function createCrispLabel(value) {
    const entry=coverage(value),{texture,width,height,minX,maxX,minY}=entry;
    entry.refs++;
    const geometry=new THREE.PlaneGeometry(width,height,Math.ceil(width/.065),Math.ceil(height/.065));
    const position=geometry.attributes.position;
    for(let i=0;i<position.count;i++) {
      const x=position.getX(i),z=.54-(position.getY(i)+height/2+minY);
      position.setXYZ(i,x,pillowTopHeight(x,z)+.018,z);
    }
    geometry.computeVertexNormals();geometry.computeBoundingSphere();
    const material=new THREE.MeshBasicMaterial({color:0xfff7df,alphaMap:texture,transparent:true,depthWrite:false,
      polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    let disposed=false;
    material.addEventListener('dispose',()=>{
      if(disposed)return;disposed=true;entry.refs--;
      if(entry.refs===0){texture.dispose();textures.delete(String(value));}
    });
    const mesh=new THREE.Mesh(geometry,material);mesh.name='Editable_number';mesh.castShadow=false;
    mesh.userData.rest=position.array.slice();mesh.userData.labelCoverage=true;
    return mesh;
  };
}
