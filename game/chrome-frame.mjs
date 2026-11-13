import {THREE,PARAMETERS as P} from '../squish/squish-graphics.js?v=play-sharp-1';

// Thin chrome ring just outside the 5x5 wells, sitting on the plate top.
const GAP = 0.28;
const WIDTH = 0.12;
const THICKNESS = 0.065;
const BEVEL = 0.012;

function roundedRect(path, half, corner) {
  const r = Math.min(corner, Math.max(0.001, half - 0.001));
  path.moveTo(-half + r, -half);
  path.lineTo(half - r, -half);
  path.quadraticCurveTo(half, -half, half, -half + r);
  path.lineTo(half, half - r);
  path.quadraticCurveTo(half, half, half - r, half);
  path.lineTo(-half + r, half);
  path.quadraticCurveTo(-half, half, -half, half - r);
  path.lineTo(-half, -half + r);
  path.quadraticCurveTo(-half, -half, -half + r, -half);
  path.closePath();
  return path;
}

function frameMeasures() {
  const wellHalf = 2 * P.board.pitch + P.board.cavityHalf;
  const innerHalf = wellHalf + GAP;
  const outerHalf = innerHalf + WIDTH;
  const innerCorner = P.board.cavityRadius + GAP;
  const outerCorner = innerCorner + WIDTH;
  return {wellHalf, innerHalf, outerHalf, innerCorner, outerCorner, y: P.board.top};
}

function createFrameMesh(m) {
  // Shrink the 2D profile by the bevel so the finished ring keeps the intended width.
  const shape = new THREE.Shape();
  roundedRect(shape, m.outerHalf - BEVEL, Math.max(0.04, m.outerCorner - BEVEL));
  const hole = new THREE.Path();
  roundedRect(hole, m.innerHalf + BEVEL, m.innerCorner + BEVEL);
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.016, THICKNESS - 2 * BEVEL),
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 1,
    curveSegments: 10,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  // Bevel also extends downward; lift so the underside rests on the plate top.
  geometry.translate(0, m.y + BEVEL, 0);
  geometry.computeVertexNormals();
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xd4d9df,
    metalness: 1,
    roughness: 0.15,
    clearcoat: 0.6,
    clearcoatRoughness: 0.14,
    envMapIntensity: 1.4,
    specularIntensity: 0.85,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Chrome_frame';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.raycast = () => {};
  return mesh;
}

function createContactShadow(m) {
  const pad = 0.18;
  const half = m.outerHalf + pad;
  const geometry = new THREE.PlaneGeometry(half * 2, half * 2, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, m.y + 0.0015, 0);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uHalf: {value: half},
      uInner: {value: m.innerHalf},
      uOuter: {value: m.outerHalf},
      uCorner: {value: (m.innerCorner + m.outerCorner) * 0.5},
      uOpacity: {value: 0.32},
    },
    vertexShader: `
      varying vec2 vPos;
      void main() {
        vPos = vec2(position.x, position.z);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vPos;
      uniform float uHalf, uInner, uOuter, uCorner, uOpacity;
      float sdRoundBox(vec2 p, float b, float r) {
        vec2 q = abs(p) - vec2(b - r);
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
      }
      void main() {
        float mid = (uInner + uOuter) * 0.5;
        float hw = (uOuter - uInner) * 0.5 + 0.04;
        float d = abs(sdRoundBox(vPos, mid, uCorner)) - hw;
        float alpha = uOpacity * (1.0 - smoothstep(0.0, 0.16, d));
        // Slight extra darkening directly under the bar.
        float under = 1.0 - smoothstep(0.0, 0.05, abs(sdRoundBox(vPos, mid, uCorner)));
        alpha = min(1.0, alpha + 0.1 * under);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Chrome_frame_shadow';
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  mesh.renderOrder = -1;
  return mesh;
}

export function createChromeFrame(graphics) {
  const measures = frameMeasures();
  const frame = createFrameMesh(measures);
  const shadow = createContactShadow(measures);
  const env = graphics?.scene?.environment;
  if (env) {
    frame.material.envMap = env;
    frame.material.needsUpdate = true;
  }
  const group = new THREE.Group();
  group.name = 'Chrome_frame_group';
  group.add(shadow, frame);
  return {
    group,
    measures,
    dispose() {
      group.remove(frame, shadow);
      frame.geometry.dispose();
      frame.material.dispose();
      shadow.geometry.dispose();
      shadow.material.dispose();
    },
  };
}
