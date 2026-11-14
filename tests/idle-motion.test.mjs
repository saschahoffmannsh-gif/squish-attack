import test from 'node:test';
import assert from 'node:assert/strict';
import {IDLE,idleCharacter,idleSeed,idlePose,stepWeight,createIdleMotion,applyIdlePose} from '../game/idle-motion.mjs';

test('Idle-Pose bleibt klein (lesbar) und volumenerhaltend', () => {
  for (const key of [1, 2, 17, 'HUD_queue-0']) {
    const c = idleCharacter(idleSeed(key));
    for (let t = 0; t < 120; t += .037) {
      const p = idlePose(c, t);
      assert.ok(Math.abs(p.sy - 1) < .06, `sy ${p.sy}`);
      assert.ok(Math.abs(p.sy * p.sxz * p.sxz - 1) < .004);
      assert.ok(Math.abs(p.rx) < .04 && Math.abs(p.rz) < .04);
    }
  }
});

test('Steine sind desynchronisiert und die Bewegung ist keine einfache Schleife', () => {
  const a = idleCharacter(idleSeed(3)), b = idleCharacter(idleSeed(4));
  let diff = 0, n = 0;
  for (let t = 0; t < 30; t += .05, n++) diff += Math.abs(idlePose(a, t).sy - idlePose(b, t).sy);
  assert.ok(diff / n > .004, 'zwei Steine bewegen sich verschieden');
  // No short period: the pose 2 s / 3 s / 5 s later differs noticeably on average.
  for (const shift of [2, 3, 5, 8]) {
    let d = 0, k = 0;
    for (let t = 0; t < 40; t += .05, k++) d += Math.abs(idlePose(a, t).sy - idlePose(a, t + shift).sy);
    assert.ok(d / k > .003, `Periode ${shift}s`);
  }
});

test('Gewicht blendet weich ein, schnell aus; busy setzt die Pose zurück', () => {
  const st = { raw: 0 };
  let w = 0; for (let i = 0; i < 10; i++) w = stepWeight(st, 1, 1 / 60);
  assert.ok(w > 0 && w < .1, 'sanfter Einstieg');
  for (let i = 0; i < 120; i++) w = stepWeight(st, 1, 1 / 60);
  assert.equal(w, 1);
  for (let i = 0; i < 6; i++) w = stepWeight(st, 0, 1 / 60);
  assert.equal(w, 0, `nach ${IDLE.fadeOut}s aus`);
  const s = { id: 5, group: { name: 'x', userData: {} } }, idle = createIdleMotion();
  let busy = false;
  for (let i = 0; i < 90; i++) idle.update([s], i / 60, 1 / 60, () => busy);
  assert.ok(s.group.userData.idlePose);
  busy = true; for (let i = 0; i < 10; i++) idle.update([s], 2 + i / 60, 1 / 60, () => busy);
  assert.equal(s.group.userData.idlePose, undefined);
  const disabled = createIdleMotion({ enabled: false }), d = { id: 6, group: { name: 'y', userData: {} } };
  for (let i = 0; i < 90; i++) disabled.update([d], i / 60, 1 / 60, () => false);
  assert.equal(d.group.userData.idlePose, undefined, 'reduced motion: aus');
  const g = { userData: { idlePose: { sy: 1.01, sxz: .995, rx: .003, rz: -.002 } }, scale: { x: 1, y: 1, z: 1 }, rotation: { x: 0, z: 0 } };
  assert.ok(applyIdlePose(g)); assert.equal(g.scale.y, 1.01); assert.equal(g.rotation.z, -.002);
});
