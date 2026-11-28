import test from 'node:test';
import assert from 'node:assert/strict';
import {createHost} from '../game/fusion-core.mjs';
import {bundleFusionWorkerSource} from '../game/fusion-worker-boot.mjs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const G={
  width:1.86,height:1.2558,dome:.1274,footClip:.182,
  rimExpansion:.028,topIndent:.1456,dimpleOffset:[.045,-.035],dimpleAspect:[1.08,.96],
  dimpleFalloff:2.65,dimpleSkew:.12,ringExponent:.65,verticalExponent:.5,crossExponent:.5,
};

test('init ohne warm liefert die Tabellen', () => {
  const msgs=[];
  const handle=createHost(msg=>msgs.push(msg));
  handle({type:'init',G,warm:false});
  assert.equal(msgs.length,1);
  assert.equal(msgs[0].type,'tables');
  assert.ok(msgs[0].R0?.length>0);
});

test('Worker-Bundle entfernt den ESM-Import und behält createHost', () => {
  const dir=dirname(fileURLToPath(import.meta.url));
  const core=readFileSync(join(dir,'../game/fusion-core.mjs'),'utf8');
  const worker=readFileSync(join(dir,'../game/fusion-worker.mjs'),'utf8');
  const bundled=bundleFusionWorkerSource(core,worker);
  assert.equal(bundled.includes("from './fusion-core.mjs"), false);
  assert.match(bundled,/export function createHost/);
  assert.match(bundled,/const handle=createHost/);
  assert.throws(()=>bundleFusionWorkerSource(core,'no import here'));
});
