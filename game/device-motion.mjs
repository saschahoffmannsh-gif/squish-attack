const vector = (value, axes) => value && axes.some(axis => Number.isFinite(value[axis]))
  ? axes.map(axis => Number.isFinite(value[axis]) ? value[axis] : 0) : null;

// Remove constant gravity and tiny sensor noise; feed bounded kicks to the
// existing gel simulation rather than moving the board or tile roots.
export function createMotionFilter() {
  let gravity = null, previous = null, lastKick = -Infinity;
  return {
    reset() { gravity = null; previous = null; lastKick = -Infinity; },
    sample(event, now) {
      const dt = previous === null ? 1 / 60 : Math.min(.1, Math.max(0, (now - previous) / 1000));
      previous = now;
      let acceleration = vector(event.acceleration, ['x', 'y', 'z']);
      if (!acceleration) {
        const total = vector(event.accelerationIncludingGravity, ['x', 'y', 'z']);
        if (total) {
          if (!gravity) gravity = [...total];
          const blend = 1 - Math.exp(-dt / .3);
          gravity = gravity.map((value, i) => value + (total[i] - value) * blend);
          acceleration = total.map((value, i) => value - gravity[i]);
        }
      }
      const rotation = vector(event.rotationRate, ['alpha', 'beta', 'gamma']);
      const energy = Math.max(
        Math.max(0, Math.hypot(...(acceleration || [0, 0, 0])) - .55) / 5,
        Math.max(0, Math.hypot(...(rotation || [0, 0, 0])) - 12) / 160,
      );
      if (energy < .025 || now - lastKick < 240) return 0;
      lastKick = now;
      return Math.min(.18, .025 + energy * .13);
    },
  };
}

export function installDeviceMotion({button, status, onImpulse, clearImpulses, canReact, reducedMotion}) {
  const supported = window.isSecureContext && typeof window.DeviceMotionEvent !== 'undefined';
  const filter = createMotionFilter();
  let enabled = false, pending = false, disposed = false;
  const preferenceKey = 'squish-phone-motion-v1';
  let wanted = false;
  try { wanted = localStorage.getItem(preferenceKey) === 'on'; } catch {}
  function remember(value) {
    wanted = value;
    try { localStorage.setItem(preferenceKey, value ? 'on' : 'off'); } catch {}
  }
  const render = message => {
    button.disabled = !supported || pending;
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-checked', String(enabled || wanted));
    const indicator = button.querySelector('[data-toggle-state]');
    if (indicator) indicator.textContent = pending ? '…' : enabled || wanted ? 'An' : 'Aus';
    else button.textContent = pending ? 'Freigabe wird angefragt …' : enabled ? 'Handy-Wackeln ausschalten' : 'Handy-Wackeln aktivieren';
    status.textContent = message || (!supported ? 'Bewegungssensoren sind hier nicht verfügbar.'
      : enabled ? reducedMotion.matches ? 'Pausiert: reduzierte Bewegung ist eingeschaltet.' : 'Aktiv – bewege dein Handy leicht.'
      : wanted ? 'Wird beim Spielstart erneut aktiviert. Du kannst die Freigabe auch hier antippen.'
      : 'Einschalten, damit die Squishes auf leichte Handybewegungen reagieren.');
  };
  function reset() { filter.reset(); clearImpulses(); }
  function motion(event) {
    if (!enabled || !canReact() || document.hidden || reducedMotion.matches) { reset(); return; }
    const power = filter.sample(event, performance.now());
    if (power) onImpulse(power);
  }
  function disable() {
    enabled = false;
    window.removeEventListener('devicemotion', motion);
    reset();
  }
  async function toggle(restore = false) {
    if (!supported || pending || disposed) return;
    if (enabled || (wanted && restore !== true)) { disable(); remember(false); render(); return; }
    pending = true;
    let failure = null;
    try {
      // iOS requires this call directly in the button's user gesture.
      const permission = typeof window.DeviceMotionEvent.requestPermission === 'function'
        ? window.DeviceMotionEvent.requestPermission() : Promise.resolve('granted');
      render();
      if (await permission !== 'granted') {
        remember(false);
        failure = 'Keine Freigabe erhalten. Zum erneuten Versuch tippe auf Aktivieren.';
      } else if (!disposed) {
        enabled = true; reset();
        remember(true);
        window.addEventListener('devicemotion', motion, {passive: true});
      }
    } catch {
      remember(false);
      failure = 'Bewegungssensoren konnten nicht aktiviert werden. Versuche es erneut.';
    } finally {
      pending = false;
      button.disabled = !supported;
    }
    if (!disposed) render(failure);
  }
  function preferenceChange() { reset(); render(); }
  button.addEventListener('click', toggle);
  document.addEventListener('visibilitychange', reset);
  reducedMotion.addEventListener('change', preferenceChange);
  render();
  // Non-iOS browsers can restore the opted-in setting without a prompt. iOS
  // permission requests remain inside an explicit Settings or Play gesture.
  if (wanted && supported && typeof window.DeviceMotionEvent.requestPermission !== 'function') void toggle(true);
  return {reset, restoreFromGesture() { if (wanted && !enabled) void toggle(true); }, get enabled() { return enabled; }, dispose() {
    disposed = true; disable();
    button.removeEventListener('click', toggle);
    document.removeEventListener('visibilitychange', reset);
    reducedMotion.removeEventListener('change', preferenceChange);
  }};
}
