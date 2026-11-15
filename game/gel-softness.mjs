// More elastic excursion with the same idle rhythm and planted geometry.
// launch-10: the jelly wobble after motion (slide stop, landing, bumps, merge
// result, ripples) rings ~1.75x longer at the same bouncy frequency; the
// release/swipe springs are a bit less damped. It still decays to rest, so the
// renderer stops again once every stone has settled.
export const SOFT_GEL_MOTION=Object.freeze({
  wobbleSpeed:1.65,minimumPressTime:.075,releaseWobble:.40,
  swipeGain:.80,swipeMaxOffset:.40,swipeReleaseImpulse:2.25,
  swipeStiffness:78,swipeDamping:3.9,releaseStiffness:155,releaseDamping:5.0,
});
export function applyGelSoftness(...parameterSets){
  for(const parameters of parameterSets)Object.assign(parameters.motion,SOFT_GEL_MOTION);
}
export function softWobblePower(power=.25){
  return Math.max(0,Math.min(.85,power*1.25));
}
// The SDK decays a body's wobble amplitude with exp(-dt*2.5*wobbleSpeed).
// Per-body multiplier on top: net rate = SDK rate * character / stretch.
export const WOBBLE_DECAY_STRETCH=1.75;
export function wobbleDecayFactor(dt,wobbleSpeed,character=1,stretch=WOBBLE_DECAY_STRETCH){
  return Math.exp(-dt*2.5*wobbleSpeed*(character/stretch-1));
}
