// Linear RGB, tuned per gel hue so the refracted bands stay colored instead
// of converging on white in HDR. The blue row is the approved material test.
const PALETTES=[
  [[.001,.46,.76],[.001,.84,.92],[.001,.042,.36],[.76,.49,.86]], // blue
  [[.78,.012,.055],[.97,.047,.14],[.35,.001,.016],[.84,.53,.57]], // red
  [[.055,.67,.006],[.20,.90,.019],[.006,.29,.001],[.52,.80,.58]], // green
  [[.82,.134,.002],[.98,.328,.011],[.40,.031,.001],[.84,.53,.55]], // orange
  [[.39,.016,.78],[.69,.065,.97],[.15,.002,.39],[.62,.53,.86]], // violet
  [[.84,.59,.005],[.98,.84,.033],[.41,.21,.001],[.80,.63,.56]], // yellow
  [[.84,.018,.40],[.98,.064,.65],[.37,.002,.14],[.83,.54,.63]], // pink
  [[.005,.66,.42],[.025,.92,.74],[.001,.31,.12],[.53,.84,.67]], // turquoise
].map(row=>row.map(value=>({value})));

const TRACE='transmitted.rgb+=gelFocusTrace(gelRay,gelFullPath,material.attenuationColor,material.attenuationDistance);';
const EMISSIVE='#include <emissivemap_fragment>';
const RIM='outgoingLight += material.attenuationColor * gelLift;';
const installed=new WeakSet();

// Variant C: retain tight white highlights while filtering the broad neutral
// reflection. The glass composite already expects coverage-weighted color.
function clearGel(source){
  return source
    .replace('#include <common>',`#include <common>
const float uClarity=.91;
vec3 clearGelReflection(vec3 reflection){
  float white=max(0.,min(reflection.r,min(reflection.g,reflection.b)));
  // Preserve high-energy softbox cores; reduce only their broad pale skirts.
  float core=smoothstep(.22,1.55,white);
  return max(vec3(0.),reflection-vec3(white*(1.-core)*uClarity));
}`)
    .replace('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
      'vec3 outgoingLight = totalDiffuse + clearGelReflection(totalSpecular) + totalEmissiveRadiance;')
    .replace('( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;',
      'clearGelReflection(clearcoatSpecularDirect + clearcoatSpecularIndirect) * material.clearcoat;')
    .replace('bands*smoothstep(.06,.30,gelFullPath)', 'bands*(1.+2.0*uClarity*uClarity)*smoothstep(.06,.30,gelFullPath)')
    .replace('#include <opaque_fragment>',`// Preserve saturated energy before the filmic shoulder mixes its channels.
      float neonPeak=max(outgoingLight.r,max(outgoingLight.g,outgoingLight.b));
      float neonWhite=min(outgoingLight.r,min(outgoingLight.g,outgoingLight.b));
      float neonChroma=max(0.,neonPeak-neonWhite);
      float clipEnergy=1.+max(0.,neonChroma-.35)*uClarity*.48;
      float mist=neonWhite*(1.-smoothstep(.20,1.35,neonWhite))*uClarity*.68;
      outgoingLight=vec3(neonWhite-mist)+(outgoingLight-vec3(neonWhite))/clipEnergy
        +uNeonOuter*mist*.69+uNeonDepth*.19*uClarity;
      vec3 neonFoot=gelRest(vGelLocal);
      float lip=(neonFoot.y-(.245+.042*neonFoot.x))/.063;
      float brightLip=exp(-lip*lip)*smoothstep(.62,.86,neonFoot.z);
      outgoingLight+=uNeonOuter*brightLip*uClarity*.64;
      vec3 richFilter=.22+.78*uNeonOuter/max(uNeonOuter.r,max(uNeonOuter.g,uNeonOuter.b));
      float rich=smoothstep(.46,.92,uClarity)*(1.-smoothstep(.27,.93,neonWhite))*.80;
      outgoingLight*=mix(vec3(1.),richFilter,rich);
      #include <opaque_fragment>
      // The glass composite expects RGB multiplied by coverage, while the
      // transmissive body normally writes straight RGB. Match it here.
      #ifndef PREMULTIPLIED_ALPHA
        gl_FragColor.rgb*=gl_FragColor.a;
      #endif`);
}

export function installNeonBands(material,value) {
  if(installed.has(material))return material;
  const [inner,outer,depth,tint]=PALETTES[(value-1)%PALETTES.length];
  const original=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=function(shader,renderer){
    original.call(this,shader,renderer);
    // Keep the original gel usable if a future SDK changes its shader hooks.
    if(![TRACE,EMISSIVE,RIM].every(anchor=>shader.fragmentShader.includes(anchor)))return;
    Object.assign(shader.uniforms,{uNeonInner:inner,uNeonOuter:outer,uNeonDepth:depth,uNeonTint:tint});
    // Rotate the blue prototype's core suppression into each palette. For
    // blue the two derived multipliers reproduce the approved .60/.42/.64
    // emission and .70/.52/.74 surface-rim balance.
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      uniform vec3 uNeonInner,uNeonOuter,uNeonDepth,uNeonTint;
      float neonBand(float offset,float width){float t=offset/width;return exp(-t*t);}
      vec3 neonCore(){
        return vec3(.60,.42,.64)+(uNeonTint-vec3(.76,.49,.86))*.68;
      }`)
      .replace(EMISSIVE,EMISSIVE+'\n      totalEmissiveRadiance *= neonCore();')
      .replace(RIM,'outgoingLight += material.attenuationColor * gelLift * (neonCore()+.10);')
      .replace(TRACE,TRACE+`
      {
        // Follow the original refracted view ray into the deformed gel. The
        // band stays inside the same part of the body while it squashes.
        float bandDepth=min(.235,gelFullPath*.48);
        vec3 lens=gelRest(vGelLocal+gelRay*bandDepth);
        vec2 q=lens.xz,q2=q*q;
        float radius=sqrt(sqrt(dot(q2,q2)));
        vec2 angle=q/max(length(q),.001);
        float left=max(0.,dot(angle,vec2(-.64,.7684)));
        float front=max(0.,angle.y),far=max(0.,dot(angle,vec2(.7,-.714)));
        float bend=.07*(1.-left)+.05*clamp(lens.y,0.,1.);
        float a=radius-(.718+bend),b=radius-(.842+bend*.43);
        // A pixel-footprint floor keeps narrow bands from flickering when
        // the board changes render density or the cushion moves.
        float inner=neonBand(a,max(.023,fwidth(a)*.78));
        float outer=neonBand(b,max(.018,fwidth(b)*.78));
        float shoulder=neonBand(radius-.77,.18);
        float side=smoothstep(.20,.87,left),wall=smoothstep(.67,.83,radius);
        float curve=.07*(1.-left)+.036*q.x;
        float foot=lens.y-(.21+curve),fold=lens.y-(.38+curve*1.16);
        float footRibbon=neonBand(foot,max(.031,fwidth(foot)*.80));
        float foldRibbon=neonBand(fold,max(.044,fwidth(fold)*.80));
        vec3 bands=uNeonInner*inner*(.17+.82*side+.22*front)
                   +uNeonOuter*outer*(.04+.57*side+.20*front)
                   +uNeonDepth*shoulder*(.20+.43*front+.23*far)
                   +wall*(uNeonOuter*footRibbon*(.16+1.23*side+.30*front)
                         +uNeonInner*foldRibbon*(.06+.74*side+.27*front));
        transmitted.rgb=transmitted.rgb*uNeonTint+bands*smoothstep(.06,.30,gelFullPath);
      }
      `);
    shader.fragmentShader=clearGel(shader.fragmentShader);
  };
  // One program for all hues. Colors are material uniforms, not defines.
  material.customProgramCacheKey=()=>key+'-neon-clarity-c-v1';
  material.needsUpdate=true;
  installed.add(material);
  return material;
}
