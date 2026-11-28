import test from 'node:test';
import assert from 'node:assert/strict';
import {renderCaps,createQualityGovernor} from '../game/render-quality.mjs';

test('iPhone rendert mit voller 3x-Dichte, Minimum 2x', () => {
  assert.deepEqual(renderCaps({dpr:3,ios:true,mobile:true}),{maximum:3,minimum:2});
  assert.deepEqual(renderCaps({dpr:2,ios:true,mobile:true}),{maximum:2,minimum:2});
  assert.deepEqual(renderCaps({dpr:2,mobile:false}),{maximum:2,minimum:1.5});
  assert.deepEqual(renderCaps({dpr:3,ios:true,mobile:true,lostCap:2.5}),{maximum:2.5,minimum:2});
});

test('Native App begrenzt die Dichte auf 2x (MSAA bleibt)', () => {
  assert.deepEqual(renderCaps({dpr:3,ios:true,mobile:true,appShell:true}),{maximum:2,minimum:2});
  assert.deepEqual(renderCaps({dpr:2,ios:true,mobile:true,appShell:true}),{maximum:2,minimum:2});
  // Web without appShell stays at 3x.
  assert.deepEqual(renderCaps({dpr:3,ios:true,mobile:true,appShell:false}),{maximum:3,minimum:2});
});

const run=(g,ms,frames,{rendered=true,settled=true,start=0}={})=>{let t=start,v;for(let i=0;i<frames;i++){t+=ms/1000;v=g.sample(ms/1000,t,{rendered,settled});}return {v,t};};

test('Dichte bleibt bei flüssigen Frames und einzelnen Hängern', () => {
  const g=createQualityGovernor({maximum:3,minimum:2,mobile:true});
  assert.equal(run(g,16,400).v,3);
  // Single hitches (> 120 ms) and frames without rendering do not count.
  for(let i=0;i<20;i++)g.sample(.5,100+i,{rendered:true});
  assert.equal(run(g,60,400,{rendered:false,start:200}).v,3);
});

test('Nur echte Dauerlast senkt die Dichte, danach Erholung', () => {
  const g=createQualityGovernor({maximum:3,minimum:2,mobile:true});
  let {v,t}=run(g,40,200);
  assert.equal(v,2.75);
  // Not while the board is moving (settled=false).
  const h=createQualityGovernor({maximum:3,minimum:2,mobile:true});
  assert.equal(run(h,40,300,{settled:false}).v,3);
  // Never below the minimum.
  for(let i=0;i<10;i++)({v,t}=run(g,40,200,{start:t+10}));
  assert.equal(v,2);
  ({v}=run(g,12,300,{start:t+10}));
  assert.equal(v,2.25);
});
