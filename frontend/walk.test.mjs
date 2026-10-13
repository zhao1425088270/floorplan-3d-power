import test from 'node:test';
import assert from 'node:assert/strict';
import {walkDelta} from './walk.mjs';
test('forward and strafe follow the horizontal viewing direction',()=>{
  const forward=walkDelta({x:0,z:-1},1,0,.05,2),right=walkDelta({x:0,z:-1},0,1,.05,2);
  assert.deepEqual(forward,{x:0,z:-.1});assert.equal(right.x,.1);assert.equal(right.z,0);
  const turned=walkDelta({x:1,z:0},1,0,.05,2);assert.equal(turned.x,.1);assert.equal(turned.z,0);
});
test('backwards reverses forward movement and looking down does not change speed',()=>{
  const a=walkDelta({x:.3,z:-.4},1,0,.02),b=walkDelta({x:.3,z:-.4},-1,0,.02);
  assert.equal(a.x,-b.x);assert.equal(a.z,-b.z);assert.ok(Math.abs(Math.hypot(a.x,a.z)-.028)<1e-10);
});
test('diagonal movement is normalized and resume after a pause cannot jump',()=>{
  const d=walkDelta({x:0,z:-1},1,1,.05,2);assert.ok(Math.abs(Math.hypot(d.x,d.z)-.1)<1e-10);
  assert.deepEqual(walkDelta({x:0,z:-1},1,0,20,2),walkDelta({x:0,z:-1},1,0,.05,2));
});
