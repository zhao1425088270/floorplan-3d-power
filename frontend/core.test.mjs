import test from 'node:test';
import assert from 'node:assert/strict';
import {newFurniture,calibration,snapFurniture,clone,History,validateDocument,demoDocument,emptyDocument} from './core.mjs';

test('calibration uses actual millimeters and rejects coincident points',()=>{
  assert.equal(calibration({x:0,z:0},{x:0,z:620},9255),9255/620);
  assert.throws(()=>calibration({x:0,z:0},{x:0,z:0},1000));
  assert.throws(()=>calibration({x:0,z:0},{x:100,z:0},-10));
});
test('furniture physical dimensions survive a scale change',()=>{
  const d=demoDocument();d.furniture.push(newFurniture('bed',400,500));
  const width=d.furniture.at(-1).width,oldPixels=width/d.mmPerPixel;d.mmPerPixel=20;
  assert.equal(d.furniture.at(-1).width,1800);assert.equal(width/d.mmPerPixel,oldPixels/2);
});
test('wall snapping considers rotated width and depth',()=>{
  const d=emptyDocument();d.plan.walls=[{id:'wall',x1:0,z1:0,x2:0,z2:1000,thickness:20}];
  const f=newFurniture('sofa',57,500);f.rotation=90;
  assert.ok(Math.abs(snapFurniture(f,d,false,true).x-55)<1e-8);
  assert.equal(snapFurniture(f,d,false,false).x,57);
});
test('one drag history record restores original and supports redo',()=>{
  const h=new History(),before=demoDocument(),after=clone(before);after.furniture[0].x+=50;
  h.push(before,after);before.furniture[0].x=99999;
  const restored=h.undo(after);assert.notEqual(restored.furniture[0].x,99999);
  assert.equal(h.redo(restored).furniture[0].x,after.furniture[0].x);
});
test('a new edit clears redo and unchanged updates do not create history',()=>{
  const h=new History(),a=demoDocument(),b=clone(a);b.title='edited';h.push(a,b);h.undo(b);
  const c=clone(a);c.title='new';h.push(a,c);assert.equal(h.redo(c),null);assert.equal(h.push(c,c),false);
});
test('scheme round trip retains furniture, regions, measurements and calibration',()=>{
  const d=demoDocument();d.measurements=[{id:'measure',x1:0,z1:1,x2:22,z2:30}];
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(d))),d);
});
test('reject corrupt files before replacing the current plan',()=>{
  for(const mutate of [d=>d.furniture[0].width=-1,d=>d.mmPerPixel=0,d=>d.image='https://example.com/tracker',d=>d.furniture[0].color='bad',d=>d.furniture[0].id=d.plan.walls[0].id,d=>d.plan.walls[0].x1=null]){
    const d=demoDocument();mutate(d);assert.throws(()=>validateDocument(d));
  }
});
