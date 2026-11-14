// Always-on idle life for resting squishes (launch-7): a slow, irregular
// breath (volume-keeping squash/stretch about the foot), a tiny tilt and an
// occasional soft twitch. Pure draw-time transform of the whole group, so the
// comic outline, digit and reflections follow without any geometry update or
// extra pass. Every stone gets its own frequencies and phases (from its id),
// layered incommensurate sines plus a slow envelope: no two stones and no two
// seconds look alike. Blends out instantly-ish for slides, presses, merges.
const TAU=Math.PI*2;
export const IDLE={squash:.028,tilt:.018,twitch:.016,fadeIn:.9,fadeOut:.10,fps:30};
function hash(seed,salt){const n=Math.sin(seed*12.9898+salt*78.233)*43758.5453;return n-Math.floor(n);}
export function idleSeed(key){return String(key).split('').reduce((v,c)=>(v*31+c.charCodeAt(0))>>>0,11);}
export function idleCharacter(seed){
  const r=salt=>hash(seed,salt);
  return {
    f1:.30+r(1)*.20,f2:.68+r(2)*.42,f3:.045+r(3)*.06,f4:.21+r(4)*.17,f5:.53+r(5)*.31,f6:.17+r(6)*.19,f7:.61+r(7)*.29,
    p:[0,1,2,3,4,5,6,7].map(i=>r(10+i)*TAU),gain:.8+r(20)*.4,twitchEvery:3.5+r(21)*4.5,seed,
  };
}
// Pose at time t for weight w in [0,1]: scale y, scale x/z, tilt about x and z.
export function idlePose(c,t,w=1,out={sy:1,sxz:1,rx:0,rz:0}){
  const env=.62+.38*Math.sin(TAU*c.f3*t+c.p[2]);
  let b=(.62*Math.sin(TAU*c.f1*t+c.p[0])+.38*Math.sin(TAU*c.f2*t+c.p[1]))*env*c.gain;
  // Occasional soft twitch: a damped wiggle at a pseudo-random moment per slot.
  const slot=Math.floor(t/c.twitchEvery),at=slot*c.twitchEvery+hash(c.seed,100+slot)*c.twitchEvery*.6,tau=t-at;
  let j=0;if(tau>0&&tau<1.4&&hash(c.seed,200+slot)>.35)j=Math.exp(-tau*4.2)*Math.sin(tau*17)*(.6+.4*hash(c.seed,300+slot));
  const s=IDLE.squash*b+IDLE.twitch*j;
  out.sy=1+s*w;out.sxz=1-.5*s*w;
  out.rx=w*(IDLE.tilt*(.65*Math.sin(TAU*c.f4*t+c.p[3])+.35*Math.sin(TAU*c.f5*t+c.p[4]))+IDLE.twitch*.5*j);
  out.rz=w*IDLE.tilt*(.65*Math.sin(TAU*c.f6*t+c.p[5])+.35*Math.sin(TAU*c.f7*t+c.p[6]));
  return out;
}
// Smoothly follow the target weight: fade out fast when something takes the
// stone over, fade back in slowly (smoothstep on the way up).
export function stepWeight(state,target,dt){
  const rate=target>state.raw?1/IDLE.fadeIn:1/IDLE.fadeOut;
  state.raw=target>state.raw?Math.min(target,state.raw+rate*dt):Math.max(target,state.raw-rate*dt);
  if(state.raw<1e-6)state.raw=0;if(state.raw>1-1e-6)state.raw=1;
  const x=state.raw;return x*x*(3-2*x);
}
export function createIdleMotion({enabled=true}={}){
  const states=new WeakMap();
  return {
    enabled,
    // busy(s) -> true while another animation owns the stone.
    update(bodies,time,dt,busy){
      for(const s of bodies){
        const group=s.group;let st=states.get(s);
        if(!st){st={raw:0,c:idleCharacter(idleSeed(s.id??group.name)),pose:{sy:1,sxz:1,rx:0,rz:0}};states.set(s,st);}
        const w=stepWeight(st,this.enabled&&!busy(s)?1:0,dt);
        if(w<=0){delete group.userData.idlePose;continue;}
        group.userData.idlePose=idlePose(st.c,time,w,st.pose);
      }
    },
  };
}
// Draw-time application (inside the render's save/restore of transforms).
export function applyIdlePose(group){
  const p=group.userData.idlePose;if(!p)return false;
  group.scale.x*=p.sxz;group.scale.y*=p.sy;group.scale.z*=p.sxz;
  group.rotation.x+=p.rx;group.rotation.z+=p.rz;return true;
}
