// More elastic excursion with the same idle rhythm and planted geometry.
export const SOFT_GEL_MOTION=Object.freeze({
  wobbleSpeed:1.65,minimumPressTime:.075,releaseWobble:.40,
  swipeGain:.80,swipeMaxOffset:.40,swipeReleaseImpulse:2.25,
  swipeStiffness:78,swipeDamping:5.3,releaseStiffness:155,releaseDamping:7.0,
});
export function applyGelSoftness(...parameterSets){
  for(const parameters of parameterSets)Object.assign(parameters.motion,SOFT_GEL_MOTION);
}
export function softWobblePower(power=.25){
  return Math.max(0,Math.min(.85,power*1.25));
}
